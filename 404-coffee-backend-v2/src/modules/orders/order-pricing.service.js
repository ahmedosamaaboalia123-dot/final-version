import {
  add,
  compare,
  multiply,
  roundMoney,
  subtract,
  toApiString
} from '../../platform/database/decimal.js';
import { snapshotForOrder } from '../products/product.public-service.js';

export async function priceOrderItems(inputItems, fulfillmentType, context = {}) {
  const snapshot = context.productsPort?.snapshot ?? snapshotForOrder;
  const priced = [];
  for (const input of inputItems) {
    const snap = await snapshot(
      { productId: input.productId, productSizeId: input.productSizeId, addonIds: input.addonIds },
      context
    );
    const addonTotal = snap.addons.reduce((sum, addon) => add(sum, addon.price), '0');
    const unitPrice = add(snap.unitSellingPrice, addonTotal);
    const lineSubtotal = multiply(unitPrice, String(input.quantity));
    const requirements = snap.recipe.map((ingredient) => ({
      materialId: ingredient.materialId,
      quantitySmall: multiply(ingredient.quantitySmall, String(input.quantity))
    }));
    priced.push({
      input,
      snapshot: snap,
      unitSellingPrice: toApiString(unitPrice),
      lineSubtotal: toApiString(lineSubtotal),
      requirements,
      hasAddons: snap.addons.length > 0
    });
  }
  return { priced, fulfillmentType };
}

export function calculateOrderTotals(pricedItems, fulfillmentType, businessConfig = {}) {
  const subtotal = pricedItems.reduce((sum, item) => add(sum, item.lineSubtotal), '0');
  const discount = '0';
  const taxRate = businessConfig.taxRate ?? '0';
  const tax = roundMoney(multiply(subtotal, String(taxRate)));
  const deliveryFee =
    fulfillmentType === 'DELIVERY' ? String(businessConfig.deliveryFee ?? '0') : '0';
  const total = add(add(subtract(subtotal, discount), tax), deliveryFee);
  return {
    subtotal: toApiString(subtotal),
    discount: toApiString(discount),
    tax: toApiString(tax),
    deliveryFee: toApiString(deliveryFee),
    total: toApiString(total)
  };
}

export function calculateBalanceDue(total, paymentSummary) {
  const netPaid = subtract(paymentSummary?.netPaid ?? '0', '0');
  return toApiString(subtract(total, netPaid));
}

export function isFullyPaid(total, paymentSummary) {
  return compare(calculateBalanceDue(total, paymentSummary), '0') <= 0;
}
