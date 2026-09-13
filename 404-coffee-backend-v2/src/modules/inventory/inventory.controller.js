import { DateTime } from 'luxon';
import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import {
  getRawMaterialDetails,
  getRawMaterialsScreen,
  listWithdrawals,
  movementDto,
  batchDto
} from './inventory.queries.js';
import { reorderBatchPriorities, withdrawBatchQuantity } from './inventory.service.js';
import { createRawMaterial, deleteRawMaterial, toMaterialDto, updateRawMaterial } from './material.service.js';
import { listMeasurementUnits } from './unit.service.js';

const contextFrom = (req, dependencies) => ({
  ...req.auth,
  businessDate: DateTime.now().setZone('Africa/Cairo').toISODate(),
  ...dependencies.serviceContext
});
export function createInventoryController(dependencies) {
  return {
    units: async (req, res) =>
      sendSuccess(res, {
        items: await listMeasurementUnits(req.validated.query, contextFrom(req, dependencies))
      }),
    screen: async (req, res) =>
      sendSuccess(
        res,
        await getRawMaterialsScreen(req.validated.query, contextFrom(req, dependencies))
      ),
    createMaterial: async (req, res) =>
      sendCreated(res, {
        material: toMaterialDto(
          await createRawMaterial(req.validated.body, contextFrom(req, dependencies))
        )
      }),
    details: async (req, res) =>
      sendSuccess(
        res,
        await getRawMaterialDetails(
          req.validated.params.id,
          String(req.query.include ?? '')
            .split(',')
            .filter(Boolean),
          contextFrom(req, dependencies)
        )
      ),
    updateMaterial: async (req, res) =>
      sendSuccess(res, {
        material: toMaterialDto(
          await updateRawMaterial(
            req.validated.params.id,
            req.validated.body,
            contextFrom(req, dependencies)
          )
        )
      }),
    withdraw: async (req, res) => {
      const result = await withdrawBatchQuantity(
        { materialId: req.validated.params.id, ...req.validated.body },
        contextFrom(req, dependencies)
      );
      return sendCreated(res, {
        withdrawal: result.withdrawal,
        movement: movementDto(result.movement),
        batch: batchDto(result.batch),
        materialStock: { stockVersion: result.material.stockVersion }
      });
    },
    priorities: async (req, res) =>
      sendSuccess(
        res,
        await reorderBatchPriorities(
          req.validated.params.id,
          req.validated.body,
          contextFrom(req, dependencies)
        )
      ),
    deleteMaterial: async (req, res) =>
      sendSuccess(
        res,
        await deleteRawMaterial(
          req.validated.params.id,
          req.validated.body,
          contextFrom(req, dependencies)
        )
      ),
    withdrawals: async (req, res) =>
      sendSuccess(res, await listWithdrawals(req.validated.query, contextFrom(req, dependencies)))
  };
}
