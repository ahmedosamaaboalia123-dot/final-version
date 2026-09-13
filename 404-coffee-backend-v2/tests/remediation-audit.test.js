import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { toDecimal128 } from '../src/platform/database/decimal.js';
import { RawMaterialBatch } from '../src/modules/inventory/inventory.models.js';
import { listEmployeeDevices } from '../src/modules/employees/employee.queries.js';
import { getWarningsScreen } from '../src/modules/warnings/warning.queries.js';

function queryResult(value) {
  return {
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    lean: async () => value
  };
}

describe('phase 0-7 remediation contracts', () => {
  it('rejects a batch balance below zero or above its initial balance at schema level', async () => {
    const base = {
      materialId: new mongoose.Types.ObjectId(),
      batchNumber: 'B-TEST',
      supplierId: new mongoose.Types.ObjectId(),
      initialQuantitySmall: toDecimal128('10'),
      remainingQuantitySmall: toDecimal128('11'),
      purchaseLargeUnitPrice: toDecimal128('2'),
      initialInventoryValue: toDecimal128('20'),
      remainingInventoryValue: toDecimal128('-1'),
      receivedOn: '2026-09-11',
      salePriority: 1
    };
    await expect(new RawMaterialBatch(base).validate()).rejects.toMatchObject({
      name: 'ValidationError'
    });
  });

  it('lists pending employee devices with stable pagination', async () => {
    const find = vi.fn(() => queryResult([{ _id: 'd1', employeeId: 'e1', status: 'PENDING' }]));
    const result = await listEmployeeDevices(
      { status: 'PENDING', page: 1, limit: 10 },
      { models: { EmployeeDevice: { find, countDocuments: async () => 1 } } }
    );
    expect(find).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(result.items[0]).toMatchObject({ id: 'd1', status: 'PENDING' });
    expect(result.pageMeta).toMatchObject({ totalItems: 1, limit: 10 });
  });

  it('merges long-open drawer shifts into the warning summary and list', async () => {
    const empty = {
      find: () => ({
        select() {
          return this;
        },
        lean: async () => []
      })
    };
    const result = await getWarningsScreen(
      { type: 'OPEN_SHIFT_LONG', page: 1, limit: 10 },
      {
        warningModels: { RawMaterial: empty, RawMaterialBatch: empty },
        drawerWarningsPort: {
          getOpenShiftWarnings: async () => ({
            count: 1,
            sourceVersion: 'shift-1:0',
            items: [{ id: 'OPEN_SHIFT_LONG:shift-1', type: 'OPEN_SHIFT_LONG', severity: 'WARNING' }]
          })
        }
      }
    );
    expect(result.summary.openShiftLong).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.dataQuality).toBe('COMPLETE');
  });
});
