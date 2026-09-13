import { DateTime } from 'luxon';
import { OutboxEvent } from '../../platform/events/outbox-event.model.js';
import { DashboardDaily } from './dashboard.models.js';
import { cairoDayRange, cairoPeriod, rebuildDashboardProjection } from './dashboard.service.js';

const STALE_MS = 60 * 1000;
const refreshes = new Map();

function refreshDashboard(period, context, now) {
  if (refreshes.has(period)) return refreshes.get(period);
  const refresh = rebuildDashboardProjection(period, { ...context, now })
    .catch(() => null)
    .finally(() => refreshes.delete(period));
  refreshes.set(period, refresh);
  return refresh;
}

export async function getDashboardScreen(filters = {}, context = {}) {
  const models = context.dashboardModels ?? { DashboardDaily, OutboxEvent };
  const now = context.now ?? new Date();
  const period = filters.period ?? cairoPeriod(now);
  let daily = await models.DashboardDaily.findOne({ period }).lean();
  if (!daily) {
    const rebuilt = await rebuildDashboardProjection(period, { ...context, now });
    daily = typeof rebuilt?.toObject === 'function' ? rebuilt.toObject() : rebuilt;
  } else if (now.getTime() - new Date(daily.generatedAt).getTime() > STALE_MS) {
    void refreshDashboard(period, context, now);
  }
  const { start } = cairoDayRange(period);
  const previousPeriod = DateTime.fromJSDate(start).minus({ days: 1 }).toFormat('yyyy-MM-dd');
  const previous = await models.DashboardDaily.findOne({ period: previousPeriod }).lean();
  const latestEvent = await models.OutboxEvent.findOne({})
    .sort({ createdAt: -1, _id: -1 })
    .select({ createdAt: 1 })
    .lean();
  return {
    period,
    comparisonPeriod: previousPeriod,
    summary: daily.metrics,
    comparison: previous
      ? {
          netSales: previous.metrics?.orders?.netSales ?? null,
          completedToday: previous.metrics?.orders?.completedToday ?? null
        }
      : null,
    alerts: daily.metrics?.alerts ?? [],
    dataQuality: daily.dataQuality,
    failedSources: daily.failedSources ?? [],
    sourceVersions: daily.sourceVersions,
    generatedAt: daily.generatedAt,
    realtime: { lastEventAt: latestEvent?.createdAt ?? null }
  };
}
