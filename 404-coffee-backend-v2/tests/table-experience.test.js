import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { resolveGuestSession } from '../src/modules/table-experience/table-experience.middleware.js';
import {
  bootstrapGuestSession,
  cancelProposal,
  confirmProposal,
  reviewProposal,
  rotateTableQr,
  submitGuestReview,
  submitProposal
} from '../src/modules/table-experience/table-experience.service.js';
import { submitOrderReview } from '../src/modules/reviews/review.service.js';
import { hashToken } from '../src/shared/utils/hash-token.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 4 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const money = (value) => toDecimal128(value);
const QR = 'qr-secret-value-0123456789abcdef';
const snap = () => ({
  product: { id: String(id()), name: 'لاتيه' },
  type: { id: String(id()), name: 'ساخن' },
  size: { id: String(id()), name: 'وسط' },
  unitSellingPrice: '60',
  addons: [],
  recipe: [],
  recipeVersion: 1
});
const tableDoc = (overrides = {}) => ({
  _id: id(),
  tableNumber: 5,
  outOfService: false,
  version: 0,
  qrVersion: 1,
  currentQrSecretHash: hashToken(QR),
  save: vi.fn(),
  ...overrides
});
const guestDoc = (overrides = {}) => ({
  _id: id(),
  tableId: id(),
  tableNumber: 5,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 3600000),
  save: vi.fn(),
  ...overrides
});
const proposalDoc = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'WAITING_WAITER',
  tableId: id(),
  guestSessionId: id(),
  items: [{ productId: id(), productSizeId: id(), quantity: 2, addonIds: [], notes: null }],
  save: vi.fn(),
  ...overrides
});
const proposalInput = () => ({
  items: [{ productId: String(id()), productSizeId: String(id()), quantity: 2 }]
});

