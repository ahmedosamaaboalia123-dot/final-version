import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { readModelIndexes } from '../src/platform/database/index-manifest.js';
import { calculateIndexDiff } from '../src/platform/database/index-diff.js';

function usage() {
  console.log('Usage: node scripts/check-indexes.js [--apply]');
  console.log('  default: report drift and exit 1 when required indexes are missing.');
  console.log('  --apply: create missing indexes (never drops anything).');
}

export async function checkIndexes({ apply = false, connection } = {}) {
  const manifest = readModelIndexes();
  const db = connection ?? mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const names = new Set(collections.map((collection) => collection.name));
  const existingByCollection = {};
  for (const entry of manifest) {
    if (!names.has(entry.collection)) continue;
    if (!existingByCollection[entry.collection]) {
      const indexes = await db.collection(entry.collection).listIndexes().toArray();
      existingByCollection[entry.collection] = indexes.map((index) => ({
        name: index.name,
        keys: index.key,
        unique: index.unique,
        sparse: index.sparse,
        expireAfterSeconds: index.expireAfterSeconds,
        partialFilterExpression: index.partialFilterExpression
      }));
    }
  }
  const diff = calculateIndexDiff(manifest, existingByCollection);
  if (apply) {
    for (const missing of diff.missing)
      await db.collection(missing.collection).createIndex(missing.keys, missing.options ?? {});
    return {
      ...calculateIndexDiff(manifest, await reread(db, manifest)),
      applied: diff.missing.length
    };
  }
  return { ...diff, applied: 0 };
}

async function reread(db, manifest) {
  const existingByCollection = {};
  for (const entry of manifest) {
    const indexes = await db.collection(entry.collection).listIndexes().toArray();
    existingByCollection[entry.collection] = indexes.map((index) => ({
      name: index.name,
      keys: index.key,
      unique: index.unique,
      sparse: index.sparse,
      expireAfterSeconds: index.expireAfterSeconds,
      partialFilterExpression: index.partialFilterExpression
    }));
  }
  return existingByCollection;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    usage();
    process.exit(0);
  }
  const config = loadEnv();
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: config.mongo.connectTimeoutMs
  });
  try {
    const result = await checkIndexes({ apply: args.includes('--apply') });
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          missing: result.missing.length,
          mismatched: result.mismatched.length,
          extra: result.extra.length,
          applied: result.applied
        },
        null,
        2
      )
    );
    if (!result.ok) {
      console.log(
        JSON.stringify({ missing: result.missing, mismatched: result.mismatched }, null, 2)
      );
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
  }
}

const invoked = process.argv[1]?.endsWith('check-indexes.js') ?? false;
if (invoked) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(2);
  });
}
