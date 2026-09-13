import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveBody,
  serviceBody
} from '../src/modules/table-services/table-services.validation.js';
import {
  cancelServiceRequest,
  closeSessionServices,
  createOrderReviewRequest,
  createServiceRequest,
  resolveProposalServices,
  resolveServiceRequest
} from '../src/modules/table-services/table-services.service.js';
import { getServicesScreen } from '../src/modules/table-services/table-services.queries.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'GUEST',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 6 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const guestDoc = (overrides = {}) => ({
  _id: id(),
  tableId: id(),
  tableNumber: 5,
  status: 'ACTIVE',
  ...overrides
});
const requestDoc = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'OPEN',
  type: 'WATER_REQUEST',
  requestedAt: new Date('2026-09-11T10:00:00Z'),
  save: vi.fn(),
  ...overrides
});
const serviceModels = (TableServiceRequest, TableServiceStatusEvent) => ({
  TableServiceRequest,
  TableServiceStatusEvent: TableServiceStatusEvent ?? { create: async ([v]) => [v] }
});

describe('table services', () => {
  it('validates per-type fields and handled results at the boundary', () => {
    expect(serviceBody.safeParse({ type: 'WATER_REQUEST' }).success).toBe(true);
    expect(serviceBody.safeParse({ type: 'REPORT_PROBLEM' }).success).toBe(false);
    expect(serviceBody.safeParse({ type: 'REPORT_PROBLEM', details: 'كرسي مكسور' }).success).toBe(
      true
    );
    expect(resolveBody.safeParse({ resultCode: 'HANDLED', expectedVersion: 0 }).success).toBe(true);
    expect(resolveBody.safeParse({ resultCode: 'IGNORED', expectedVersion: 0 }).success).toBe(
      false
    );
  });
  it('scopes owner keys to guest sessions before the first confirmed order', async () => {
    const guest = guestDoc();
    let stored;
    const { serviceRequest, alreadyOpen } = await createServiceRequest(
      guest,
      { type: 'WATER_REQUEST', requestedQuantity: 2 },
      {
        ...infrastructure(),
        tableServiceModels: serviceModels({
          findOne: () => chain(null),
          create: async ([v]) => {
            stored = { _id: id(), version: 0, status: 'OPEN', ...v };
            return [stored];
          }
        }),
        serviceSessionModels: { TableSession: { findOne: async () => null } }
      }
    );
    expect(alreadyOpen).toBe(false);
    expect(stored.requestOwnerKey).toBe(`GUEST:${guest._id}`);
    expect(stored.tableSessionId).toBe(null);
    expect(serviceRequest).toBe(stored);
  });
  it('scopes owner keys to operating sessions once confirmed', async () => {
    const guest = guestDoc();
    const active = { _id: id(), activeOrderId: id() };
    let stored;
    await createServiceRequest(
      guest,
      { type: 'CALL_WAITER' },
      {
        ...infrastructure(),
        tableServiceModels: serviceModels({
          findOne: () => chain(null),
          create: async ([v]) => {
            stored = { _id: id(), version: 0, status: 'OPEN', ...v };
            return [stored];
          }
        }),
        serviceSessionModels: { TableSession: { findOne: async () => active } }
      }
    );
    expect(stored.requestOwnerKey).toBe(`SESSION:${active._id}`);
    expect(String(stored.tableSessionId)).toBe(String(active._id));
  });
  it('dedupes parallel taps into the open request', async () => {
    const guest = guestDoc();
    const existing = requestDoc();
    const create = vi.fn(async () => {
      throw new Error('should use the open duplicate');
    });
    const result = await createServiceRequest(
      guest,
      { type: 'WATER_REQUEST' },
      {
        ...infrastructure(),
        tableServiceModels: serviceModels({ findOne: () => chain(existing), create }),
        serviceSessionModels: { TableSession: { findOne: async () => null } }
      }
    );
    expect(result).toMatchObject({ alreadyOpen: true });
    expect(String(result.serviceRequest._id)).toBe(String(existing._id));
    expect(create).not.toHaveBeenCalled();
  });
  it('requires an active order for bill requests', async () => {
    const guest = guestDoc();
    await expect(
      createServiceRequest(
        guest,
        { type: 'BILL_REQUEST' },
        {
          ...infrastructure(),
          tableServiceModels: serviceModels({ findOne: () => chain(null) }),
          serviceSessionModels: { TableSession: { findOne: async () => null } }
        }
      )
    ).rejects.toMatchObject({ code: 'BILL_NO_ACTIVE_ORDER' });
  });
  it('raises problem reports to high priority', async () => {
    const guest = guestDoc();
    let stored;
    await createServiceRequest(
      guest,
      { type: 'REPORT_PROBLEM', details: 'تكييف لا يعمل' },
      {
        ...infrastructure(),
        tableServiceModels: serviceModels({
          findOne: () => chain(null),
          create: async ([v]) => {
            stored = { _id: id(), version: 0, status: 'OPEN', ...v };
            return [stored];
          }
        }),
        serviceSessionModels: { TableSession: { findOne: async () => null } }
      }
    );
    expect(stored.priority).toBe('HIGH');
  });
  it('resolves open requests with measured response time', async () => {
    const request = requestDoc();
    const resolved = await resolveServiceRequest(
      request._id,
      { resolutionNote: 'تم', resultCode: 'HANDLED', expectedVersion: 0 },
      {
        ...infrastructure(),
        tableServiceModels: serviceModels(
          { findOne: () => chain(request) },
          { create: async ([v]) => [v] }
        )
      }
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resultCode).toBe('HANDLED');
    expect(typeof resolved.responseDurationSeconds).toBe('number');
    await expect(
      resolveServiceRequest(
        request._id,
        { resultCode: 'HANDLED', expectedVersion: 0 },
        {
          ...infrastructure(),
          tableServiceModels: serviceModels({ findOne: () => chain(null) })
        }
      )
    ).rejects.toMatchObject({ code: 'SERVICE_RESOLVE_CONFLICT' });
  });
  it('lets guests cancel only their own open requests', async () => {
    const guest = guestDoc();
    const request = requestDoc({ guestSessionId: guest._id });
    const cancelled = await cancelServiceRequest(
      guest,
      request._id,
      { expectedVersion: 0 },
      {
        ...infrastructure(),
        tableServiceModels: serviceModels(
          { findOne: () => chain(request) },
          { create: async ([v]) => [v] }
        )
      }
    );
    expect(cancelled.status).toBe('CANCELLED');
    const stranger = guestDoc();
    await expect(
      cancelServiceRequest(
        stranger,
        request._id,
        { expectedVersion: 0 },
        {
          ...infrastructure(),
          tableServiceModels: serviceModels({ findOne: () => chain(null) })
        }
      )
    ).rejects.toMatchObject({ code: 'SERVICE_CANCEL_CONFLICT' });
  });
  it('opens order-review calls for submitted proposals', async () => {
    const proposal = { _id: id(), tableId: id(), tableNumber: 5, guestSessionId: id() };
    let stored;
    const { serviceRequest, alreadyOpen } = await createOrderReviewRequest(proposal, {
      ...infrastructure(),
      tableServiceModels: serviceModels({
        findOne: () => chain(null),
        create: async ([v]) => {
          stored = { _id: id(), version: 0, status: 'OPEN', ...v };
          return [stored];
        }
      }),
      serviceSessionModels: { TableSession: { findOne: async () => null } }
    });
    expect(alreadyOpen).toBe(false);
    expect(serviceRequest).toMatchObject({ type: 'CALL_WAITER', purpose: 'ORDER_REVIEW' });
    expect(String(stored.proposalId)).toBe(String(proposal._id));
  });
  it('settles bill calls automatically while cancelling the rest on close', async () => {
    const sessionId = id();
    const bill = requestDoc({ type: 'BILL_REQUEST', save: vi.fn() });
    const water = requestDoc({ type: 'WATER_REQUEST', save: vi.fn() });
    const result = await closeSessionServices(sessionId, {
      ...infrastructure(),
      tableServiceModels: serviceModels(
        { find: () => chain([bill, water]) },
        { create: async ([v]) => [v] }
      )
    });
    expect(result).toMatchObject({ resolved: 1, cancelled: 1 });
    expect(bill.status).toBe('RESOLVED');
    expect(water.status).toBe('CANCELLED');
  });
  it('clears proposal calls once waiters confirm', async () => {
    const proposalId = id();
    const call = requestDoc({ type: 'CALL_WAITER', save: vi.fn() });
    const result = await resolveProposalServices(proposalId, {
      ...infrastructure(),
      tableServiceModels: serviceModels(
        { find: () => chain([call]) },
        { create: async ([v]) => [v] }
      )
    });
    expect(result).toMatchObject({ resolved: 1 });
    expect(call.status).toBe('RESOLVED');
  });
  it('summarizes the admin screen with response averages', async () => {
    const open = requestDoc({ type: 'CALL_WAITER' });
    const screen = await getServicesScreen(
      { tab: 'open', page: 1, limit: 10 },
      {
        tableServiceModels: {
          TableServiceRequest: {
            find: (query) => ({
              lean: async () => [],
              sort: () => ({
                skip: () => ({
                  limit: () => ({
                    lean: async () => (query.status === 'OPEN' ? [open] : [])
                  })
                }),
                limit: () => ({ lean: async () => [] })
              })
            }),
            countDocuments: async (query) => (query.status === 'OPEN' && !query.priority ? 1 : 0)
          }
        }
      }
    );
    expect(screen.summary).toMatchObject({ open: 1, highPriority: 0 });
    expect(screen.openRequests).toHaveLength(1);
    expect(screen.filters.types).toContain('BILL_REQUEST');
  });
});