describe('table guest experience', () => {
  it('rejects bootstrap with a wrong qr secret', async () => {
    const table = tableDoc();
    await expect(
      bootstrapGuestSession(
        { tableNumber: 5, qrSecret: 'wrong-secret-value-0123456789' },
        {
          ...infrastructure(),
          tableGuestModels: {
            Table: { findOne: () => ({ select: () => table }) }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'TABLE_QR_INVALID' });
  });
  it('bootstraps a guest session with a single-use token', async () => {
    const table = tableDoc();
    let stored;
    const result = await bootstrapGuestSession(
      { tableNumber: 5, qrSecret: QR },
      {
        ...infrastructure(),
        tableGuestModels: {
          Table: { findOne: () => ({ select: () => table }) },
          TableGuestSession: {
            create: async ([v]) => {
              stored = { _id: id(), ...v };
              return [stored];
            }
          },
          TableOrderProposal: {}
        }
      }
    );
    expect(result.tableToken).toBeDefined();
    expect(stored.tokenHash).toBe(hashToken(result.tableToken));
    expect(stored.qrVersion).toBe(1);
  });
  it('rotates qr secrets and revokes live guest sessions', async () => {
    const table = tableDoc();
    const updateMany = vi.fn(async () => ({}));
    const result = await rotateTableQr(
      table._id,
      { expectedVersion: 0 },
      {
        ...infrastructure(),
        tableGuestModels: {
          Table: { findOne: () => chain(table) },
          TableGuestSession: { updateMany }
        }
      }
    );
    expect(result.qrVersion).toBe(2);
    expect(table.currentQrSecretHash).toBe(hashToken(result.qrSecret));
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
  it('stores proposals as snapshots without touching orders or stock', async () => {
    const guest = guestDoc();
    let stored;
    const open = vi.fn(async () => ({}));
    const append = vi.fn(async () => ({}));
    const notifyProposal = vi.fn(async () => ({
      serviceRequest: { _id: id() },
      alreadyOpen: false
    }));
    const { proposal, serviceRequest } = await submitProposal(guest, proposalInput(), {
      ...infrastructure(),
      tableGuestModels: {
        TableOrderProposal: {
          findOne: () => chain(null),
          create: async ([v]) => {
            stored = { _id: id(), version: 0, status: 'WAITING_WAITER', ...v };
            return [stored];
          }
        }
      },
      guestProductsPort: { snapshot: async () => snap() },
      tablesModule: { open },
      orderModule: { append },
      tableServicesPort: { notifyProposal }
    });
    expect(proposal.status).toBe('WAITING_WAITER');
    expect(serviceRequest).toBeDefined();
    expect(notifyProposal).toHaveBeenCalledTimes(1);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].productName).toBe('لاتيه');
    expect(open).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
  it('blocks a second active proposal per guest session', async () => {
    const guest = guestDoc();
    await expect(
      submitProposal(guest, proposalInput(), {
        ...infrastructure(),
        tableGuestModels: {
          TableOrderProposal: { findOne: () => chain(proposalDoc({ guestSessionId: guest._id })) }
        },
        guestProductsPort: { snapshot: async () => snap() }
      })
    ).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_OPEN' });
  });
  it('lets guests cancel their open proposal', async () => {
    const guest = guestDoc();
    const proposal = proposalDoc({ guestSessionId: guest._id });
    const result = await cancelProposal(guest, String(proposal._id), {
      ...infrastructure(),
      tableGuestModels: { TableOrderProposal: { findOne: () => chain(proposal) } }
    });
    expect(result.status).toBe('CANCELLED');
    await expect(
      cancelProposal(guest, String(proposal._id), {
        ...infrastructure(),
        tableGuestModels: { TableOrderProposal: { findOne: () => chain(null) } }
      })
    ).rejects.toMatchObject({ code: 'PROPOSAL_CANCEL_CONFLICT' });
  });
  it('walks proposals through waiter review states', async () => {
    const proposal = proposalDoc();
    const models = { TableOrderProposal: { findOne: () => chain(proposal) } };
    const reviewed = await reviewProposal(
      proposal._id,
      { to: 'UNDER_REVIEW', expectedVersion: 0 },
      { ...infrastructure(), tableGuestModels: models }
    );
    expect(reviewed.status).toBe('UNDER_REVIEW');
    const changed = await reviewProposal(
      proposal._id,
      { to: 'NEEDS_CHANGES', note: 'وضح الحجم', expectedVersion: 0 },
      { ...infrastructure(), tableGuestModels: models }
    );
    expect(changed.status).toBe('NEEDS_CHANGES');
    expect(changed.reviewNote).toBe('وضح الحجم');
    await expect(
      reviewProposal(
        proposal._id,
        { to: 'UNDER_REVIEW', expectedVersion: 0 },
        { ...infrastructure(), tableGuestModels: models }
      )
    ).rejects.toMatchObject({ code: 'PROPOSAL_REVIEW_CONFLICT' });
  });
  it('confirms into the open session order when one exists', async () => {
    const table = tableDoc();
    const proposal = proposalDoc({ tableId: table._id });
    const active = { _id: id(), activeOrderId: id() };
    const order = { _id: active.activeOrderId, version: 2, status: 'PREPARING' };
    const fullOrder = { _id: order._id, save: vi.fn() };
    const append = vi.fn(async () => ({ order, addedItems: [{}], totals: {}, progress: {} }));
    const open = vi.fn(async () => ({}));
    const result = await confirmProposal(
      proposal._id,
      { expectedVersion: 0, expectedTableVersion: 0, expectedOrderVersion: 2 },
      {
        ...infrastructure(),
        tableGuestModels: {
          TableOrderProposal: { findOne: () => chain(proposal) },
          Table: { findOne: () => chain(table) }
        },
        tablesModels: { TableSession: { findOne: () => chain(active) } },
        tablesModule: { open },
        orderModule: { append },
        guestOrderModels: { Order: { findById: () => chain(fullOrder) } }
      }
    );
    expect(append).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(result.proposal.status).toBe('CONFIRMED');
    expect(String(result.proposal.confirmedOrderId)).toBe(String(order._id));
    expect(String(fullOrder.tableGuestSessionId)).toBe(String(proposal.guestSessionId));
  });
  it('opens a fresh session order when the table is free', async () => {
    const table = tableDoc();
    const proposal = proposalDoc({ tableId: table._id });
    const order = { _id: id(), version: 0, status: 'CONFIRMED' };
    const session = { _id: id(), status: 'OPEN' };
    const fullOrder = { _id: order._id, save: vi.fn() };
    const open = vi.fn(async () => ({ table, session, order, items: [], totals: {} }));
    const result = await confirmProposal(
      proposal._id,
      { expectedVersion: 0, expectedTableVersion: 0 },
      {
        ...infrastructure(),
        tableGuestModels: {
          TableOrderProposal: { findOne: () => chain(proposal) },
          Table: { findOne: () => chain(table) }
        },
        tablesModels: { TableSession: { findOne: () => chain(null) } },
        tablesModule: { open },
        orderModule: { append: vi.fn() },
        guestOrderModels: { Order: { findById: () => chain(fullOrder) } }
      }
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(result.proposal.status).toBe('CONFIRMED');
  });
  it('rejects confirming an already confirmed proposal', async () => {
    const proposal = proposalDoc({ status: 'CONFIRMED' });
    await expect(
      confirmProposal(
        proposal._id,
        { expectedVersion: 0, expectedTableVersion: 0 },
        {
          ...infrastructure(),
          tableGuestModels: {
            TableOrderProposal: { findOne: () => chain(null) },
            Table: {}
          }
        }
      )
    ).rejects.toMatchObject({ code: 'PROPOSAL_CONFIRM_CONFLICT' });
  });
  it('isolates guest sessions by token', async () => {
    const correct = 'correct-token-value-0123456789ab';
    const session = guestDoc({ tokenHash: hashToken(correct) });
    const models = {
      TableGuestSession: {
        findOne: (query) => ({
          select: () =>
            query.tokenHash === hashToken(correct) ? { ...session, save: vi.fn() } : null
        })
      }
    };
    await expect(
      resolveGuestSession('wrong-token-value-0123456789abcdef', { tableGuestModels: models })
    ).rejects.toMatchObject({ code: 'TABLE_TOKEN_INVALID' });
    const expired = guestDoc({
      tokenHash: hashToken('expired-token-value-0123456789ab'),
      expiresAt: new Date(Date.now() - 1000),
      save: vi.fn()
    });
    await expect(
      resolveGuestSession('expired-token-value-0123456789ab', {
        tableGuestModels: {
          TableGuestSession: { findOne: () => ({ select: () => expired }) }
        }
      })
    ).rejects.toMatchObject({ code: 'TABLE_TOKEN_EXPIRED' });
    expect(expired.status).toBe('EXPIRED');
  });
  it('reviews dine-in orders only through their own guest session', async () => {
    const guest = guestDoc();
    const order = {
      _id: id(),
      status: 'COMPLETED',
      fulfillmentType: 'DINE_IN',
      customerId: null
    };
    const submit = vi.fn(async () => ({ _id: id() }));
    const models = {
      TableOrderProposal: {
        findOne: () => ({ lean: async () => ({ _id: id(), status: 'CONFIRMED' }) })
      }
    };
    const result = await submitGuestReview(
      guest,
      order._id,
      { rating: 5, expectedOrderVersion: 0 },
      {
        ...infrastructure(),
        tableGuestModels: models,
        guestOrderModels: { Order: { findById: () => ({ lean: async () => order }) } },
        guestReviewModule: { submit }
      }
    );
    expect(submit).toHaveBeenCalledWith(
      order._id,
      expect.objectContaining({ owner: { type: 'GUEST', guestSessionId: guest._id } }),
      expect.anything()
    );
    expect(result).toBeDefined();
    await expect(
      submitGuestReview(
        guest,
        order._id,
        { rating: 5, expectedOrderVersion: 0 },
        {
          ...infrastructure(),
          tableGuestModels: {
            TableOrderProposal: { findOne: () => ({ lean: async () => null }) }
          },
          guestOrderModels: { Order: { findById: () => ({ lean: async () => order }) } },
          guestReviewModule: { submit: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'REVIEW_GUEST_NOT_LINKED' });
  });
  it('stores guest ownership on dine-in reviews', async () => {
    const guestId = id();
    const order = {
      _id: id(),
      version: 0,
      status: 'COMPLETED',
      fulfillmentType: 'DINE_IN',
      customerId: null
    };
    let stored;
    const review = await submitOrderReview(
      order._id,
      { rating: 4, expectedOrderVersion: 0, owner: { type: 'GUEST', guestSessionId: guestId } },
      {
        ...infrastructure(),
        reviewModels: {
          Order: { findById: () => chain(order) },
          OrderReview: {
            create: async ([v]) => {
              stored = { _id: id(), version: 0, ...v };
              return [stored];
            }
          },
          OrderReviewRevision: { create: vi.fn() }
        }
      }
    );
    expect(String(review.tableGuestSessionId)).toBe(String(guestId));
    expect(review.customerId).toBeUndefined();
    expect(money('1')).toBeDefined();
  });
  it('keeps dine-in reviews closed to the admin customer path', async () => {
    const order = {
      _id: id(),
      version: 0,
      status: 'COMPLETED',
      fulfillmentType: 'DINE_IN',
      customerId: null
    };
    await expect(
      submitOrderReview(
        order._id,
        { rating: 4, expectedOrderVersion: 0 },
        {
          ...infrastructure(),
          reviewModels: {
            Order: { findById: () => chain(order) },
            OrderReview: { create: vi.fn() },
            OrderReviewRevision: { create: vi.fn() }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'REVIEW_FULFILLMENT_DEFERRED' });
  });
});
