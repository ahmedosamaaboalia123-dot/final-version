import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './platform/http/error-handler.js';
import { requestIdMiddleware } from './platform/http/request-id.js';
import { requestPerformance } from './platform/http/request-performance.js';
import { responseTimeout } from './platform/http/response-timeout.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createV1Router } from './routes/v1.routes.js';

export function createApp({ config, healthProbe, buildInfo }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.http.corsOrigins, credentials: false, maxAge: 600 }));
  app.use(compression());
  app.use(requestIdMiddleware);
  app.use(requestPerformance({ slowMs: 500 }));
  app.use(responseTimeout(config.http.requestTimeoutMs));
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(createHealthRouter({ healthProbe, buildInfo }));
  app.use(config.apiBasePath, createV1Router({ config }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
