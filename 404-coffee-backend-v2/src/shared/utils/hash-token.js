import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const encode = (value) => Buffer.from(value).toString('base64url');
const decode = (value) => Buffer.from(value, 'base64url').toString('utf8');
export const hashToken = (value) => createHash('sha256').update(value).digest('hex');
export const createOpaqueToken = () => randomBytes(48).toString('base64url');

export function signAccessToken(claims, secret, ttlSeconds, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload = encode(JSON.stringify({ ...claims, iat: issuedAt, exp: issuedAt + ttlSeconds }));
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new Error('INVALID_TOKEN');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    throw new Error('INVALID_TOKEN');
  const claims = JSON.parse(decode(payload));
  if (!Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000))
    throw new Error('TOKEN_EXPIRED');
  return claims;
}
