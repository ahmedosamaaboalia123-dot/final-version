import { createHash } from 'node:crypto';
import { ApiError } from './api-error.js';
import { readIdempotencyKey } from './idempotency.middleware.js';
import {
  beginOperation,
  completeOperation,
  failOperation,
  hashCanonicalRequest
} from '../idempotency/idempotency.service.js';

const actorFor = (req) =>
  String(
    req.auth?.actorId ??
      req.publicOrder?.order?._id ??
      req.tableGuest?.session?._id ??
      req.validated?.body?.customer?.phone ??
      req.ip ??
      'anonymous'
  );

const publicActorHash = (value) => createHash('sha256').update(String(value)).digest('hex');

function captureResponse(res) {
  return {
    locals: res.locals,
    statusCode: 200,
    payload: undefined,
    headers: new Map(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    set(name, value) {
      this.headers.set(name, value);
      return this;
    },
    setHeader(name, value) {
      this.headers.set(name, value);
    },
    get headersSent() {
      return false;
    },
    get writableEnded() {
      return false;
    }
  };
}

export function idempotentAsyncHandler(scope, handler, options = {}) {
  return async function handledRequest(req, res, next) {
    let operation;
    let ownsOperation = false;
    try {
      const key = readIdempotencyKey(req);
      const actorId = options.publicActor
        ? `public:${publicActorHash(actorFor(req))}`
        : actorFor(req);
      const started = await beginOperation(
        {
          actorId,
          scope,
          key,
          requestHash: hashCanonicalRequest({
            params: req.params,
            query: req.query,
            body: req.body
          }),
          leaseMs: options.leaseMs ?? 30_000
        },
        { operationModel: options.operationModel }
      );
      operation = started.operation;
      ownsOperation = started.state === 'NEW';
      if (started.state === 'COMPLETED')
        return res.status(operation.responseStatus).json(operation.responsePayload);
      if (started.state !== 'NEW')
        throw new ApiError({
          code:
            started.state === 'PROCESSING'
              ? 'OPERATION_IN_PROGRESS'
              : 'OPERATION_PREVIOUSLY_FAILED',
          status: 409,
          messageAr:
            started.state === 'PROCESSING'
              ? 'العملية قيد التنفيذ بالفعل'
              : 'فشلت المحاولة السابقة، استخدم مفتاح عملية جديدًا',
          retryable: started.state === 'PROCESSING'
        });
      req.operationRequestId = operation._id;
      const captured = captureResponse(res);
      await handler(req, captured);
      if (captured.payload === undefined)
        throw new Error(`IDEMPOTENT_HANDLER_WITHOUT_RESPONSE:${scope}`);
      await completeOperation(
        operation._id,
        { status: captured.statusCode, payload: captured.payload },
        { operationModel: options.operationModel }
      );
      for (const [name, value] of captured.headers) res.set(name, value);
      return res.status(captured.statusCode).json(captured.payload);
    } catch (error) {
      if (ownsOperation && operation?._id && operation.status === 'PROCESSING')
        await failOperation(
          operation._id,
          { code: error.code ?? 'INTERNAL_ERROR', status: error.status ?? 500 },
          { operationModel: options.operationModel }
        ).catch(() => {});
      next(error);
    }
  };
}
