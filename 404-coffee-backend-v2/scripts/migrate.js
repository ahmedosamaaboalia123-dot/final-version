import mongoose from 'mongoose';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import {
  listPendingMigrations,
  runPendingMigrations
} from '../src/platform/database/migration-runner.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'migrations');

async function main() {
  const args = process.argv.slice(2);
  const config = loadEnv();
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: config.mongo.connectTimeoutMs
  });
  try {
    if (args.includes('--status')) {
      const { pending, applied } = await listPendingMigrations(migrationsDir, {});
      console.log(JSON.stringify({ pending: pending.map((row) => row.name), applied }, null, 2));
      process.exit(0);
    }
    const { applied } = await runPendingMigrations(migrationsDir, {});
    console.log(JSON.stringify({ applied }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

const invoked = process.argv[1]?.endsWith('migrate.js') ?? false;
if (invoked) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}
