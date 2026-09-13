import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { itemDto, orderDto } from './order.mapper.js';
import {
  appendOrderItems,
  cancelOrderItem,
  cancelWholeOrder,
  completeTakeawayOrder,
  confirmNewOrder,
  markOrderItemReady
} from './order.service.js';
import { getOrderDetails, getOrderHistoryScreen, getOrdersOnlineScreen } from './order.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createOrderController(d) {
  return {
    confirm: async (r, s) => {
      const result = await confirmNewOrder(r.validated.body, ctx(r, d));
      return sendCreated(s, {
        order: orderDto(result.order),
        items: result.items.map(itemDto),
        totals: result.totals,
        allocationsSummary: result.allocationsSummary,
        tracking: result.tracking,
        customer: result.customer
      });
    },
    screen: async (r, s) =>
      sendSuccess(s, await getOrdersOnlineScreen(r.validated.query, ctx(r, d))),
    history: async (r, s) =>
      sendSuccess(s, await getOrderHistoryScreen(r.validated.query, ctx(r, d))),
    details: async (r, s) => {
      const include = Object.fromEntries(
        String(r.validated.query.include ?? '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => [part, true])
      );
      return sendSuccess(s, await getOrderDetails(r.validated.params.id, include, ctx(r, d)));
    },
    print: async (r, s) =>
      sendSuccess(
        s,
        await d.serviceContext.ordersPort.getInvoicePayload(r.validated.params.id, ctx(r, d))
      ),
    append: async (r, s) => {
      const result = await appendOrderItems(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        order: orderDto(result.order),
        addedItems: result.addedItems.map(itemDto),
        totals: result.totals,
        progress: result.progress
      });
    },
    cancelItem: async (r, s) => {
      const result = await cancelOrderItem(
        r.validated.params.id,
        r.validated.params.itemId,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        order: orderDto(result.order),
        item: itemDto(result.item),
        restoredAllocations: result.restoredAllocations,
        refundImpact: result.refundImpact,
        totals: result.totals,
        progress: result.progress
      });
    },
    cancel: async (r, s) => {
      const result = await cancelWholeOrder(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        order: orderDto(result.order),
        restoredAllocations: result.restoredAllocations,
        refundCase: result.refundCase
      });
    },
    completeTakeaway: async (r, s) => {
      const result = await completeTakeawayOrder(
        r.validated.params.id,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        order: orderDto(result.order),
        payment: result.payment,
        invoice: result.invoice
      });
    },
    markReady: async (r, s) => {
      const result = await markOrderItemReady(
        r.validated.params.itemId,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        item: itemDto(result.item),
        order: result.order
      });
    }
  };
}
