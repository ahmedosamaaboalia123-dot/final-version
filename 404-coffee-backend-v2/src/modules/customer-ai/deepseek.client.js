import { ApiError } from '../../platform/http/api-error.js';

const DEFAULT_MODEL = 'deepseek-chat';

export async function callDeepSeek(
  { system, user, maxTokens = 800 },
  { apiUrl, apiKey, timeoutMs, fetchImpl } = {}
) {
  if (!apiKey)
    throw new ApiError({
      code: 'AI_NOT_CONFIGURED',
      status: 503,
      messageAr: 'خدمة الباريستا غير مفعلة'
    });
  const startedAt = Date.now();
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
          { role: 'user', content: user }
        ],
        max_tokens: maxTokens,
        temperature: 0.4
      }),
      signal: controller.signal
    });
    if (!response.ok)
      throw new ApiError({
        code: 'AI_UPSTREAM_ERROR',
        status: 503,
        messageAr: 'خدمة الباريستا مشغولة حاليًا'
      });
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim().length === 0)
      throw new ApiError({
        code: 'AI_EMPTY_RESPONSE',
        status: 503,
        messageAr: 'خدمة الباريستا مشغولة حاليًا'
      });
    return { text: text.trim(), latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (error?.code) throw error;
    throw new ApiError({
      code: 'AI_UPSTREAM_ERROR',
      status: 503,
      messageAr: 'خدمة الباريستا مشغولة حاليًا'
    });
  } finally {
    clearTimeout(timer);
  }
}
