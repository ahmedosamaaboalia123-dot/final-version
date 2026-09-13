import { randomUUID } from 'node:crypto';
import { runWithRequestContext } from '../context/request-context.js';

const safeRequestId = /^[a-zA-Z0-9._:-]{8,128}$/;

export function requestIdMiddleware(req, res, next) {
  const supplied = req.get('x-request-id');
  const requestId = supplied && safeRequestId.test(supplied) ? supplied : randomUUID();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  runWithRequestContext({ requestId, correlationId: requestId }, next);
}

export function createCorrelationId() {
  return randomUUID();
}
