import { sendSuccess } from '../../platform/http/response.js';
import {
  getPreparationDashboard,
  getPreparationOrderDetails,
  getPreparationScreen
} from './preparation.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createPreparationController(d) {
  return {
    dashboard: async (r, s) => sendSuccess(s, await getPreparationDashboard(ctx(r, d))),
    screen: async (r, s) =>
      sendSuccess(s, await getPreparationScreen(r.validated.query, ctx(r, d))),
    details: async (r, s) =>
      sendSuccess(s, await getPreparationOrderDetails(r.validated.params.id, ctx(r, d)))
  };
}
