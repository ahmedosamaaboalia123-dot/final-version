import http from 'node:http';
import { createApp } from './app.js';
import { loadBusinessConfig } from './config/business.js';
import { loadEnv, redactConfig } from './config/env.js';
import { attachSocketTransport } from './modules/realtime/socket-transport.js';
import { ensureSystemRoles } from './modules/employees/role.service.js';
import {
  connectMongo,
  disconnectMongo,
  getMongoHealth,
  markMongoConnectionFailure
} from './platform/database/mongoose.js';

export async function bootstrap({ env = process.env, connectDatabase = true } = {}) {
  const config = loadEnv(env);
  const businessConfig = loadBusinessConfig(config);
  if (connectDatabase) {
    try {
      await connectMongo({
        ...config.mongo,
        queryMaxTimeMs: Math.max(100, config.http.requestTimeoutMs - 100)
      });
      await ensureSystemRoles();
    } catch (error) {
      markMongoConnectionFailure(error);
      throw error;
    }
  }
  const healthProbe = async () => ({ mongodb: { ...getMongoHealth(), required: true } });
  const buildInfo = {
    apiVersion: 'v1',
    schemaVersion: 1,
    build: process.env.APP_BUILD || 'development',
    business: { name: businessConfig.name },
    startedAt: new Date().toISOString()
  };
  const app = createApp({ config, healthProbe, buildInfo });
  const server = http.createServer(app);
  server.requestTimeout = config.http.requestTimeoutMs;
  const { io, detach } = attachSocketTransport(server, { config });
  return {
    app,
    server,
    io,
    detachSocket: detach,
    config,
    safeConfig: redactConfig(config),
    businessConfig,
    healthProbe
  };
}

export async function shutdown(runtime, signal = 'UNKNOWN') {
  try {
    await runtime?.detachSocket?.();
  } catch {
    // Socket detach is best-effort during shutdown.
  }
  const closeServer = runtime?.server?.listening
    ? new Promise((resolve, reject) =>
        runtime.server.close((error) => (error ? reject(error) : resolve()))
      )
    : Promise.resolve();
  let timeoutId;
  try {
    await Promise.race([
      closeServer,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(`HTTP shutdown timeout after ${runtime.config.http.shutdownGraceMs}ms`)
            ),
          runtime.config.http.shutdownGraceMs
        );
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
    await disconnectMongo();
  }
  return { stopped: true, signal };
}
