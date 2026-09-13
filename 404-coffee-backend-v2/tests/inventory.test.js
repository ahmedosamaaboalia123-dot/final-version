import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { toApiString, toDecimal128 } from '../src/platform/database/decimal.js';
import {
  allocateRecipeRequirements,
  consumeFromBatch,
  restoreAllocations,
  simulateRecipeRequirements,
  withdrawBatchQuantity
} from '../src/modules/inventory/inventory.service.js';
import { calculateConversionFactor } from '../src/modules/inventory/unit.service.js';

const chain = (value) => ({
  session: async () => value,
  lean: async () => value,
  sort() {
    return this;
  }
});
function batch({
  id = new mongoose.Types.ObjectId(),
  materialId = new mongoose.Types.ObjectId(),
  quantity = '1000',
  value = '100',
  priority = 1,
  expiryOn = '2020-01-01',
  version = 0
} = {}) {
  const item = {
    _id: id,
    materialId,
    initialQuantitySmall: toDecimal128(quantity),
    remainingQuantitySmall: toDecimal128(quantity),
    initialInventoryValue: toDecimal128(value),
    remainingInventoryValue: toDecimal128(value),
    salePriority: priority,
    expiryOn,
    version,
    save: vi.fn(async () => {
      item.version += 1;
    })
  };
  return item;
}
function movementModel(rows = []) {
  return {
    create: async ([value]) => {
      const row = { _id: new mongoose.Types.ObjectId(), ...value };
      rows.push(row);
      return [row];
    }
  };
}

describe('measurement conversion and allocation simulation', () => {
  it('derives the large-to-small factor from compatible physical units', () => {
    expect(
      calculateConversionFactor(
        { kind: 'MASS', physicalFactor: toDecimal128('1000') },
        { kind: 'MASS', physicalFactor: toDecimal128('1') }
      )
    ).toBe('1000');
  });

  it('crosses batches by priority and permits an expired batch', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const first = batch({
      materialId,
      quantity: '600',
      value: '60',
      priority: 1,
      expiryOn: '2020-01-01'
    });
    const second = batch({
      materialId,
      quantity: '800',
      value: '160',
      priority: 2,
      expiryOn: '2030-01-01'
    });
    const models = { RawMaterialBatch: { find: () => chain([first, second]) } };
    const plan = await simulateRecipeRequirements([{ materialId, quantitySmall: '1000' }], {
      models
    });
    expect(plan.map((item) => item.quantitySmall)).toEqual(['600', '400']);
    expect(plan[0].expiryOn).toBe('2020-01-01');
    expect(plan.map((item) => item.inventoryValue)).toEqual(['60', '80']);
  });

  it('fails before writing when the combined batches are insufficient', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const models = {
      RawMaterialBatch: { find: () => chain([batch({ materialId, quantity: '10' })]) }
    };
    await expect(
      simulateRecipeRequirements([{ materialId, quantitySmall: '11' }], { models })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });
  });
});

