import { login, logout, refreshSession } from './auth.service.js';
import { sendAccepted, sendSuccess } from '../../platform/http/response.js';

const contextFrom = (req, dependencies) => ({
  config: dependencies.config,
  requestId: req.requestId,
  ip: req.ip,
  userAgent: req.get('user-agent'),
  actorId: req.auth?.actorId,
  ...dependencies.serviceContext
});
export function createAuthController(dependencies) {
  return {
    login: async (req, res) => {
      const result = await login(req.validated.body, contextFrom(req, dependencies));
      if (result.httpStatus === 202)
        return sendAccepted(res, {
          status: result.status,
          deviceRequestId: result.deviceRequestId,
          pollAfterSeconds: result.pollAfterSeconds
        });
      const response = { ...result };
      delete response.httpStatus;
      delete response.permissionKeys;
      return sendSuccess(res, response);
    },
    refresh: async (req, res) =>
      sendSuccess(
        res,
        await refreshSession(req.validated.body.refreshToken, contextFrom(req, dependencies))
      ),
    logout: async (req, res) =>
      sendSuccess(res, await logout(req.validated.body, contextFrom(req, dependencies)))
  };
}
