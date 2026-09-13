const stable = (value) => JSON.stringify(value);

function sameOptions(wanted, existing) {
  for (const key of ['unique', 'sparse', 'expireAfterSeconds']) {
    if (Boolean(wanted[key]) !== Boolean(existing[key])) return false;
  }
  if (
    stable(wanted.partialFilterExpression ?? null) !==
    stable(existing.partialFilterExpression ?? null)
  )
    return false;
  return true;
}

function sameKeys(wanted, existing) {
  return stable(wanted) === stable(existing);
}

export function calculateIndexDiff(manifest, existingByCollection) {
  const missing = [];
  const extra = [];
  const mismatched = [];
  const seen = new Set();
  for (const wanted of manifest) {
    const existing = existingByCollection[wanted.collection] ?? [];
    const match = existing.find((index) => sameKeys(wanted.keys, index.keys ?? index.key));
    if (!match) {
      missing.push(wanted);
      continue;
    }
    seen.add(`${wanted.collection}:${stable(wanted.keys)}`);
    if (!sameOptions(wanted.options ?? {}, match)) mismatched.push({ wanted, existing: match });
  }
  for (const [collection, indexes] of Object.entries(existingByCollection)) {
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      const id = `${collection}:${stable(index.keys ?? index.key)}`;
      if (!seen.has(id)) extra.push({ collection, keys: index.keys ?? index.key });
    }
  }
  return { missing, extra, mismatched, ok: missing.length === 0 && mismatched.length === 0 };
}
