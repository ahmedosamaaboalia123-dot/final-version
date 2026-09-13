import { sendSuccess } from '../../platform/http/response.js';
import { getDashboardScreen } from './dashboard.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createDashboardController(d) {
  return {
    screen: async (r, s) => sendSuccess(s, await getDashboardScreen(r.validated.query, ctx(r, d)))
  };
}
