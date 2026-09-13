import { describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateIndexDiff } from '../src/platform/database/index-diff.js';
import { modelCount, readModelIndexes } from '../src/platform/database/index-manifest.js';
import {
  acquireMigrationLock,
  computeChecksum,
  listPendingMigrations,
  releaseMigrationLock,
  runPendingMigrations
} from '../src/platform/database/migration-runner.js';
import { AUTH_PERMISSIONS } from '../src/shared/constants/auth.constants.js';
import { permissionLabel, seedReferenceData } from '../scripts/seed-reference.js';
import { checkOrderBalances, verifyDataIntegrity } from '../scripts/verify-data-integrity.js';
import { createFirstAdmin } from '../scripts/create-first-admin.js';

function migrationStore(rows = []) {
  const store = new Map(rows.map((row) => [row.name, { ...row }]));
  const applyUpdate = (doc, update) => {
    const next = { ...doc };
    if (update.$setOnInsert && !store.has(doc.name)) Object.assign(next, update.$setOnInsert);
    Object.assign(next, update.$set ?? {});
    return next;
  };
  return {
    find: (query) => ({
      lean: async () =>
        [...store.values()].filter((row) => (query?.name?.$ne ? row.name !== query.name.$ne : true))
    }),
    findOneAndUpdate: async (filter, update, options) => {
      const existing = store.get(filter.name);
      if (!existing && !options?.upsert) return null;
      if (!existing && update.$set && Object.keys(update).every((key) => key !== '$setOnInsert')) {
        const created = { name: filter.name, ...(update.$set ?? {}) };
        store.set(filter.name, created);
        return created;
      }
      const base = existing ?? { name: filter.name };
      if (existing && filter.runner && existing.runner !== filter.runner) return null;
      const next = applyUpdate(base, update);
      store.set(filter.name, next);
      return next;
    },
    __store: store
  };
}

describe('index drift gate', () => {
  it('reads a manifest entry per model index', () => {
    const manifest = readModelIndexes();
    expect(modelCount()).toBeGreaterThan(40);
    expect(manifest.length).toBeGreaterThan(40);
    expect(
      manifest.every(
        (entry) => typeof entry.collection === 'string' && typeof entry.keys === 'object'
      )
    ).toBe(true);
  });
  it('flags missing indexes and ignores the _id index', () => {
    const manifest = [
      { collection: 'orders', keys: { orderNumber: 1 }, options: { unique: true } },
      { collection: 'orders', keys: { status: 1 }, options: {} }
    ];
    const diff = calculateIndexDiff(manifest, {
      orders: [
        { name: '_id_', keys: { _id: 1 } },
        { name: 'a', keys: { status: 1 } }
      ]
    });
    expect(diff.missing).toHaveLength(1);
    expect(diff.missing[0].keys).toMatchObject({ orderNumber: 1 });
    expect(diff.extra).toHaveLength(0);
    expect(diff.ok).toBe(false);
  });
  it('flags option drift and unknown extras', () => {
    const manifest = [{ collection: 'c', keys: { a: 1 }, options: { unique: true } }];
    const diff = calculateIndexDiff(manifest, {
      c: [
        { name: 'a', keys: { a: 1 } },
        { name: 'rogue_1', keys: { rogue: 1 } }
      ]
    });
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.extra).toHaveLength(1);
    expect(diff.ok).toBe(false);
  });
  it('passes clean manifests', () => {
    const manifest = [{ collection: 'c', keys: { a: 1 }, options: { unique: true } }];
    const diff = calculateIndexDiff(manifest, {
      c: [{ name: 'a', keys: { a: 1 }, unique: true }]
    });
    expect(diff).toMatchObject({ ok: true });
  });
});

