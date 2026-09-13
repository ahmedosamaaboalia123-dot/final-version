import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { screenQuery } from '../src/modules/reports/reports.validation.js';
import {
  getDelegateReport,
  getFinancialReportScreen,
  getSalesReport,
  requestReportExport
} from '../src/modules/reports/reports.service.js';
import {
  getAuditEvent,
  getAuditScreen,
  getEntityTimeline
} from '../src/modules/audit/audit.queries.js';
import {
  createNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../src/modules/notifications/notifications.service.js';
import { listNotifications } from '../src/modules/notifications/notifications.queries.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId();
const money = (value) => toDecimal128(value);
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 9 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] },
  now: new Date('2026-09-11T10:00:00Z')
});
const fullModels = (overrides = {}) => ({
  Order: {
    find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) }),
    countDocuments: async () => 0
  },
  OrderItem: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  OrderPayment: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  CashRefund: {
    countDocuments: async () => 0,
    find: () => ({ select: () => ({ lean: async () => [] }) })
  },
  CashDrawerTransaction: {
    find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  },
  CashDrawerShift: { countDocuments: async () => 0 },
  RawMaterial: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  RawMaterialBatch: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  InventoryMovement: {
    find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  },
  Supplier: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  SupplierAccount: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  SupplierAccountEntry: {
    find: () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) })
  },
  Delegate: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
  DeliveryAssignment: {
    find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  },
  FinancialReportCache: {
    findOne: () => ({ lean: async () => null }),
    findOneAndUpdate: async () => ({})
  },
  ...overrides
});
const orderRow = (overrides = {}) => ({
  _id: id(),
  total: money('120'),
  actualInventoryCost: money('70'),
  channel: 'ADMIN',
  createdAt: new Date('2026-09-10T10:00:00Z'),
  ...overrides
});

