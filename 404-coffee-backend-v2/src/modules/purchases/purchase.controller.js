import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { batchDto, movementDto } from '../inventory/inventory.queries.js';
import {
  getPurchaseGroupDetails,
  getPurchaseGroupPrintData,
  getPurchasesScreen,
  getSupplierInvoicePrintData
} from './purchase.queries.js';
import { registerPurchaseItem, registerPurchaseItems } from './purchase-registration.service.js';
import {
  deleteDraftPurchaseGroup,
  createPurchaseGroup,
  groupDto,
  itemDto,
  updatePurchaseGroup
} from './purchase.service.js';
import { invoiceDto, splitPurchaseGroupBySupplier } from './purchase-split.service.js';
const ctx = (req, d) => ({
  ...req.auth,
  ...d.serviceContext,
  operationRequestId: req.operationRequestId
});
const response = (x) => ({
  group: groupDto(x.group),
  items: x.items.map(itemDto),
  totals: { subtotal: groupDto(x.group).subtotal, currency: x.group.currency }
});
export function createPurchaseController(d) {
  return {
    screen: async (req, res) =>
      sendSuccess(res, await getPurchasesScreen(req.validated.query, ctx(req, d))),
    create: async (req, res) =>
      sendCreated(res, response(await createPurchaseGroup(req.validated.body, ctx(req, d)))),
    details: async (req, res) =>
      sendSuccess(res, await getPurchaseGroupDetails(req.validated.params.id, ctx(req, d))),
    update: async (req, res) =>
      sendSuccess(res, {
        ...response(
          await updatePurchaseGroup(req.validated.params.id, req.validated.body, ctx(req, d))
        ),
        splitOutdated: true
      }),
    remove: async (req, res) =>
      sendSuccess(
        res,
        await deleteDraftPurchaseGroup(req.validated.params.id, req.validated.body, ctx(req, d))
      ),
    split: async (req, res) => {
      const result = await splitPurchaseGroupBySupplier(
        req.validated.params.id,
        req.validated.body,
        ctx(req, d)
      );
      sendSuccess(res, {
        group: groupDto(result.group),
        supplierInvoices: result.supplierInvoices.map(invoiceDto)
      });
    },
    register: async (req, res) => {
      const x = await registerPurchaseItem(
        req.validated.params.id,
        req.validated.body,
        ctx(req, d)
      );
      sendSuccess(res, {
        item: itemDto(x.item),
        batch: batchDto(x.batch),
        movement: movementDto(x.movement),
        groupStatus: x.group.status,
        supplierInvoiceStatus: x.supplierInvoice.status,
        warningsSummary: x.warningsSummary
      });
    },
    registerMany: async (req, res) => {
      const x = await registerPurchaseItems(
        req.validated.params.id,
        req.validated.body,
        ctx(req, d)
      );
      sendSuccess(res, {
        registered: x.registered.map((v) => ({
          item: itemDto(v.item),
          batch: batchDto(v.batch),
          movement: movementDto(v.movement)
        })),
        group: groupDto(x.group)
      });
    },
    groupPrint: async (req, res) =>
      sendSuccess(res, await getPurchaseGroupPrintData(req.validated.params.id, ctx(req, d))),
    invoicePrint: async (req, res) =>
      sendSuccess(res, await getSupplierInvoicePrintData(req.validated.params.id, ctx(req, d)))
  };
}
