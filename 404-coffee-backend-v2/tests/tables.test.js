import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { tableStatusBody } from '../src/modules/tables/tables.validation.js';
import {
  addSessionItems,
  cancelTableSession,
  closeSessionForOrder,
  closeTableSession,
  ensureDefaultTables,
  openTableOrder,
  setTableStatus
} from '../src/modules/tables/tables.service.js';
import { getTablesBoard } from '../src/modules/tables/tables.queries.js';
import { confirmNewOrder } from '../src/modules/orders/order.service.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 2 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const money = (value) => toDecimal128(value);
const tableDoc = (overrides = {}) => ({
  _id: id(),
  tableNumber: 5,
  outOfService: false,
  version: 0,
  save: vi.fn(),
  ...overrides
});
const sessionDoc = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'OPEN',
  tableId: id(),
  tableNumber: 5,
  activeOrderId: id(),
  save: vi.fn(),
  ...overrides
});
const dineInOrder = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'READY',
  fulfillmentType: 'DINE_IN',
  balanceDue: money('0'),
  total: money('120'),
  subtotal: money('120'),
  eventSequence: 2,
  save: vi.fn(),
  ...overrides
});
const tablesModels = (Table, TableSession) => ({ Table, TableSession });
const orderModels = (Order, OrderStatusEvent) => ({ Order, OrderStatusEvent });

