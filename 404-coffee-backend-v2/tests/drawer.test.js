import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { toApiString, toDecimal128 } from '../src/platform/database/decimal.js';
import {
  closeShift,
  createCashTransaction,
  openShift
} from '../src/modules/drawer/drawer.service.js';
const id = () => new mongoose.Types.ObjectId(),
  chain = (v) => ({ session: async () => v });
function shift() {
  const s = {
    _id: id(),
    scopeId: id(),
    status: 'OPEN',
    currency: 'EGP',
    openingBalance: toDecimal128('500'),
    totalCashIn: toDecimal128('0'),
    totalCashOut: toDecimal128('0'),
    netCashMovement: toDecimal128('0'),
    expectedClosingBalance: toDecimal128('500'),
    transactionCount: 0,
    version: 0,
    save: vi.fn(async () => {
      s.version += 1;
    })
  };
  return s;
}
describe('cash drawer invariants', () => {
  it('keeps opening balance outside income and expenses', async () => {
    const created = [];
    const models = {
      CashDrawerShift: {
        exists: () => chain(null),
        create: async ([v]) => {
          created.push({ _id: id(), version: 0, ...v });
          return created;
        }
      }
    };
    const s = await openShift(
      { openingBalance: '500', scopeId: id() },
      {
        session: {},
        actorId: id(),
        drawerModels: models,
        sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) },
        now: new Date('2026-09-11T08:00:00Z')
      }
    );
    expect(toApiString(s.openingBalance)).toBe('500');
    expect(toApiString(s.totalCashIn)).toBe('0');
    expect(toApiString(s.totalCashOut)).toBe('0');
    expect(toApiString(s.expectedClosingBalance)).toBe('500');
  });
  it('updates the projection and rejects an OUT above drawer balance', async () => {
    const s = shift(),
      rows = [];
    const models = {
      CashDrawerShift: { findOne: () => chain(s) },
      CashDrawerTransaction: {
        create: async ([v]) => {
          rows.push({ _id: id(), ...v });
          return [rows[0]];
        }
      }
    };
    await createCashTransaction(
      {
        shiftId: s._id,
        direction: 'IN',
        amount: '100',
        sourceType: 'MANUAL',
        sourceId: 'one',
        accountingClass: 'OTHER_INCOME',
        description: 'وارد',
        expectedVersion: 0
      },
      { session: {}, drawerModels: models }
    );
    expect(toApiString(s.expectedClosingBalance)).toBe('600');
    await expect(
      createCashTransaction(
        {
          shiftId: s._id,
          direction: 'OUT',
          amount: '601',
          sourceType: 'MANUAL',
          sourceId: 'two',
          accountingClass: 'EXPENSE',
          description: 'صادر',
          expectedVersion: 1
        },
        { session: {}, drawerModels: models }
      )
    ).rejects.toMatchObject({ code: 'DRAWER_INSUFFICIENT_CASH' });
  });
  it('blocks close when ledger totals differ from the shift projection', async () => {
    const s = shift();
    s.totalCashIn = toDecimal128('100');
    const models = {
      CashDrawerShift: { findOne: () => chain(s) },
      CashDrawerTransaction: { find: () => chain([]) }
    };
    await expect(
      closeShift(
        s._id,
        { actualClosingBalance: '500', expectedVersion: 0 },
        { session: {}, drawerModels: models }
      )
    ).rejects.toMatchObject({ code: 'DRAWER_LEDGER_MISMATCH' });
    expect(s.status).toBe('OPEN');
  });
});
