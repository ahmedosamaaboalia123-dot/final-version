import { ApiError } from '../../platform/http/api-error.js';
import { hashToken } from '../../shared/utils/hash-token.js';
import { Order } from '../orders/order.models.js';
import { CustomerAccessSession, CustomerOrderCredential } from './customer-experience.models.js';

const defaults = { Order, CustomerOrderCredential, CustomerAccessSession };

const missingToken = () =>
  new ApiError({
    code: 'PUBLIC_TOKEN_REQUIRED',
    status: 401,
    messageAr: 'رمز المتابعة مطلوب'
  });
const invalidToken = () =>
  new ApiError({
    code: 'PUBLIC_TOKEN_INVALID',
    status: 401,
    messageAr: 'رمز المتابعة غير صالح'
  });
const expiredToken = () =>
  new ApiError({
    code: 'PUBLIC_TOKEN_EXPIRED',
    status: 401,
    messageAr: 'انتهت صلاحية رمز المتابعة'
  });

async function loadCredential(models, orderNumber) {
  const order = await models.Order.findOne({
    $or: [{ orderNumber }, { publicOrderNumber: orderNumber }]
  });
  if (!order) throw invalidToken();
  const credential = await models.CustomerOrderCredential.findOne({ orderId: order._id }).select(
    '+trackingReadTokenHash +orderActionTokenHash'
  );
  if (!credential || credential.status !== 'ACTIVE') throw invalidToken();
  return { order, credential };
}

async function touchExpiry(models, credential, field, now) {
  const expired = now > credential[`${field}ExpiresAt`];
  if (expired && credential.status === 'ACTIVE') {
    credential.status = 'EXPIRED';
    await credential.save();
  }
  return expired;
}

export async function resolveReadCredential(orderNumber, rawToken, context = {}) {
  const models = context.publicOrderModels ?? defaults;
  const now = context.now ?? new Date();
  if (!rawToken) throw missingToken();
  const { order, credential } = await loadCredential(models, orderNumber);
  if (credential.trackingReadTokenHash !== hashToken(rawToken)) throw invalidToken();
  if (await touchExpiry(models, credential, 'read', now)) throw expiredToken();
  credential.lastReadAt = now;
  await credential.save();
  return { order, credential };
}

export async function resolveActionCredential(orderNumber, rawToken, context = {}) {
  const models = context.publicOrderModels ?? defaults;
  const now = context.now ?? new Date();
  if (!rawToken) throw missingToken();
  const { order, credential } = await loadCredential(models, orderNumber);
  if (credential.orderActionTokenHash !== hashToken(rawToken)) throw invalidToken();
  if (await touchExpiry(models, credential, 'action', now)) throw expiredToken();
  credential.lastActionAt = now;
  await credential.save();
  return { order, credential };
}

export async function resolveAccessSession(rawToken, context = {}) {
  const models = context.publicOrderModels ?? defaults;
  const now = context.now ?? new Date();
  if (!rawToken) throw missingToken();
  const session = await models.CustomerAccessSession.findOne({
    sessionTokenHash: hashToken(rawToken)
  });
  if (!session || session.status !== 'ACTIVE') throw invalidToken();
  if (now > session.expiresAt) {
    if (session.status === 'ACTIVE') {
      session.status = 'EXPIRED';
      await session.save();
    }
    throw expiredToken();
  }
  session.lastUsedAt = now;
  await session.save();
  return session;
}

export function createPublicGuards(d = {}) {
  const context = d.serviceContext ?? {};
  return {
    tracking: (req, _res, next) => {
      resolveReadCredential(
        req.validated?.params?.orderNumber,
        req.get('x-tracking-read-token'),
        context
      )
        .then(({ order, credential }) => {
          req.publicOrder = { order, credential, scope: 'read' };
          next();
        })
        .catch(next);
    },
    action: (req, _res, next) => {
      resolveActionCredential(
        req.validated?.params?.orderNumber,
        req.get('x-order-action-token'),
        context
      )
        .then(({ order, credential }) => {
          req.publicOrder = { order, credential, scope: 'action' };
          next();
        })
        .catch(next);
    },
    session: (req, _res, next) => {
      resolveAccessSession(req.get('x-customer-session'), context)
        .then((session) => {
          req.customerSession = session;
          next();
        })
        .catch(next);
    }
  };
}

export function createLookupRateLimiter({
  limit = 10,
  windowMs = 10 * 60 * 1000,
  now = () => new Date()
} = {}) {
  const buckets = new Map();
  return {
    check(key) {
      const at = now().getTime();
      const bucket = buckets.get(key);
      if (!bucket || at >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: at + windowMs });
        return;
      }
      bucket.count += 1;
      if (bucket.count > limit)
        throw new ApiError({
          code: 'LOOKUP_RATE_LIMITED',
          status: 429,
          messageAr: 'محاولات كثيرة، حاول بعد قليل',
          retryable: true
        });
    }
  };
}

export const lookupRateLimiter = createLookupRateLimiter();