describe('tables and sessions', () => {
  it('seeds the fixed set of twenty tables', async () => {
    const insertMany = vi.fn(async () => []);
    await ensureDefaultTables({
      tablesModels: tablesModels(
        { find: () => ({ select: () => ({ lean: async () => [] }) }), insertMany },
        {}
      )
    });
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(insertMany.mock.calls[0][0]).toHaveLength(20);
  });
  it('requires a reason to take a table out of service', () => {
    expect(tableStatusBody.safeParse({ outOfService: true, expectedVersion: 0 }).success).toBe(
      false
    );
    expect(
      tableStatusBody.safeParse({ outOfService: true, reason: 'كرسي مكسور', expectedVersion: 0 })
        .success
    ).toBe(true);
  });
  it('toggles service flags under version guards', async () => {
    const table = tableDoc();
    const updated = await setTableStatus(
      table._id,
      { outOfService: true, reason: 'كرسي مكسور', expectedVersion: 0 },
      {
        ...infrastructure(),
        tablesModels: { Table: { findOne: () => chain(table) } }
      }
    );
    expect(updated.outOfService).toBe(true);
    expect(updated.outOfServiceReason).toBe('كرسي مكسور');
    await expect(
      setTableStatus(
        table._id,
        { outOfService: false, expectedVersion: 9 },
        {
          ...infrastructure(),
          tablesModels: { Table: { findOne: () => chain(null) } }
        }
      )
    ).rejects.toMatchObject({ code: 'TABLE_VERSION_CONFLICT' });
  });
  it('opens the first order with a session and a dine-in ticket', async () => {
    const table = tableDoc();
    const orderId = id();
    let storedSession;
    const models = tablesModels(
      { findOne: () => chain(table) },
      {
        findOne: () => chain(null),
        create: async ([v]) => {
          storedSession = { _id: id(), version: 0, save: vi.fn(), ...v };
          return [storedSession];
        }
      }
    );
    const confirm = vi.fn(async () => ({
      order: { _id: orderId, orderNumber: 'ORD-1' },
      items: [{ _id: id() }],
      totals: { total: '120' }
    }));
    const result = await openTableOrder(
      table._id,
      {
        items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }],
        expectedTableVersion: 0
      },
      { ...infrastructure(), tablesModels: models, tablesOrderModule: { confirm } }
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentType: 'DINE_IN', channel: 'TABLE' }),
      expect.anything()
    );
    expect(String(storedSession.activeOrderId)).toBe(String(orderId));
    expect(result.session.sessionNumber).toBe('TS-00000002');
  });
  it('blocks a second opening while the table is occupied', async () => {
    const table = tableDoc();
    const models = tablesModels(
      { findOne: () => chain(table) },
      { findOne: () => chain(sessionDoc({ tableId: table._id })) }
    );
    await expect(
      openTableOrder(
        table._id,
        {
          items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }],
          expectedTableVersion: 0
        },
        { ...infrastructure(), tablesModels: models, tablesOrderModule: { confirm: vi.fn() } }
      )
    ).rejects.toMatchObject({ code: 'TABLE_ALREADY_OCCUPIED' });
  });
  it('refuses opening on out-of-service tables', async () => {
    const table = tableDoc({ outOfService: true });
    await expect(
      openTableOrder(
        table._id,
        {
          items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }],
          expectedTableVersion: 0
        },
        {
          ...infrastructure(),
          tablesModels: tablesModels({ findOne: () => chain(table) }, {}),
          tablesOrderModule: { confirm: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'TABLE_OUT_OF_SERVICE' });
  });
  it('appends items only to open sessions', async () => {
    const session = sessionDoc();
    const append = vi.fn(async () => ({
      order: {},
      addedItems: [{ _id: id() }],
      totals: {},
      progress: { ready: 0, total: 2 }
    }));
    const result = await addSessionItems(
      session._id,
      {
        items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }],
        expectedSessionVersion: 0,
        expectedOrderVersion: 0
      },
      {
        ...infrastructure(),
        tablesModels: tablesModels({}, { findOne: () => chain(session) }),
        tablesOrderModule: { append }
      }
    );
    expect(append).toHaveBeenCalledTimes(1);
    expect(result.progress.total).toBe(2);
    await expect(
      addSessionItems(
        session._id,
        {
          items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }],
          expectedSessionVersion: 0,
          expectedOrderVersion: 0
        },
        {
          ...infrastructure(),
          tablesModels: tablesModels({}, { findOne: () => chain(null) }),
          tablesOrderModule: { append: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'SESSION_ITEMS_CONFLICT' });
  });
  it('closes a ready session with cash collection and a final invoice', async () => {
    const session = sessionDoc();
    const order = dineInOrder({ _id: session.activeOrderId, balanceDue: money('120') });
    const table = tableDoc({ _id: session.tableId });
    const models = tablesModels(
      { findById: () => chain(table) },
      { findOne: () => chain(session) }
    );
    const collect = vi.fn(async () => ({
      payment: { _id: id() },
      drawerTransaction: { _id: id() }
    }));
    const finalize = vi.fn(async () => ({ invoice: { _id: id() }, alreadyFinalized: false }));
    const result = await closeTableSession(
      session._id,
      { payment: { method: 'CASH', amount: '120' }, expectedVersion: 0 },
      {
        ...infrastructure(),
        tablesModels: models,
        tablesOrderModels: orderModels(
          { findOne: () => chain(order) },
          { create: async ([v]) => [v] }
        ),
        tablesPaymentsPort: { collect },
        tablesInvoicesPort: { finalize }
      }
    );
    expect(collect).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(result.session.status).toBe('CLOSED');
    expect(result.order.status).toBe('COMPLETED');
    expect(result.invoice).toBeDefined();
  });
  it('demands payment input when the session order still owes', async () => {
    const session = sessionDoc();
    const order = dineInOrder({ _id: session.activeOrderId, balanceDue: money('50') });
    await expect(
      closeTableSession(
        session._id,
        { expectedVersion: 0 },
        {
          ...infrastructure(),
          tablesModels: tablesModels({}, { findOne: () => chain(session) }),
          tablesOrderModels: orderModels({ findOne: () => chain(order) }, { create: vi.fn() })
        }
      )
    ).rejects.toMatchObject({ code: 'ORDER_PAYMENT_REQUIRED' });
  });
  it('refuses closing unless the session order is ready', async () => {
    const session = sessionDoc();
    await expect(
      closeTableSession(
        session._id,
        { expectedVersion: 0 },
        {
          ...infrastructure(),
          tablesModels: tablesModels({}, { findOne: () => chain(session) }),
          tablesOrderModels: orderModels({ findOne: () => chain(null) }, {})
        }
      )
    ).rejects.toMatchObject({ code: 'SESSION_CLOSE_CONFLICT' });
  });
  it('cancels the session together with its order', async () => {
    const session = sessionDoc();
    const order = dineInOrder({ _id: session.activeOrderId, status: 'PREPARING' });
    const cancelWhole = vi.fn(async () => ({ order: { ...order, status: 'CANCELLED' } }));
    const models = tablesModels({}, { findOne: () => chain(session) });
    const result = await cancelTableSession(
      session._id,
      { reason: 'العميل غادر', expectedVersion: 0 },
      {
        ...infrastructure(),
        tablesModels: models,
        tablesOrderModels: orderModels({ findById: () => chain(order) }, {}),
        tablesOrderModule: { cancelWhole }
      }
    );
    expect(cancelWhole).toHaveBeenCalledTimes(1);
    expect(result.session.status).toBe('CANCELLED');
    expect(result.order.status).toBe('CANCELLED');
  });
  it('resolves table ports from the active order', async () => {
    const session = sessionDoc({ status: 'CLOSED' });
    await expect(
      closeSessionForOrder(
        id(),
        {},
        { tablesModels: tablesModels({}, { findOne: async () => null }) }
      )
    ).rejects.toMatchObject({ code: 'TABLE_PORT_UNAVAILABLE' });
    expect(session.status).toBe('CLOSED');
  });
  it('builds a twenty-card board with occupancy derivation', async () => {
    const tables = Array.from({ length: 20 }, (_, index) =>
      tableDoc({ _id: id(), tableNumber: index + 1 })
    );
    const leanTables = () =>
      tables.map((table) => {
        const copy = { ...table };
        delete copy.save;
        return copy;
      });
    const session = sessionDoc({ tableId: tables[4]._id, tableNumber: 5 });
    const order = dineInOrder({ _id: session.activeOrderId, total: money('120') });
    const board = await getTablesBoard({
      tablesModels: {
        Table: {
          find: () => ({
            select: () => ({ lean: async () => leanTables() }),
            sort: () => ({ lean: async () => leanTables() })
          }),
          insertMany: vi.fn()
        },
        TableSession: {
          find: () => ({
            lean: async () => [
              { ...session, save: undefined, activeOrderId: session.activeOrderId }
            ]
          })
        }
      },
      tablesOrderModels: {
        Order: { find: () => ({ lean: async () => [order] }) },
        OrderItem: {
          find: () => ({
            lean: async () => [
              { orderId: order._id, status: 'PREPARING' },
              { orderId: order._id, status: 'READY' }
            ]
          })
        }
      }
    });
    expect(board.tables).toHaveLength(20);
    expect(board.summary).toMatchObject({ total: 20, occupied: 1, empty: 19, outOfService: 0 });
    expect(board.tables[4].occupancy).toBe('OCCUPIED');
    expect(board.tables[4].progress).toBeUndefined();
    expect(board.tables[4].order.progress).toMatchObject({ ready: 1, total: 2 });
  });
  it('skips customer linking for dine-in confirmations', async () => {
    const order = { _id: id(), version: 0, eventSequence: 0, save: vi.fn() };
    const models = {
      Order: { create: async ([v]) => [{ ...order, ...v, save: order.save }] },
      OrderItem: { create: async ([v]) => [{ _id: id(), version: 0, save: vi.fn(), ...v }] },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const upsertForOrder = vi.fn(async () => ({ _id: id() }));
    const snap = {
      product: { id: String(id()), name: 'لاتيه' },
      type: { id: String(id()), name: 'ساخن' },
      size: { id: String(id()), name: 'وسط' },
      unitSellingPrice: '60',
      addons: [],
      recipe: [],
      recipeVersion: 1
    };
    const result = await confirmNewOrder(
      {
        fulfillmentType: 'DINE_IN',
        customer: { name: 'ضيف صالة', phone: '0000000000' },
        items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }],
        tableSessionId: id()
      },
      {
        ...infrastructure(),
        orderModels: models,
        productsPort: { snapshot: async () => snap },
        inventoryPort: { allocate: async () => ({ allocations: [] }) },
        customersPort: { upsertForOrder }
      }
    );
    expect(upsertForOrder).not.toHaveBeenCalled();
    expect(result.order.fulfillmentType).toBe('DINE_IN');
  });
});
