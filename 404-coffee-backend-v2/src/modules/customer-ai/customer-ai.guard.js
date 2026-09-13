export function sanitizeMessage(message) {
  return String(message ?? '')
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

export function assertSafeToolCall(name) {
  if (name !== 'searchVisibleProducts')
    throw Object.assign(new Error('tool not allowed'), { code: 'AI_TOOL_FORBIDDEN' });
  return name;
}

export function validateSuggestions(suggestions, candidates) {
  const byKey = new Map(candidates.map((row) => [`${row.productId}:${row.sizeId}`, row]));
  const seen = new Set();
  const valid = [];
  for (const suggestion of suggestions ?? []) {
    const key = `${suggestion?.productId}:${suggestion?.sizeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byKey.get(key);
    if (!row) continue;
    valid.push({
      productId: row.productId,
      sizeId: row.sizeId,
      reason:
        typeof suggestion?.reason === 'string' && suggestion.reason.trim().length > 0
          ? suggestion.reason.trim().slice(0, 200)
          : `ترشيح مناسب: ${row.displayName}`,
      displayName: row.displayName,
      price: row.price,
      isAvailable: row.isAvailable
    });
    if (valid.length >= 3) break;
  }
  return valid;
}

export function buildDraftActions(suggestions) {
  return suggestions.slice(0, 3).map((suggestion) => ({
    action: 'ADD',
    productId: suggestion.productId,
    sizeId: suggestion.sizeId,
    quantity: 1
  }));
}

export function buildFallbackAnswer(candidates) {
  if (candidates.length === 0)
    return 'أهلًا بيك في 404! قولي مزاجك إيه النهاردة (قهوة مختصة، حاجة ساقعة، ولا حلو) وأرشحلك من المينيو.';
  const lines = candidates.slice(0, 3).map((row) => `- ${row.displayName} بسعر ${row.price}`);
  return `دي ترشيحاتي ليك من المينيو:\n${lines.join('\n')}\nتحب أضيف حاجة منهم للسلة؟`;
}
