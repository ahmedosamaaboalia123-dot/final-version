import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';

const safeError = (error) => ({
  name: error?.name,
  code: error?.code,
  codeName: error?.codeName,
  message: error?.message,
  cause: error?.cause
    ? { name: error.cause.name, code: error.cause.code, message: error.cause.message }
    : null,
  servers: error?.reason?.servers
    ? [...error.reason.servers.entries()].map(([host, state]) => ({
        host,
        type: state.type,
        error: state.error
          ? { name: state.error.name, code: state.error.code, message: state.error.message }
          : null
      }))
    : []
});

try {
  const config = loadEnv();
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 10000
  });
  const ping = await mongoose.connection.db.admin().ping();
  console.log(
    JSON.stringify(
      { ok: true, host: mongoose.connection.host, database: mongoose.connection.name, ping },
      null,
      2
    )
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
