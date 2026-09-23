import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { toAccountDto, toEntryDto, toSupplierDto } from './supplier.mapper.js';
import { getSupplierDetails, getSuppliersScreen, listSupplierEntries } from './supplier.queries.js';
import {
  createSupplier,
  createSupplierAccountEntry,
  deleteSupplier,
  deleteSupplierEntry,
  reverseSupplierEntry,
  updateSupplierEntry,
  updateSupplier
} from './supplier.service.js';

const contextFrom = (req, dependencies) => ({
  ...req.auth,
  currency: dependencies.config.business.currency,
  operationRequestId: req.operationRequestId,
  ...dependencies.serviceContext
});
const cashDto = (value) =>
  value
    ? {
        id: String(value.id ?? value._id),
        direction: value.direction,
        amount: value.amount,
        balanceAfter: value.balanceAfter
      }
    : null;
export function createSupplierController(dependencies) {
  return {
    screen: async (req, res) =>
      sendSuccess(
        res,
        await getSuppliersScreen(req.validated.query, contextFrom(req, dependencies))
      ),
    create: async (req, res) => {
      const result = await createSupplier(req.validated.body, contextFrom(req, dependencies));
      return sendCreated(res, {
        supplier: toSupplierDto(result.supplier),
        account: toAccountDto(result.account)
      });
    },
    details: async (req, res) =>
      sendSuccess(
        res,
        await getSupplierDetails(
          req.validated.params.id,
          String(req.query.include ?? '')
            .split(',')
            .filter(Boolean),
          contextFrom(req, dependencies)
        )
      ),
    update: async (req, res) => {
      const result = await updateSupplier(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, { supplier: toSupplierDto(result.supplier) });
    },
    deleteSupplier: async (req, res) => sendSuccess(res, await deleteSupplier(req.validated.params.id, req.validated.body, contextFrom(req, dependencies))),
    createEntry: async (req, res) => {
      const result = await createSupplierAccountEntry(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendCreated(res, {
        entry: toEntryDto(result.entry),
        account: toAccountDto(result.account),
        drawerTransaction: cashDto(result.drawerTransaction)
      });
    },
    entries: async (req, res) =>
      sendSuccess(
        res,
        await listSupplierEntries(
          req.validated.params.id,
          req.validated.query,
          contextFrom(req, dependencies)
        )
      ),
    reverse: async (req, res) => {
      const result = await reverseSupplierEntry(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendCreated(res, {
        originalEntry: toEntryDto(result.originalEntry),
        reversalEntry: toEntryDto(result.reversalEntry),
        account: toAccountDto(result.account),
        drawerTransaction: cashDto(result.drawerTransaction)
      });
    },
    deleteEntry: async (req, res) => {
      const result = await deleteSupplierEntry(req.validated.params.id, req.validated.body, contextFrom(req, dependencies));
      return sendSuccess(res, { originalEntry: toEntryDto(result.originalEntry), reversalEntry: toEntryDto(result.reversalEntry), account: toAccountDto(result.account), drawerTransaction: cashDto(result.drawerTransaction) });
    },
    updateEntry: async (req, res) => {
      const result = await updateSupplierEntry(req.validated.params.id, req.validated.body, contextFrom(req, dependencies));
      return sendSuccess(res, { originalEntry: toEntryDto(result.originalEntry), reversalEntry: toEntryDto(result.reversalEntry), replacementEntry: toEntryDto(result.replacementEntry), account: toAccountDto(result.account), drawerTransactions: result.drawerTransactions.map(cashDto) });
    }
  };
}
