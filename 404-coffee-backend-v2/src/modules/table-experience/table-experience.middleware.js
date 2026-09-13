import { ApiError } from '../../platform/http/api-error.js';
import { hashToken } from '../../shared/utils/hash-token.js';
import { TableGuestSession } from './table-experience.models.js';

const defaults = { TableGuestSession };

const missing = () =>
  new ApiError({ code: 'TABLE_TOKEN_REQUIRED', status: 401, messageAr: 'رمز جلسة الطاولة مطلوب' });
const invalid = () =>
  new ApiError({
    code: 'TABLE_TOKEN_INVALID',
    status: 401,
    messageAr: 'رمز جلسة الطاولة غير صالح'
  });
const expired = () =>
  new ApiError({
    code: 'TABLE_TOKEN_EXPIRED',
    status: 401,
    messageAr: 'انتهت صلاحية جلسة الطاولة'
  });

export async function resolveGuestSession(rawToken, context = {}) {
  const models = context.tableGuestModels ?? defaults;
  const now = context.now ?? new Date();
  if (!rawToken) throw missing();
  const session = await models.TableGuestSession.findOne({
    tokenHash: hashToken(rawToken)
  }).select('+tokenHash');
  if (!session || session.status !== 'ACTIVE') throw invalid();
  if (now > session.expiresAt) {
    session.status = 'EXPIRED';
    await session.save();
    throw expired();
  }
  session.lastSeenAt = now;
  await session.save();
  return session;
}

export function createGuestGuards(d = {}) {
  const context = d.serviceContext ?? {};
  return {
    guest: (req, _res, next) => {
      resolveGuestSession(req.get('x-table-token'), context)
        .then((session) => {
          req.guestSession = session;
          next();
        })
        .catch(next);
    }
  };
}