describe('financial reports', () => {
  it('validates report ranges at the boundary', () => {
    expect(screenQuery.safeParse({}).success).toBe(true);
    expect(screenQuery.safeParse({ from: '2026-13-01' }).success).toBe(false);
    expect(screenQuery.safeParse({ compare: 'none' }).success).toBe(true);
  });
  it('builds screen cards from every source at once', async () => {
    const screen = await getFinancialReportScreen(
      { from: '2026-09-01', to: '2026-09-10', compare: 'none' },
      {
        ...infrastructure(),
        reportsModels: fullModels({
          Order: {
            find: () => ({
              select: () => ({ sort: () => ({ lean: async () => [orderRow(), orderRow()] }) })
            })
          },
          CashDrawerTransaction: {
            find: () => ({
              select: () => ({
                sort: () => ({
                  lean: async () => [
                    { direction: 'IN', amount: money('500'), accountingClass: 'ORDER_CASH_SALE' },
                    { direction: 'OUT', amount: money('100'), accountingClass: 'EXPENSE' }
                  ]
                })
              })
            })
          },
          SupplierAccount: {
            find: () => ({
              select: () => ({
                lean: async () => [
                  { supplierId: id(), debtBalance: money('300'), receivableBalance: money('40') }
                ]
              })
            })
          },
          DeliveryAssignment: {
            find: () => ({
              select: () => ({
                sort: () => ({
                  lean: async () => [
                    {
                      cashExpected: money('80'),
                      cashSettledTotal: money('0'),
                      status: 'IN_PROGRESS',
                      updatedAt: new Date()
                    }
                  ]
                })
              })
            })
          }
        })
      }
    );
    expect(screen.cards).toMatchObject({
      netSales: '240',
      cogs: '140',
      grossProfit: '100',
      cashIn: '500',
      cashOut: '100',
      supplierDebt: '300',
      supplierReceivable: '40',
      delegateOutstanding: '80'
    });
    expect(screen.dataQuality).toBe('COMPLETE');
    expect(screen.charts.salesTrend).toHaveLength(1);
    expect(screen.period).toMatchObject({ from: '2026-09-01', to: '2026-09-10' });
  });
  it('nulls failed sources instead of faking zeroes', async () => {
    const screen = await getFinancialReportScreen(
      { from: '2026-09-01', to: '2026-09-10', compare: 'none' },
      {
        ...infrastructure(),
        reportsModels: fullModels({
          Order: {
            find: () => {
              throw new Error('down');
            }
          }
        })
      }
    );
    expect(screen.dataQuality).toBe('ERROR');
    expect(screen.failedSources).toContain('Order');
    expect(screen.cards.netSales).toBeNull();
  });
  it('serves repeated screens from cache without re-querying', async () => {
    const find = vi.fn(() => ({
      select: () => ({ sort: () => ({ lean: async () => [orderRow()] }) })
    }));
    let cached = null;
    const models = fullModels({
      Order: { find },
      FinancialReportCache: {
        findOne: () => ({ lean: async () => cached }),
        findOneAndUpdate: async (query, update) => {
          cached = { cacheKey: query.cacheKey, payload: update.$set.payload };
          return cached;
        }
      }
    });
    const filters = { from: '2026-09-01', to: '2026-09-10', compare: 'none' };
    await getFinancialReportScreen(filters, { ...infrastructure(), reportsModels: models });
    await getFinancialReportScreen(filters, { ...infrastructure(), reportsModels: models });
    expect(find).toHaveBeenCalledTimes(1);
  });
  it('ranks top products and channels in sales details', async () => {
    const orders = [orderRow(), orderRow({ channel: 'CUSTOMER_WEB' })];
    const report = await getSalesReport(
      { from: '2026-09-01', to: '2026-09-10', page: 1, limit: 10 },
      {
        ...infrastructure(),
        reportsModels: fullModels({
          Order: {
            find: () => ({ select: () => ({ sort: () => ({ lean: async () => orders }) }) })
          },
          OrderItem: {
            find: () => ({
              select: () => ({
                lean: async () => [
                  {
                    productName: 'لاتيه',
                    sizeName: 'وسط',
                    quantity: 2,
                    lineSubtotal: money('120')
                  },
                  {
                    productName: 'اسبريسو',
                    sizeName: 'صغير',
                    quantity: 1,
                    lineSubtotal: money('40')
                  }
                ]
              })
            })
          }
        })
      }
    );
    expect(report.summary).toMatchObject({ netSales: '240', orders: 2 });
    expect(report.breakdowns.topProducts[0]).toMatchObject({ product: 'لاتيه' });
    expect(report.breakdowns.channelMix).toHaveLength(2);
    expect(report.pageMeta.totalItems).toBe(1);
  });
  it('exports reports with a stable checksum payload', async () => {
    const rows = [{ direction: 'IN', amount: money('500') }];
    let storedJob = null;
    const jobModel = {
      create: async ([v]) => {
        storedJob = { _id: id(), status: 'QUEUED', ...v };
        storedJob.save = vi.fn(async () => storedJob);
        storedJob.lean = async () => {
          const rest = { ...storedJob };
          delete rest.save;
          return rest;
        };
        return [storedJob];
      },
      findById: () => storedJob
    };
    const models = fullModels({
      CashDrawerTransaction: {
        find: () => ({ select: () => ({ sort: () => ({ lean: async () => rows }) }) })
      },
      ReportExport: jobModel
    });
    const first = await requestReportExport(
      { reportType: 'drawer', from: '2026-09-01', to: '2026-09-10', format: 'CSV' },
      { ...infrastructure(), reportsModels: models }
    );
    expect(first.export.statusUrl).toBe(`/financial-reports/exports/${first.export.id}`);
    expect(first.export.status).toBe('READY');
    await expect(
      requestReportExport(
        { reportType: 'nope', format: 'CSV' },
        { ...infrastructure(), reportsModels: models }
      )
    ).rejects.toMatchObject({ code: 'REPORT_TYPE_UNKNOWN' });
  });
  it('summarizes delegate ledgers with outstanding math', async () => {
    const report = await getDelegateReport(
      { from: '2026-09-01', to: '2026-09-10', page: 1, limit: 10 },
      {
        ...infrastructure(),
        reportsModels: fullModels({
          DeliveryAssignment: {
            find: () => ({
              select: () => ({
                sort: () => ({
                  lean: async () => [
                    {
                      _id: id(),
                      delegateId: id(),
                      status: 'IN_PROGRESS',
                      cashExpected: money('80'),
                      cashSettledTotal: money('0'),
                      updatedAt: new Date('2026-09-05T10:00:00Z')
                    }
                  ]
                })
              })
            })
          }
        })
      }
    );
    expect(report.summary).toMatchObject({ outstanding: '80', assignments: 1 });
    expect(report.pageMeta.totalItems).toBe(1);
  });
});

