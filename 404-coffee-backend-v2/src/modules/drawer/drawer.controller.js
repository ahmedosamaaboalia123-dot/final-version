import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import {
  getDrawerScreen,
  getPrintData,
  getShift,
  listShifts,
  listShiftTransactions,
  listShiftAlerts
} from './drawer.queries.js';
import {
  closeShift,
  createManualMovement,
  openShift,
  shiftDto,
  transactionDto,
  reverseManualTransaction
} from './drawer.service.js';
const c = (r, d) => ({ ...r.auth, ...d.serviceContext });
export function createDrawerController(d) {
  return {
    screen: async (r, s) => sendSuccess(s, await getDrawerScreen(c(r, d))),
    list: async (r, s) => sendSuccess(s, await listShifts(r.validated.query, c(r, d))),
    details: async (r, s) => sendSuccess(s, await getShift(r.validated.params.id, c(r, d))),
    open: async (r, s) =>
      sendCreated(s, {
        shift: shiftDto(await openShift({ ...r.validated.body, scopeId: r.auth.actorId }, c(r, d)))
      }),
    cashIn: async (r, s) => {
      const x = await createManualMovement(
        r.validated.params.id,
        { ...r.validated.body, direction: 'IN' },
        c(r, d)
      );
      sendCreated(s, { transaction: transactionDto(x.transaction), shift: shiftDto(x.shift) });
    },
    cashOut: async (r, s) => {
      const x = await createManualMovement(
        r.validated.params.id,
        { ...r.validated.body, direction: 'OUT' },
        c(r, d)
      );
      sendCreated(s, { transaction: transactionDto(x.transaction), shift: shiftDto(x.shift) });
    },
    close: async (r, s) =>
      sendSuccess(s, {
        shift: shiftDto(await closeShift(r.validated.params.id, r.validated.body, c(r, d)))
      }),
    print: async (r, s) => sendSuccess(s, await getPrintData(r.validated.params.id, c(r, d))),
    transactions: async (r, s) =>
      sendSuccess(
        s,
        await listShiftTransactions(r.validated.params.id, r.validated.query, c(r, d))
      ),
    alerts: async (r, s) =>
      sendSuccess(s, await listShiftAlerts(r.validated.params.id, r.validated.query, c(r, d))),
    reverse: async (r, s) => {
      const x = await reverseManualTransaction(r.validated.params.id, r.validated.body, c(r, d));
      sendSuccess(s, {
        originalId: r.validated.params.id,
        reversal: transactionDto(x.transaction),
        shift: shiftDto(x.shift)
      });
    }
  };
}
