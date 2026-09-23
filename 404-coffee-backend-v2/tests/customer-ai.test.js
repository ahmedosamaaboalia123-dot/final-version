import { describe, expect, it, vi } from 'vitest';
import { chatBody } from '../src/modules/customer-ai/customer-ai.validation.js';
import { searchVisibleProducts } from '../src/modules/customer-ai/product-catalog.tool.js';
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
  it('bounds chat input at the boundary', () => {    expect(chatBody.safeParse({ message: 'عايز لاتيه' }).success).toBe(true);
    expect(chatBody.safeParse({ message: '' }).success).toBe(false);
    expect(chatBody.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
    expect(
      chatBody.safeParse({ message: 'هات', context: { visibleProductIds: ['nope'] } }).success
    ).toBe(false);
  });
  it('answers from the local catalog when no key is configured', async () => {
    const result = await chatWithBarista(
      { message: 'عايز حاجة سخنة' },
      baseContext({ deepseek: null, allowLocalAiFallback: true })
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
  it('regenerates once when DeepSeek returns malformed JSON', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ text: 'رد غير منظم', latencyMs: 4 })
      .mockResolvedValueOnce({
        text: JSON.stringify({ answer: 'جرب اللاتيه', suggestions: [] }),
        latencyMs: 9
      });
    const result = await chatWithBarista(
      { message: 'رشحلي حاجة' },
      baseContext({
        deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
        aiDeepSeek: { call }
      })
    );
    expect(result.answer).toBe('جرب اللاتيه');
    expect(result.usage.provider).toBe('DEEPSEEK');
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('returns an availability error instead of a canned answer when DeepSeek fails', async () => {
    const call = vi.fn(async () => {
      throw Object.assign(new Error('down'), { code: 'AI_UPSTREAM_ERROR' });
    });
    await expect(
      chatWithBarista(
        { message: 'عايز قهوة' },
        baseContext({
          deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
          aiDeepSeek: { call }
        })
      )
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM_ERROR', status: 503 });
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
    const context = baseContext({ deepseek: null, allowLocalAiFallback: true, aiLimiter: createChatRateLimiter({ limit: 2 }) });
    await chatWithBarista({ message: 'هاي' }, context);
    await chatWithBarista({ message: 'هاي' }, context);
    await expect(chatWithBarista({ message: 'هاي' }, context)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED'
    });
  });
  it('greets cleanly when the catalog match is empty', async () => {
    const result = await chatWithBarista(
      { message: 'عايز حاجة' },
      baseContext({ deepseek: null, allowLocalAiFallback: true, aiCatalogPort: { search: async () => [] } })
    );
    expect(result.productSuggestions).toHaveLength(0);
    expect(result.draftCartActions).toHaveLength(0);
    expect(result.answer.length).toBeGreaterThan(0);
  });
  it('fetches the catalog within the pagination limits', async () => {
    const seen = [];
    const fakeCatalog = {
      products: [
        { id: 'p1', name: 'لاتيه', isAvailable: true, types: [{ id: 't1', name: 'سخن', sizes: [{ id: 's1', name: 'وسط', price: '60' }] }] }
      ]
    };
    const productModels = {
      Product: { find: () => ({ select: () => ({ lean: async () => [{ name: 'ماكياتو' }] }) }) }
    };
    const { rows, unavailable } = await searchVisibleProducts(
      { query: 'لاتيه' },
      { aiCatalogPort: { search: async (filters) => { seen.push(filters); return fakeCatalog; } }, productModels }
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].limit).toBeLessThanOrEqual(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: 'p1', sizeId: 's1' });
    expect(unavailable).toEqual(['ماكياتو']);
  });
  it('tells the model which items exist but are currently unavailable', async () => {
    const call = vi.fn(async () => ({
      text: JSON.stringify({ answer: 'تمام', suggestions: [] }),
      latencyMs: 5
    }));
    await chatWithBarista(
      { message: 'عايز ماكياتو' },
      baseContext({
        deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
        aiDeepSeek: { call },
        aiCatalogPort: {
          search: async () => ({ rows, unavailable: ['ماكياتو'], matched: true })
        }
      })
    );
    expect(call).toHaveBeenCalledTimes(1);
    const userMessage = call.mock.calls[0][0].user;
    expect(userMessage).toContain('ماكياتو');
    expect(userMessage).toContain('غير متاح');
  });

  it('lets DeepSeek interpret broad menu questions instead of forcing a missing-item template', async () => {
    const call = vi.fn(async () => ({
      text: JSON.stringify({ answer: 'عندنا لاتيه وإسبريسو، تحب سخن ولا بارد؟', suggestions: [] }),
      latencyMs: 8
    }));
    const result = await chatWithBarista(
      {
        message: 'اي اللي عندكو انهارده',
        history: [
          { role: 'user', content: 'مساء الخير' },
          { role: 'assistant', content: 'مساء النور، تحب تشرب إيه؟' },
          { role: 'user', content: 'اي اللي عندكو انهارده' }
        ]
      },
      baseContext({
        deepseek: { apiUrl: 'https://x', apiKey: 'k', timeoutMs: 8000 },
        aiDeepSeek: { call },
        aiCatalogPort: {
          search: async () => ({ rows, unavailable: [], matched: false })
        }
      })
    );
    expect(result.usage.provider).toBe('DEEPSEEK');
    const request = call.mock.calls[0][0];
    expect(request.user).toContain('قد يكون السؤال عامًا');
    expect(request.user).toContain('لاتيه وسط');
    expect(request.user).not.toContain('تنبيه مؤكد');
    expect(request.history).toEqual([
      { role: 'user', content: 'مساء الخير' },
      { role: 'assistant', content: 'مساء النور، تحب تشرب إيه؟' }
    ]);
  });

  it('requires DeepSeek in production instead of returning a canned local reply', async () => {
    await expect(
      chatWithBarista({ message: 'عندكم إيه؟' }, baseContext({ deepseek: null }))
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', status: 503 });
  });
});
