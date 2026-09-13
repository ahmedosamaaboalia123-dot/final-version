import { sendSuccess } from '../../platform/http/response.js';
import { resolveSyncIdentity, syncAggregates } from './realtime.sync.js';

export function createRealtimeController(d) {
  return {
    sync: async (r, s) => {
      const context = { ...d.serviceContext };
      const identity = await resolveSyncIdentity(r, d, context);
      return sendSuccess(s, await syncAggregates(r.validated.query, identity, context));
    }
  };
}
