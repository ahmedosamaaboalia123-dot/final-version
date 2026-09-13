import { toApiString } from '../../platform/database/decimal.js';

export const orderDto = (order) => ({
  id: String(order._id),
  orderNumber: order.orderNumber,
  publicOrderNumber: order.publicOrderNumber,
  barcodeValue: order.barcodeValue ?? null,
  fulfillmentType: order.fulfillmentType,
  channel: order.channel,
  customer: { name: order.customerName, phone: order.customerPhone },
  status: order.status,
  totals: {
    subtotal: toApiString(order.subtotal),
    discount: toApiString(order.discount),
    tax: toApiString(order.tax),
    deliveryFee: toApiString(order.deliveryFee),
    total: toApiString(order.total)
  },
  actualInventoryCost: toApiString(order.actualInventoryCost),
  actualProfit: toApiString(order.actualProfit),
  balanceDue: toApiString(order.balanceDue),
  paymentStatus: order.paymentStatus,
  customerReceiptStatus: order.customerReceiptStatus,
  costCompleteness: order.costCompleteness,
  eventSequence: order.eventSequence,
  createdAt: order.createdAt ?? null,
  version: order.version ?? 0
});

export const itemDto = (item) => ({
  id: String(item._id),
  orderId: String(item.orderId),
  lineNo: item.lineNo,
  productName: item.productName,
  typeName: item.typeName,
  sizeName: item.sizeName,
  unitSellingPrice: toApiString(item.unitSellingPrice),
  quantity: item.quantity,
  lineSubtotal: toApiString(item.lineSubtotal),
  actualInventoryCost: toApiString(item.actualInventoryCost),
  actualProfit: toApiString(item.actualProfit),
  status: item.status,
  version: item.version ?? 0
});