describe('migration runner', () => {
  it('computes stable checksums', () => {
    expect(computeChecksum('abc')).toBe(computeChecksum('abc'));
    expect(computeChecksum('abc')).not.toBe(computeChecksum('abd'));
  });
  it('locks out concurrent runners until the lease expires', async () => {
    const models = { Migration: migrationStore() };
    const now = new Date('2026-09-11T10:00:00Z');
    await acquireMigrationLock(models, 'one', 60000, now);
    await expect(acquireMigrationLock(models, 'two', 60000, now)).rejects.toMatchObject({
      code: 'MIGRATION_LOCKED'
    });
    const later = new Date('2026-09-11T10:05:01Z');
    await expect(acquireMigrationLock(models, 'two', 60000, later)).resolves.toMatchObject({
      owner: 'two'
    });
    await releaseMigrationLock(models, 'two');
    await expect(acquireMigrationLock(models, 'one', 60000, later)).resolves.toMatchObject({
      owner: 'one'
    });
  });
  it('runs pending migrations in filename order', async () => {
    const models = { Migration: migrationStore() };
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'migrations');
    const { pending } = await listPendingMigrations(dir, {
      migrationModels: models
    });
    expect(pending.map((row) => row.name)).toEqual(['001-first', '002-second']);
    const result = await runPendingMigrations(dir, {
      migrationModels: models,
      runner: 'test'
    });
    expect(result).toMatchObject({ applied: ['001-first', '002-second'] });
    const again = await listPendingMigrations(dir, { migrationModels: models });
    expect(again.pending).toHaveLength(0);
  });
  it('refuses checksum drift on applied migrations', async () => {
    const models = {
      Migration: migrationStore([{ name: '001-first', checksum: 'stale', status: 'APPLIED' }])
    };
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'migrations');
    await expect(listPendingMigrations(dir, { migrationModels: models })).rejects.toMatchObject({
      code: 'MIGRATION_CHECKSUM_DRIFT'
    });
  });
});

describe('reference seed', () => {
  it('labels every permission key in arabic', () => {
    const unlabelled = Object.values(AUTH_PERMISSIONS).filter(
      (key) => permissionLabel(key) === key
    );
    expect(unlabelled).toEqual([]);
  });
  it('upserts units and permissions idempotently', async () => {
    const bulkWrite = vi.fn(async () => ({ upsertedCount: 3 }));
    const models = {
      MeasurementUnit: { bulkWrite },
      Permission: { bulkWrite }
    };
    const first = await seedReferenceData({ models, seedTables: false });
    expect(first).toMatchObject({ units: 3, permissions: 3 });
    const unitOps = bulkWrite.mock.calls[0][0];
    expect(unitOps.every((op) => op.updateOne.upsert)).toBe(true);
    expect(bulkWrite).toHaveBeenCalledTimes(2);
  });
});

describe('integrity checks', () => {
  it('flags orders whose balance disagrees with payments', async () => {
    const good = {
      _id: 'a',
      orderNumber: 'ORD-1',
      total: '100',
      paidAmount: '40',
      refundedAmount: '0',
      balanceDue: '60'
    };
    const bad = { ...good, _id: 'b', orderNumber: 'ORD-2', balanceDue: '55' };
    const result = await checkOrderBalances({
      Order: {
        find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [good, bad] }) }) })
      }
    });
    expect(result).toMatchObject({ checked: 2 });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ orderNumber: 'ORD-2' });
  });
  it('reports a clean bill of health across checks', async () => {
    const empty = {
      find: () => ({
        select: () => ({
          lean: async () => [],
          limit: () => ({ lean: async () => [] })
        }),
        sort: () => ({ limit: () => ({ lean: async () => [] }) })
      })
    };
    const result = await verifyDataIntegrity({
      models: {
        Order: {
          find: () => ({
            sort: () => ({
              limit: () => ({
                lean: async () => [
                  {
                    _id: 'a',
                    total: '100',
                    paidAmount: '0',
                    refundedAmount: '0',
                    balanceDue: '100'
                  }
                ]
              })
            })
          })
        },
        DeliveryAssignment: empty,
        TableSession: empty,
        InventoryAllocation: {
          find: () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
        },
        OrderItem: { findById: () => ({ select: () => ({ lean: async () => null }) }) },
        OutboxEvent: {
          countDocuments: async () => 0,
          findOne: () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) })
        }
      }
    });
    expect(result).toMatchObject({ ok: true, failures: [] });
  });
});

describe('first admin bootstrap', () => {
  it('refuses a second active admin', async () => {
    await expect(
      createFirstAdmin(
        { name: 'مدير', password: 'secret123' },
        {
          models: {
            Employee: { findOne: () => ({ sort: () => ({ lean: async () => ({ _id: 'e' }) }) }) },
            Role: { findById: () => ({ lean: async () => ({ name: 'Admin' }) }) }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' });
  });
  it('requires a name and password', async () => {
    await expect(
      createFirstAdmin({ name: '', password: '' }, { models: {} })
    ).rejects.toMatchObject({
      code: 'ADMIN_ARGS_MISSING'
    });
  });
});
