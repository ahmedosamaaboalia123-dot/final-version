import { normalizeName } from '../../shared/utils/normalize-name.js';
import { getCatalog } from '../products/catalog.queries.js';

const STOP_WORDS = new Set(
  'عايز عايزة بدي ممكن ايه ايش فيه في من على هل لو سمحت من فضلك كام بكام سعر عروض عرض جديد'.split(
    ' '
  )
);

function keywordsOf(message) {
  return [
    ...new Set(
      normalizeName(message)
        .split(/[^؀-ۿa-z0-9]+/u)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    )
  ].slice(0, 8);
}

export async function searchVisibleProducts({ query, ids, limit = 6 } = {}, context = {}) {
  const search = context.aiCatalogPort?.search ?? getCatalog;
  const catalog = await search({ search: undefined, page: 1, limit: 100 }, context);
  const flat = [];
  for (const product of catalog.items ?? []) {
    for (const type of product.types ?? []) {
      for (const size of type.sizes ?? []) {
        flat.push({
          productId: product.id,
          typeId: type.id,
          sizeId: size.id,
          displayName: `${product.name} ${size.name}`,
          productName: product.name,
          typeName: type.name,
          sizeName: size.name,
          price: size.price,
          currency: size.currency ?? 'EGP',
          isAvailable: product.isAvailable !== false
        });
      }
    }
  }
  let rows = flat;
  if (ids && ids.length > 0) {
    const wanted = new Set(ids.map(String));
    rows = rows.filter((row) => wanted.has(String(row.productId)));
  }
  if (query) {
    const keywords = keywordsOf(query);
    if (keywords.length > 0)
      rows = rows
        .map((row) => ({
          row,
          score: keywords.filter((word) => normalizeName(row.displayName).includes(word)).length
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.row);
  }
  return rows.slice(0, limit);
}
