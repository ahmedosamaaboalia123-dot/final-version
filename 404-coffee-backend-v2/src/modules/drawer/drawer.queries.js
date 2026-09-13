import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { CashDrawerShift, CashDrawerTransaction, DrawerShiftAlert } from './drawer.models.js';
import { shiftDto, transactionDto } from './drawer.service.js';
const d = { CashDrawerShift, CashDrawerTransaction, DrawerShiftAlert };
export async function listShifts(f = {}, c = {}) {
  const m = c.drawerModels ?? d,
    { page, limit } = parsePage(f),
    { skip } = buildSkipLimit({ page, limit }),
    match = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.from || f.to
        ? {
            openedAt: {
              ...(f.from ? { $gte: new Date(f.from) } : {}),
              ...(f.to ? { $lte: new Date(f.to) } : {})
            }
          }
        : {})
    };
  const [rows, totalItems] = await Promise.all([
    m.CashDrawerShift.find(match).sort({ openedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    m.CashDrawerShift.countDocuments(match)
  ]);
  return {
    items: rows.map(shiftDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { openedAt: -1 } })
  };
}
export async function getShift(id, c = {}) {
  const m = c.drawerModels ?? d,
    shift = await m.CashDrawerShift.findById(id).lean();
  if (!shift)
    throw new ApiError({
      code: 'DRAWER_SHIFT_NOT_FOUND',
      status: 404,
      messageAr: 'الوردية غير موجودة'
    });
  const [transactions, alerts] = await Promise.all([
    m.CashDrawerTransaction.find({ shiftId: id }).sort({ sequenceNo: -1 }).limit(10).lean(),
    m.DrawerShiftAlert.find({ shiftId: id }).sort({ thresholdHours: -1 }).limit(10).lean()
  ]);
  return {
    shift: shiftDto(shift),
    summary: { transactionCount: shift.transactionCount },
    transactions: { items: transactions.map(transactionDto) },
    alerts: { items: alerts }
  };
}
export async function getDrawerScreen(c = {}) {
  const m = c.drawerModels ?? d;
  const shift = await m.CashDrawerShift.findOne({ status: 'OPEN', scopeId: c.actorId }).lean();
  return {
    currentShift: shift ? shiftDto(shift) : null,
    summary: shift
      ? {
          balance: shiftDto(shift).expectedClosingBalance,
          cashIn: shiftDto(shift).totalCashIn,
          cashOut: shiftDto(shift).totalCashOut
        }
      : null,
    recentTransactions: {
      items: shift
        ? (
            await m.CashDrawerTransaction.find({ shiftId: shift._id })
              .sort({ sequenceNo: -1 })
              .limit(10)
              .lean()
          ).map(transactionDto)
        : []
    },
    openShiftAlerts: {
      items: shift
        ? await m.DrawerShiftAlert.find({ shiftId: shift._id })
            .sort({ thresholdHours: -1 })
            .limit(10)
            .lean()
        : []
    },
    permissions: { canOpen: !shift, canMove: Boolean(shift), canClose: Boolean(shift) }
  };
}
export async function getPrintData(id, c = {}) {
  const x = await getShift(id, c);
  return {
    documentType: 'CASH_DRAWER_SHIFT',
    shift: x.shift,
    transactions: x.transactions.items,
    totals: x.summary,
    reconciliation: {
      status: x.shift.reconciliationStatus,
      difference: x.shift.reconciliationDifference,
      shortage: x.shift.shortageAmount,
      surplus: x.shift.surplusAmount
    },
    alerts: x.alerts.items,
    generatedAt: new Date().toISOString()
  };
}
export async function listShiftTransactions(id, filters = {}, c = {}) {
  const m = c.drawerModels ?? d,
    { page, limit } = parsePage(filters),
    { skip } = buildSkipLimit({ page, limit });
  const match = { shiftId: id };
  const [rows, totalItems] = await Promise.all([
    m.CashDrawerTransaction.find(match).sort({ sequenceNo: -1 }).skip(skip).limit(limit).lean(),
    m.CashDrawerTransaction.countDocuments(match)
  ]);
  return {
    items: rows.map(transactionDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { sequenceNo: -1 } })
  };
}
export async function listShiftAlerts(id, filters = {}, c = {}) {
  const m = c.drawerModels ?? d,
    { page, limit } = parsePage(filters),
    { skip } = buildSkipLimit({ page, limit });
  const [rows, totalItems] = await Promise.all([
    m.DrawerShiftAlert.find({ shiftId: id })
      .sort({ thresholdHours: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    m.DrawerShiftAlert.countDocuments({ shiftId: id })
  ]);
  return {
    items: rows,
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { thresholdHours: -1 } })
  };
}
