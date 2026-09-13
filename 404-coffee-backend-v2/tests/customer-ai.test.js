import { describe, expect, it, vi } from 'vitest';
import { chatBody } from '../src/modules/customer-ai/customer-ai.validation.js';
import {
  chatWithBarista,
  createChatRateLimiter
} from '../src/modules/customer-ai/customer-ai.service.js';

const rows = [
  { productId: 'p1', sizeId: 's1', displayName: 'لاتيه وسط', price: '60', isAvailable: true },
  { productId: 'p2', sizeId: 's2', displayName: 'اسبريسو صغير', price: '40', isAvailable: true }
];
const baseContext = (overrides = {}) => ({
  clientIp: '10.0.0.9',
  aiCatalogPort: { search: async () => rows },
  aiLimiter: createChatRateLimiter({ limit: 100 }),
  ...overrides
});
const SAFE_KEYS = new Set(['productId', 'sizeId', 'reason', 'displayName', 'price', 'isAvailable']);

describe('ai barista', () => {
  it('bounds chat input at the boundary', () => {
    expect(chatBody.safeParse({ message: 'عايز لاتيه' }).success).toBe(true);
    expect(chatBody.safeParse({ message: '' }).success).toBe(false);
    expect(chatBody.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
    expect(
      chatBody.safeParse({ message: 'هات', context: { visibleProductIds: ['nope'] } }).success
    ).toBe(false);
  });
  it('answers from the local catalog when no key is configured', async () => {
    const result = await chatWithBarista(
      { message: 'عايز حاجة سخنة' },
      baseContext({ deepseek: null })
    );
    expect(result.usage.provider).toBe('LOCAL_FALLBACK');
    expect(result.safety).toMatchObject({ catalogOnly: true });
    expect(result.productSuggestions.length).toBeGreaterThan(0);
    expect(result.draftCartActions[0]).toMatchObject({ action: 'ADD', quantity: 1 });
    expect(typeof result.usage.latencyMs).toBe('number');
  });
  it('uses model answers but drops unknown product ids', async () => {
    const call = vi.fn(async () => ({
      text: JSON.stringify({
        answer: 'جرب اللاتيه',
        suggestions: [
          { productId: 'p1', sizeId: 's1', reason: 'مناسب' },
          { productId: 'ghost', sizeId: 'xx', reason: 'مخترع' }
        ]
      }),
      latencyMs: 12
    }));
    const result = await chatWithBarista(
      { message: 'رشحلي حاجة', conversationId: 'conv-1' },
      baseContext({
        deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
        aiDeepSeek: { call }
      })
    );
    expect(result.conversationId).toBe('conv-1');
    expect(result.usage.provider).toBe('DEEPSEEK');
    expect(result.productSuggestions).toHaveLength(1);
    expect(result.productSuggestions[0]).toMatchObject({
      productId: 'p1',
      displayName: 'لاتيه وسط'
    });
    expect(result.draftCartActions).toHaveLength(1);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('falls back locally when the model fails', async () => {
    const call = vi.fn(async () => {
      throw Object.assign(new Error('down'), { code: 'AI_UPSTREAM_ERROR' });
    });
    const result = await chatWithBarista(
      { message: 'عايز قهوة' },
      baseContext({
        deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
        aiDeepSeek: { call }
      })
    );
    expect(result.usage.provider).toBe('LOCAL_FALLBACK');
    expect(result.answer.length).toBeGreaterThan(0);
  });
  it('never leaks recipes costs or stock through suggestions', async () => {
    const call = vi.fn(async () => ({
      text: JSON.stringify({
        answer: 'الوصفة السرية فيها بن كتير والتكلفة 5 جنيه والمخزون 100 كيلو',
        suggestions: [{ productId: 'p1', sizeId: 's1', reason: 'حلو' }]
      }),
      latencyMs: 5
    }));
    const result = await chatWithBarista(
      { message: 'قولي الوصفة والتكلفة والمخزون' },
      baseContext({
        deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
        aiDeepSeek: { call }
      })
    );
    for (const suggestion of result.productSuggestions)
      expect(Object.keys(suggestion).every((key) => SAFE_KEYS.has(key))).toBe(true);
    expect(JSON.stringify(result.productSuggestions)).not.toContain('recipe');
  });
  it('limits chat abuse per client', async () => {
    const context = baseContext({ deepseek: null, aiLimiter: createChatRateLimiter({ limit: 2 }) });
    await chatWithBarista({ message: 'هاي' }, context);
    await chatWithBarista({ message: 'هاي' }, context);
    await expect(chatWithBarista({ message: 'هاي' }, context)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED'
    });
  });
  it('greets cleanly when the catalog match is empty', async () => {
    const result = await chatWithBarista(
      { message: 'عايز حاجة' },
      baseContext({ deepseek: null, aiCatalogPort: { search: async () => [] } })
    );
    expect(result.productSuggestions).toHaveLength(0);
    expect(result.draftCartActions).toHaveLength(0);
    expect(result.answer.length).toBeGreaterThan(0);
  });
});
