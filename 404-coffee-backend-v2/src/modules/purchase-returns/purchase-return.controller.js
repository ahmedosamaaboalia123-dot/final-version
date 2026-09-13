import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { movementDto } from '../inventory/inventory.queries.js';
import {
  getPurchaseReturnDetails,
  getPurchaseReturnPrintData,
  getPurchaseReturnsScreen
} from './purchase-return.queries.js';
import { createPurchaseReturn, returnDto, returnItemDto } from './purchase-return.service.js';
const ctx = (req, d) => ({ ...req.auth, ...d.serviceContext });
export function createPurchaseReturnController(d) {
  return {
    screen: async (req, res) =>
      sendSuccess(res, await getPurchaseReturnsScreen(req.validated.query, ctx(req, d))),
    create: async (req, res) => {
      const x = await createPurchaseReturn(req.validated.body, ctx(req, d));
      sendCreated(res, {
        return: returnDto(x.return),
        items: x.items.map(returnItemDto),
        movements: x.movements.map(movementDto),
        affectedMaterials: x.affectedMaterials
      });
    },
    details: async (req, res) =>
      sendSuccess(res, await getPurchaseReturnDetails(req.validated.params.id, ctx(req, d))),
    print: async (req, res) =>
      sendSuccess(res, await getPurchaseReturnPrintData(req.validated.params.id, ctx(req, d)))
  };
}
