import { DateTime } from 'luxon';
import { compare, subtract, toApiString } from '../../platform/database/decimal.js';

export function calculateDaysUntilExpiry(expiryOn, businessToday) {
  const expiry = DateTime.fromISO(expiryOn, { zone: 'Africa/Cairo' }).startOf('day');
  const today = DateTime.fromISO(businessToday, { zone: 'Africa/Cairo' }).startOf('day');
  if (!expiry.isValid || !today.isValid) throw new Error('INVALID_BUSINESS_DATE');
  return Math.trunc(expiry.diff(today, 'days').days);
}

export function evaluateLowStock(material, stockSmall) {
  if (compare(stockSmall, material.minStockSmall) > 0) return null;
  return {
    id: `LOW_STOCK:${material._id}`,
    type: 'LOW_STOCK',
    severity: compare(stockSmall, '0') === 0 ? 'CRITICAL' : 'WARNING',
    threshold: toApiString(material.minStockSmall),
    currentValue: toApiString(stockSmall),
    shortageSmall: toApiString(subtract(material.minStockSmall, stockSmall))
  };
}

export function evaluateBatchExpiry(batch, businessToday, alertDays) {
  if (compare(batch.remainingQuantitySmall, '0') <= 0 || !batch.expiryOn) return null;
  const daysUntilExpiry = calculateDaysUntilExpiry(batch.expiryOn, businessToday);
  if (daysUntilExpiry < 0)
    return {
      id: `EXPIRED:${batch._id}`,
      type: 'EXPIRED',
      severity: 'CRITICAL',
      expiryOn: batch.expiryOn,
      daysUntilExpiry
    };
  if (daysUntilExpiry <= alertDays)
    return {
      id: `EXPIRING:${batch._id}`,
      type: 'EXPIRING',
      severity: daysUntilExpiry === 0 ? 'CRITICAL' : 'WARNING',
      expiryOn: batch.expiryOn,
      daysUntilExpiry,
      threshold: String(alertDays)
    };
  return null;
}
