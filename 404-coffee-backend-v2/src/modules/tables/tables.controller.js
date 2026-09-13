import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { itemDto } from '../orders/order.mapper.js';
import { rotateTableQr } from '../table-experience/table-experience.public-service.js';
import {
  addSessionItems,
  cancelTableSession,
  closeTableSession,
  openTableOrder,
  setTableStatus
} from './tables.service.js';
import {
  getSessionDetails,
  getSessionPrintData,
  getTableDetails,
  getTablesBoard
} from './tables.queries.js';
import { sessionDto, tableDto } from './tables.mapper.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createTablesController(d) {
  return {
    board: async (r, s) => sendSuccess(s, await getTablesBoard(ctx(r, d))),
    table: async (r, s) => sendSuccess(s, await getTableDetails(r.validated.params.id, ctx(r, d))),
    status: async (r, s) =>
      sendSuccess(s, {
        table: tableDto(await setTableStatus(r.validated.params.id, r.validated.body, ctx(r, d)))
      }),
    openOrder: async (r, s) => {
      const result = await openTableOrder(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendCreated(s, {
        table: tableDto(result.table),
        session: sessionDto(result.session),
        order: { id: String(result.order._id), orderNumber: result.order.orderNumber },
        items: result.items.map(itemDto),
        totals: result.totals
      });
    },
    session: async (r, s) =>
      sendSuccess(s, await getSessionDetails(r.validated.params.id, ctx(r, d))),
    addItems: async (r, s) => {
      const result = await addSessionItems(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        session: sessionDto(result.session),
        addedItems: result.addedItems.map(itemDto),
        totals: result.totals,
        progress: result.progress
      });
    },
    cancel: async (r, s) => {
      const result = await cancelTableSession(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        session: sessionDto(result.session),
        order: { id: String(result.order._id), status: result.order.status }
      });
    },
    close: async (r, s) => {
      const result = await closeTableSession(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        table: result.table ? tableDto(result.table) : null,
        session: sessionDto(result.session),
        order: { id: String(result.order._id), status: result.order.status },
        payment: result.payment,
        invoice: result.invoice
      });
    },
    print: async (r, s) =>
      sendSuccess(s, await getSessionPrintData(r.validated.params.id, ctx(r, d))),
    rotateQr: async (r, s) => {
      const result = await rotateTableQr(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        table: tableDto(result.table),
        qrSecret: result.qrSecret,
        qrVersion: result.qrVersion
      });
    }
  };
}
