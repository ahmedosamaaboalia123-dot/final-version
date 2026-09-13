import { sendSuccess } from '../../platform/http/response.js';
import { getWarningsScreen, getWarningsSummary } from './warning.queries.js';

const contextFrom = (req, dependencies) => ({ ...req.auth, ...dependencies.serviceContext });
export function createWarningController(dependencies) {
  return {
    screen: async (req, res) =>
      sendSuccess(
        res,
        await getWarningsScreen(req.validated.query, contextFrom(req, dependencies))
      ),
    summary: async (req, res) =>
      sendSuccess(res, await getWarningsSummary(contextFrom(req, dependencies)))
  };
}