describe('audit trail ui', () => {
  const auditModels = (overrides = {}) => ({
    find: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }),
    countDocuments: async () => 0,
    aggregate: async () => [],
    findById: () => ({ lean: async () => null }),
    ...overrides
  });
  it('summarizes audit outcomes with applied filters', async () => {
    const screen = await getAuditScreen(
      { module: 'orders', page: 1, limit: 10 },
      {
        auditModel: {
          ...auditModels(),
          find: () => ({
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  lean: async () => [
                    {
                      eventNo: 1,
                      eventType: 'ORDER_CREATED',
                      module: 'orders',
                      action: 'CREATE',
                      result: 'SUCCESS',
                      severity: 'INFO'
                    }
                  ]
                })
              })
            })
          }),
          aggregate: async () => [
            { _id: { result: 'SUCCESS', severity: 'INFO' }, count: 1 },
            { _id: { result: 'DENIED', severity: 'CRITICAL' }, count: 2 }
          ]
        }
      }
    );
    expect(screen.summary).toMatchObject({
      total: 0,
      success: 1,
      failed: 2,
      denied: 2,
      critical: 2
    });
    expect(screen.filters).toMatchObject({ module: 'orders' });
    expect(screen.items).toHaveLength(1);
  });
  it('maps stored events to stable public ids', async () => {
    const event = {
      _id: id(),
      eventNo: 7,
      eventType: 'ORDER_CREATED',
      module: 'orders',
      result: 'SUCCESS'
    };
    const result = await getAuditEvent(event._id, {
      auditModel: { findById: () => ({ lean: async () => event }) }
    });
    expect(result.event.id).toBe(String(event._id));
    expect(result.event).not.toHaveProperty('_id');
    await expect(
      getAuditEvent(id(), { auditModel: { findById: () => ({ lean: async () => null }) } })
    ).rejects.toMatchObject({ code: 'AUDIT_NOT_FOUND' });
  });
  it('builds entity timelines in reverse time order', async () => {
    const rows = [
      {
        eventNo: 2,
        eventType: 'B',
        action: 'UPDATE',
        actor: {},
        result: 'SUCCESS',
        severity: 'INFO',
        occurredAt: new Date()
      },
      {
        eventNo: 1,
        eventType: 'A',
        action: 'CREATE',
        actor: {},
        result: 'SUCCESS',
        severity: 'INFO',
        occurredAt: new Date()
      }
    ];
    const timeline = await getEntityTimeline(
      'Order',
      String(id()),
      { page: 1, limit: 10 },
      {
        auditModel: {
          find: () => ({
            sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => rows }) }) })
          }),
          countDocuments: async () => 2
        }
      }
    );
    expect(timeline.items[0]).toMatchObject({ eventNo: 2, summary: 'UPDATE SUCCESS' });
    expect(timeline.pageMeta.totalItems).toBe(2);
  });
});

describe('notifications inbox', () => {
  it('dedupes repeat notifications for the same key', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce([{ _id: id() }])
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    const result = await createNotifications(
      ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439011'],
      { type: 'SHIFT_OPEN_TOO_LONG', title: 'وردية مفتوحة', deduplicationKey: 'shift:1:12' },
      { notificationModels: { Notification: { create } } }
    );
    expect(result).toMatchObject({ created: 1, skipped: 1 });
  });
  it('lists unread counts and marks reads', async () => {
    const row = {
      _id: id(),
      type: 'INFO',
      severity: 'INFO',
      title: 'ت',
      createdAt: new Date(),
      readAt: null
    };
    const listed = await listNotifications(
      '507f1f77bcf86cd799439011',
      { page: 1, limit: 10 },
      {
        notificationModels: {
          Notification: {
            find: () => ({
              sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [row] }) }) })
            }),
            countDocuments: async (query) => (query.readAt === null && !query.createdAt ? 3 : 1)
          }
        }
      }
    );
    expect(listed).toMatchObject({ unreadCount: 3 });
    expect(listed.items).toHaveLength(1);
    const read = await markNotificationRead(row._id, '507f1f77bcf86cd799439011', {
      notificationModels: {
        Notification: {
          findOneAndUpdate: async () => row,
          countDocuments: async () => 2
        }
      }
    });
    expect(read).toMatchObject({ updatedCount: 1, unreadCount: 2 });
    const readAll = await markAllNotificationsRead('507f1f77bcf86cd799439011', undefined, {
      notificationModels: {
        Notification: {
          updateMany: async () => ({ modifiedCount: 2 }),
          countDocuments: async () => 0
        }
      }
    });
    expect(readAll).toMatchObject({ updatedCount: 2, unreadCount: 0 });
  });
});
