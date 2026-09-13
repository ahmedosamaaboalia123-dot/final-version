import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { toApiString, toDecimal128 } from '../src/platform/database/decimal.js';
import { PurchaseReturn } from '../src/modules/purchase-returns/purchase-return.models.js';
import {
  createPurchaseReturn,
  validateReturnItems
} from '../src/modules/purchase-returns/purchase-return.service.js';
const id = () => new mongoose.Types.ObjectId();
const chain = (value) => ({ session: async () => value });
const sequenceModel = () => ({ findOneAndUpdate: async () => ({ value: 1 }) });
function fixtures() {
  const materialId = id(),
    batchId = id(),
    supplierId = id();
  const material = {
    _id: materialId,
    name: 'بن',
    conversionFactor: toDecimal128('1000'),
    smallQuantityStep: toDecimal128('1')
  };
  const batch = {
    _id: batchId,
    materialId,
    supplierId,
    batchNumber: 'BAT-1',
    purchaseReceiptItemId: id(),
    materialSnapshot: { name: 'بن' },
    supplierSnapshot: { id: String(supplierId), name: 'مورد' },
    initialQuantitySmall: toDecimal128('1000'),
    remainingQuantitySmall: toDecimal128('1000'),
    initialInventoryValue: toDecimal128('300'),
    remainingInventoryValue: toDecimal128('300'),
    receivedOn: '2026-01-01',
    expiryOn: '2026-12-31',
    version: 0,
    save: vi.fn(async () => {
      batch.version += 1;
    })
  };
  return { material, batch };
}
describe('purchase return planning', () => {
  it('prices a partial return from the current value of its exact batch', async () => {
    const { material, batch } = fixtures();
    const [row] = await validateReturnItems(
      [
        {
          batchId: batch._id,
          quantityLarge: '0.25',
          reason: 'مرتجع للمورد',
          expectedBatchVersion: 0
        }
      ],
      {
        session: {},
        returnModels: {
          RawMaterialBatch: { find: () => chain([batch]) },
          RawMaterial: { find: () => chain([material]) }
        }
      }
    );
    expect(toApiString(row.quantitySmall)).toBe('250');
    expect(toApiString(row.value)).toBe('75');
    expect(toApiString(row.unitCost)).toBe('0.3');
  });
  it('rejects a quantity larger than the batch before writes', async () => {
    const { material, batch } = fixtures();
    await expect(
      validateReturnItems(
        [
          {
            batchId: batch._id,
            quantityLarge: '2',
            reason: 'مرتجع للمورد',
            expectedBatchVersion: 0
          }
        ],
        {
          session: {},
          returnModels: {
            RawMaterialBatch: { find: () => chain([batch]) },
            RawMaterial: { find: () => chain([material]) }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'RETURN_EXCEEDS_BATCH_STOCK', status: 409 });
  });
  it('rejects a stale batch version caused by a simultaneous sale', async () => {
    const { material, batch } = fixtures();
    batch.version = 2;
    await expect(
      validateReturnItems(
        [
          {
            batchId: batch._id,
            quantityLarge: '1',
            reason: 'مرتجع للمورد',
            expectedBatchVersion: 1
          }
        ],
        {
          session: {},
          returnModels: {
            RawMaterialBatch: { find: () => chain([batch]) },
            RawMaterial: { find: () => chain([material]) }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'RETURN_BATCH_VERSION_CONFLICT' });
  });
});
describe('purchase return execution', () => {
  it('atomically zeros the last batch value and links an immutable return item to its movement', async () => {
    const { material, batch } = fixtures(),
      headers = [],
      returnItems = [],
      movements = [];
    const models = {
      RawMaterialBatch: { find: () => chain([batch]) },
      RawMaterial: { find: () => chain([material]), updateOne: vi.fn() },
      PurchaseReturn: {
        create: async ([value]) => {
          const row = {
            _id: id(),
            status: 'RETURNED',
            currency: 'EGP',
            createdAt: new Date(),
            ...value
          };
          headers.push(row);
          return [row];
        }
      },
      PurchaseReturnItem: {
        create: async (rows) => {
          returnItems.push(...rows);
          return rows;
        }
      },
      InventoryMovement: {
        create: async ([value]) => {
          const row = { _id: id(), ...value };
          movements.push(row);
          return [row];
        }
      }
    };
    const input = {
      returnDate: '2026-09-11',
      items: [
        {
          batchId: batch._id,
          quantityLarge: '1',
          reason: 'إرجاع نهائي للمورد',
          expectedBatchVersion: 0
        }
      ]
    };
    const result = await createPurchaseReturn(input, {
      session: {},
      actorId: id(),
      returnModels: models,
      sequenceModel: sequenceModel()
    });
    expect(toApiString(batch.remainingQuantitySmall)).toBe('0');
    expect(toApiString(batch.remainingInventoryValue)).toBe('0');
    expect(result.movements[0].kind).toBe('PURCHASE_RETURN');
    expect(String(result.items[0].movementId)).toBe(String(result.movements[0]._id));
    expect(result.return.totalInventoryValue.toString()).toBe('300');
    expect(headers).toHaveLength(1);
    expect(returnItems).toHaveLength(1);
    await expect(
      createPurchaseReturn(input, {
        session: {},
        actorId: id(),
        returnModels: models,
        sequenceModel: sequenceModel()
      })
    ).rejects.toMatchObject({ code: 'RETURN_BATCH_VERSION_CONFLICT' });
    expect(headers).toHaveLength(1);
  });
  it('rejects mutation of a saved return document at the model boundary', async () => {
    await expect(
      PurchaseReturn.updateOne({ _id: id() }, { $set: { notes: 'changed' } })
    ).rejects.toThrow('PURCHASE_RETURN_IMMUTABLE');
  });
});
