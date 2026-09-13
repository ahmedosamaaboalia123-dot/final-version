import { createHash } from 'node:crypto';
import { readdir, readFile as readFileFs } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Migration } from './migration.model.js';

export function computeChecksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function listMigrationFiles(migrationsDir) {
  const entries = await readdir(migrationsDir);
  return entries
    .filter((entry) => /^\d+-.*\.mjs$/.test(entry))
    .sort()
    .map((entry) => ({ name: entry.replace(/\.mjs$/, ''), file: join(migrationsDir, entry) }));
}

export async function acquireMigrationLock(models, owner, ttlMs = 5 * 60 * 1000, now = new Date()) {
  const MigrationModel = models.Migration ?? Migration;
  const leaseUntil = new Date(now.getTime() + ttlMs);
  const lock = await MigrationModel.findOneAndUpdate(
    { name: '__lock__' },
    { $setOnInsert: { checksum: 'lock', status: 'APPLIED', runner: owner, leaseUntil } },
    { upsert: true, new: true }
  );
  if (lock.runner === owner) {
    await MigrationModel.findOneAndUpdate({ name: '__lock__' }, { $set: { leaseUntil } });
    return { owner, leaseUntil };
  }
  if (lock.leaseUntil && lock.leaseUntil > now) {
    const error = new Error('migration lock is held by another runner');
    error.code = 'MIGRATION_LOCKED';
    throw error;
  }
  const taken = await MigrationModel.findOneAndUpdate(
    { name: '__lock__', runner: lock.runner },
    { $set: { runner: owner, leaseUntil } },
    { new: true }
  );
  if (!taken || taken.runner !== owner) {
    const error = new Error('migration lock is held by another runner');
    error.code = 'MIGRATION_LOCKED';
    throw error;
  }
  return { owner, leaseUntil };
}

export async function releaseMigrationLock(models, owner) {
  const MigrationModel = models.Migration ?? Migration;
  await MigrationModel.findOneAndUpdate(
    { name: '__lock__', runner: owner },
    { $set: { runner: null, leaseUntil: null } }
  );
}

export async function listPendingMigrations(migrationsDir, context = {}) {
  const models = context.migrationModels ?? { Migration };
  const readFile = context.readFile ?? readFileFs;
  const files = await listMigrationFiles(migrationsDir);
  const applied = await models.Migration.find({ name: { $ne: '__lock__' } }).lean();
  const appliedByName = new Map(applied.map((row) => [row.name, row]));
  const pending = [];
  for (const file of files) {
    const content = await readFile(file.file, 'utf8');
    const checksum = computeChecksum(content);
    const row = appliedByName.get(file.name);
    if (!row) {
      pending.push({ ...file, checksum, status: 'PENDING' });
      continue;
    }
    if (row.checksum !== checksum)
      throw Object.assign(new Error(`migration checksum drift: ${file.name}`), {
        code: 'MIGRATION_CHECKSUM_DRIFT'
      });
  }
  return {
    pending,
    applied: applied.map((row) => ({ name: row.name, status: row.status, checksum: row.checksum }))
  };
}

export async function runPendingMigrations(migrationsDir, context = {}) {
  const models = context.migrationModels ?? { Migration };
  const owner = context.runner ?? `migrate-${Date.now()}`;
  await acquireMigrationLock(models, owner, context.lockTtlMs, context.now);
  const applied = [];
  try {
    const { pending } = await listPendingMigrations(migrationsDir, context);
    for (const migration of pending) {
      const startedAt = context.now ?? new Date();
      await models.Migration.findOneAndUpdate(
        { name: migration.name },
        { $set: { checksum: migration.checksum, status: 'APPLIED', startedAt, runner: owner } },
        { upsert: true }
      );
      try {
        const module = await import(pathToFileURL(migration.file).href);
        await module.up(context);
        await models.Migration.findOneAndUpdate(
          { name: migration.name },
          { $set: { status: 'APPLIED', completedAt: context.now ?? new Date(), error: null } }
        );
        applied.push(migration.name);
      } catch (error) {
        await models.Migration.findOneAndUpdate(
          { name: migration.name },
          {
            $set: {
              status: 'FAILED',
              completedAt: context.now ?? new Date(),
              error: String(error?.message ?? error)
            }
          }
        );
        throw error;
      }
    }
    return { applied };
  } finally {
    await releaseMigrationLock(models, owner);
  }
}
