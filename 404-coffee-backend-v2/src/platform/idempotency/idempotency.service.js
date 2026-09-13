import { createHash } from 'node:crypto';
import { ApiError } from '../http/api-error.js';
import { OperationRequest } from './operation-request.model.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function hashCanonicalRequest(input) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');
}

export async function beginOperation(input, context = {}) {
  const model = context.operationModel ?? OperationRequest;
  const filter = { actorId: input.actorId, scope: input.scope, key: input.key };
  const existing = await model.findOne(filter, null, { session: context.session });
  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      throw new ApiError({
        code: 'IDEMPOTENCY_KEY_REUSED',
        status: 409,
        messageAr: 'مفتاح العملية مستخدم لطلب مختلف'
      });
    }
    return { state: existing.status, operation: existing };
  }
  try {
    const [operation] = await model.create(
      [
        {
          ...filter,
          requestHash: input.requestHash,
          status: 'PROCESSING',
          leaseUntil: new Date(Date.now() + input.leaseMs)
        }
      ],
      { session: context.session }
    );
    return { state: 'NEW', operation };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return beginOperation(input, context);
  }
}

export async function completeOperation(operationId, responseSnapshot, context = {}) {
  const model = context.operationModel ?? OperationRequest;
  return model.findOneAndUpdate(
    { _id: operationId, status: 'PROCESSING' },
    {
      $set: {
        status: 'COMPLETED',
        responseStatus: responseSnapshot.status,
        responsePayload: responseSnapshot.payload,
        completedAt: new Date()
      }
    },
    { new: true, session: context.session }
  );
}

export async function failOperation(operationId, errorSnapshot, context = {}) {
  const model = context.operationModel ?? OperationRequest;
  return model.findOneAndUpdate(
    { _id: operationId, status: 'PROCESSING' },
    { $set: { status: 'FAILED', errorSnapshot, failedAt: new Date() } },
    { new: true, session: context.session }
  );
}

export async function getOperationResult(filter, context = {}) {
  const model = context.operationModel ?? OperationRequest;
  return model.findOne(filter, null, { session: context.session });
}