describe('inventory consumption and restoration', () => {
  it('sets both quantity and value to exact zero on the final exit', async () => {
    const item = batch({ quantity: '3', value: '10' });
    const movements = [];
    const result = await consumeFromBatch(
      item,
      '3',
      { type: 'ORDER_ITEM', id: 'oi1', kind: 'SALE_CONSUMPTION', occurredOn: '2026-09-11' },
      {
        session: {},
        actorId: new mongoose.Types.ObjectId(),
        models: { InventoryMovement: movementModel(movements) }
      }
    );
    expect(toApiString(result.batch.remainingQuantitySmall)).toBe('0');
    expect(toApiString(result.batch.remainingInventoryValue)).toBe('0');
    expect(toApiString(result.inventoryValue)).toBe('10');
  });

  it('returns an already-restored allocation without changing its batch twice', async () => {
    const allocation = { _id: 'a1', status: 'REVERSED' };
    const models = {
      InventoryAllocation: { findById: () => chain(allocation) },
      RawMaterialBatch: { findById: vi.fn() }
    };
    const result = await restoreAllocations(['a1'], 'إلغاء الطلب', { session: {}, models });
    expect(result[0].alreadyRestored).toBe(true);
    expect(models.RawMaterialBatch.findById).not.toHaveBeenCalled();
  });

  it('restores the exact consumed quantity and value and records one reversal', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const item = batch({ materialId, quantity: '10', value: '20', version: 1 });
    item.remainingQuantitySmall = toDecimal128('4');
    item.remainingInventoryValue = toDecimal128('8');
    const allocation = {
      _id: new mongoose.Types.ObjectId(),
      materialId,
      batchId: item._id,
      consumptionMovementId: new mongoose.Types.ObjectId(),
      quantitySmall: toDecimal128('6'),
      inventoryValue: toDecimal128('12'),
      status: 'CONSUMED',
      save: vi.fn()
    };
    const movements = [];
    const models = {
      InventoryAllocation: { findById: () => chain(allocation) },
      RawMaterialBatch: { findById: () => chain(item) },
      InventoryMovement: movementModel(movements),
      RawMaterial: { updateOne: vi.fn() }
    };
    const [result] = await restoreAllocations(['a1'], 'إلغاء منتج', {
      session: {},
      businessDate: '2026-09-11',
      actorId: new mongoose.Types.ObjectId(),
      models
    });
    expect(result.alreadyRestored).toBe(false);
    expect(toApiString(item.remainingQuantitySmall)).toBe('10');
    expect(toApiString(item.remainingInventoryValue)).toBe('20');
    expect(allocation.status).toBe('REVERSED');
    expect(movements).toHaveLength(1);
    expect(movements[0].kind).toBe('SALE_CANCELLATION_RESTORE');
  });

  it('defaults the reversal movement date when no business date is provided', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const item = batch({ materialId, quantity: '10', value: '20', version: 1 });
    item.remainingQuantitySmall = toDecimal128('4');
    item.remainingInventoryValue = toDecimal128('8');
    const allocation = {
      _id: new mongoose.Types.ObjectId(),
      materialId,
      batchId: item._id,
      consumptionMovementId: new mongoose.Types.ObjectId(),
      quantitySmall: toDecimal128('6'),
      inventoryValue: toDecimal128('12'),
      status: 'CONSUMED',
      save: vi.fn()
    };
    const movements = [];
    const models = {
      InventoryAllocation: { findById: () => chain(allocation) },
      RawMaterialBatch: { findById: () => chain(item) },
      InventoryMovement: movementModel(movements),
      RawMaterial: { updateOne: vi.fn() }
    };
    const [result] = await restoreAllocations(['a1'], 'إلغاء منتج', {
      session: {},
      actorId: new mongoose.Types.ObjectId(),
      models
    });
    expect(result.alreadyRestored).toBe(false);
    expect(movements).toHaveLength(1);
    expect(movements[0].occurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('consumes across two batches and stores the actual cost allocations', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const first = batch({ materialId, quantity: '3', value: '6', priority: 1 });
    const second = batch({ materialId, quantity: '7', value: '21', priority: 2 });
    const movements = [];
    const allocations = [];
    const byId = new Map([
      [String(first._id), first],
      [String(second._id), second]
    ]);
    const models = {
      RawMaterialBatch: {
        find: () => chain([first, second]),
        findOne: (query) =>
          chain(
            byId.get(String(query._id))?.version === query.version
              ? byId.get(String(query._id))
              : null
          )
      },
      InventoryMovement: movementModel(movements),
      InventoryAllocation: {
        create: async ([value]) => {
          const row = { _id: new mongoose.Types.ObjectId(), ...value };
          allocations.push(row);
          return [row];
        }
      },
      RawMaterial: { updateMany: vi.fn() }
    };
    const result = await allocateRecipeRequirements(
      [{ materialId, quantitySmall: '5' }],
      {
        type: 'ORDER_ITEM',
        id: new mongoose.Types.ObjectId(),
        orderItemId: new mongoose.Types.ObjectId(),
        occurredOn: '2026-09-11'
      },
      { session: {}, actorId: new mongoose.Types.ObjectId(), models }
    );
    expect(result.plan.map((part) => part.quantitySmall)).toEqual(['3', '2']);
    expect(result.allocations.map((part) => toApiString(part.inventoryValue))).toEqual(['6', '6']);
    expect(toApiString(first.remainingQuantitySmall)).toBe('0');
    expect(toApiString(second.remainingQuantitySmall)).toBe('5');
    expect(movements).toHaveLength(2);
  });

  it('rejects a stale allocation plan so two requests cannot consume the last stock', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const snapshot = batch({ materialId, quantity: '5', value: '5', version: 0 });
    const models = {
      RawMaterialBatch: { find: () => chain([snapshot]), findOne: () => chain(null) },
      InventoryMovement: movementModel(),
      InventoryAllocation: { create: vi.fn() },
      RawMaterial: { updateMany: vi.fn() }
    };
    await expect(
      allocateRecipeRequirements(
        [{ materialId, quantitySmall: '5' }],
        { type: 'ORDER_ITEM', id: 'oi1', occurredOn: '2026-09-11' },
        { session: {}, models }
      )
    ).rejects.toMatchObject({ code: 'INVENTORY_RACE_CONFLICT', retryable: true });
    expect(models.InventoryAllocation.create).not.toHaveBeenCalled();
  });

  it('uses expected batch version to close a sale-versus-withdrawal race', async () => {
    const materialId = new mongoose.Types.ObjectId();
    const material = {
      _id: materialId,
      conversionFactor: toDecimal128('1000'),
      smallQuantityStep: toDecimal128('1'),
      stockVersion: 2,
      save: vi.fn()
    };
    const models = {
      RawMaterial: { findById: () => chain(material) },
      RawMaterialBatch: { findOne: () => chain(null) }
    };
    await expect(
      withdrawBatchQuantity(
        {
          materialId,
          batchId: new mongoose.Types.ObjectId(),
          quantityLarge: '1',
          reason: 'تالف نهائي',
          occurredOn: '2026-09-11',
          expectedBatchVersion: 0
        },
        { session: {}, models }
      )
    ).rejects.toMatchObject({ code: 'BATCH_VERSION_CONFLICT', status: 409 });
  });
});
