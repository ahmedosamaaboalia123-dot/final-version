import { randomUUID } from 'node:crypto';
import { ApiError } from '../../platform/http/api-error.js';
import { callDeepSeek } from './deepseek.client.js';
import { searchVisibleProducts } from './product-catalog.tool.js';
import {
  assertSafeToolCall,
  buildDraftActions,
  buildFallbackAnswer,
  sanitizeMessage,
  validateSuggestions
} from './customer-ai.guard.js';

const SYSTEM_PROMPT = [
  'أنت باريستا 404 الذكي. تتكلم مصري ودود ومختصر.',
  'مسموح لك فقط بترشيح أصناف من قائمة المينيو المعطاة بأسمائها وأسعارها.',
  'ممنوع تمامًا: اختراع أصناف أو أسعار، أو ذكر وصفات أو مكونات أو تكاليف أو مخزون أو بيانات عملاء أو طلبات.',
  'رد بصيغة JSON فقط: {"answer": "...", "suggestions": [{"productId": "...", "sizeId": "...", "reason": "..."}]}.'
].join(' ');

function createChatRateLimiter({ limit = 20, windowMs = 60 * 1000 } = {}) {
  const buckets = new Map();
  return {
    check(key) {
      const at = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || at >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: at + windowMs });
        return;
      }
      bucket.count += 1;
      if (bucket.count > limit)
        throw new ApiError({
          code: 'AI_RATE_LIMITED',
          status: 429,
          messageAr: 'رسائل كتير، استنى دقيقة وحاول تاني',
          retryable: true
        });
    }
  };
}

export const chatRateLimiter = createChatRateLimiter();

function parseModelReply(text) {
  const fenced = text.match(/```json([\s\S]*?)```/i) ?? text.match(/```([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed;
}

export async function chatWithBarista(input, context = {}) {
  const limiter = context.aiLimiter ?? chatRateLimiter;
  limiter.check(context.clientIp ?? 'unknown');
  const message = sanitizeMessage(input.message);
  if (!message)
    throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, messageAr: 'الرسالة فارغة' });
  const search = context.aiCatalogPort?.search ?? searchVisibleProducts;
  assertSafeToolCall('searchVisibleProducts');
  const candidates = await search(
    { query: message, ids: input.context?.visibleProductIds, limit: 6 },
    context
  );
  const startedAt = Date.now();
  const deepseek = context.deepseek ?? context.serviceContext?.deepseek;
  if (deepseek?.apiKey) {
    try {
      const call = context.aiDeepSeek?.call ?? callDeepSeek;
      const cartLines = (input.context?.cartSummary ?? [])
        .map((line) => `${line.productId}:${line.sizeId}×${line.quantity}`)
        .join(', ');
      const catalogLines = candidates
        .map((row) => `${row.productId}|${row.sizeId}|${row.displayName}|${row.price}`)
        .join('\n');
      const { text, latencyMs } = await call(
        {
          system: SYSTEM_PROMPT,
          user: `المنيو:\n${catalogLines}\nالسلة: ${cartLines || 'فارغة'}\nالعميل: ${message}`
        },
        {
          apiUrl: deepseek.apiUrl,
          apiKey: deepseek.apiKey,
          timeoutMs: deepseek.timeoutMs,
          fetchImpl: context.aiFetch
        }
      );
      const parsed = parseModelReply(text);
      const suggestions = validateSuggestions(parsed?.suggestions, candidates);
      return {
        conversationId: input.conversationId ?? randomUUID(),
        answer:
          typeof parsed?.answer === 'string' && parsed.answer.trim().length > 0
            ? parsed.answer.trim().slice(0, 2000)
            : buildFallbackAnswer(candidates),
        productSuggestions: suggestions,
        draftCartActions: buildDraftActions(suggestions),
        usage: { provider: 'DEEPSEEK', latencyMs },
        safety: { catalogOnly: true }
      };
    } catch {
      // Fall through to the local catalog fallback below.
    }
  }
  const suggestions = validateSuggestions(
    candidates.map((row) => ({ productId: row.productId, sizeId: row.sizeId, reason: '' })),
    candidates
  );
  return {
    conversationId: input.conversationId ?? randomUUID(),
    answer: buildFallbackAnswer(candidates),
    productSuggestions: suggestions,
    draftCartActions: buildDraftActions(suggestions),
    usage: { provider: 'LOCAL_FALLBACK', latencyMs: Date.now() - startedAt },
    safety: { catalogOnly: true }
  };
}

export { createChatRateLimiter };
