import { ApiError } from '../../platform/http/api-error.js';

const DEFAULT_MODEL = 'deepseek-chat';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callDeepSeek(
  { system, user, history = [], maxTokens = 800 },
  { apiUrl, apiKey, timeoutMs, fetchImpl } = {}
) {
  if (!apiKey)
    throw new ApiError({
      code: 'AI_NOT_CONFIGURED',
      status: 503,
      messageAr: 'خدمة الباريستا غير مفعلة'
    });
  const startedAt = Date.now();
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (fetchImpl ?? fetch)(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            { role: 'system', content: system },
            ...history,
            { role: 'user', content: user }
          ],
          max_tokens: maxTokens,
          temperature: 0.75,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        lastError = new Error(`DeepSeek HTTP ${response.status}`);
        if (RETRYABLE_STATUSES.has(response.status) && attempt < 3) {
          await wait(150 * attempt + Math.floor(Math.random() * 100));
          continue;
        }
        throw lastError;
      }
      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim().length === 0) {
        lastError = new Error('DeepSeek returned an empty response');
        if (attempt < 3) {
          await wait(100 * attempt);
          continue;
        }
        throw lastError;
      }
      return { text: text.trim(), latencyMs: Date.now() - startedAt };
    } catch (error) {
      lastError = error;
      if (attempt < 3 && !error?.code) {
        await wait(150 * attempt + Math.floor(Math.random() * 100));
        continue;
      }
      if (error?.code) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ApiError({
    code: 'AI_UPSTREAM_ERROR',
    status: 503,
    messageAr: 'خدمة الباريستا مشغولة حاليًا',
    retryable: true,
    cause: lastError
  });
}
