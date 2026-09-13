import { requireContextPermission } from './auth-context.js';

export function requirePermission(permission) {
  return function permissionMiddleware(req, _res, next) {
    try {
      requireContextPermission(req.auth, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}
