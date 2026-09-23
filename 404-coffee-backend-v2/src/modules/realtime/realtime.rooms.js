export const ADMIN_ROOM_PERMISSIONS = Object.freeze({
  'admin:orders': 'orders.read',
  'admin:preparation': 'preparation.read',
  'admin:table-services': 'table-services.read',
  'admin:table-proposals': 'table-proposals.read'
});

export const AGGREGATE_PERMISSIONS = Object.freeze({
  Order: 'orders.read',
  OrderPayment: 'payments.read',
  InvoiceSnapshot: 'invoices.read',
  CustomerOrder: 'orders.read',
  CustomerOrderExperience: 'orders.read',
  DeliveryAssignment: 'delivery.manage',
  TableSession: 'tables.read',
  Table: 'tables.read',
  TableOrderProposal: 'table-proposals.read',
  TableServiceRequest: 'table-services.read',
  Customer: 'customers.read',
  CustomerProfile: 'customers.read',
  OrderReview: 'reviews.read',
  OrderCancellationRequest: 'order-cases.read',
  CashDrawerShift: 'drawer.read',
  Supplier: 'suppliers.read',
  SupplierAccount: 'suppliers.read',
  Employee: 'employees.permissions.manage',
  EmployeeDevice: 'employees.permissions.manage',
  Role: 'employees.permissions.manage',
  AttendanceRecord: 'attendance.read',
  Delegate: 'delegates.read',
  CashRefund: 'payments.read'
});

const payloadOrderId = (payload) => (payload?.orderId ? String(payload.orderId) : null);

export function resolveEventRooms(event) {
  const payload = event.payloadSafe ?? {};
  const orderId = payloadOrderId(payload);
  const rooms = new Set();
  const fallback = `aggregate:${event.aggregateType}:${event.aggregateId}`;
  switch (event.aggregateType) {
    case 'Order':
      if (orderId) rooms.add(`order:${orderId}`);
      rooms.add('admin:orders');
      rooms.add('admin:preparation');
      break;
    case 'OrderPayment':
    case 'InvoiceSnapshot':
    case 'CustomerOrder':
    case 'OrderCancellationRequest':
      if (orderId) rooms.add(`order:${orderId}`);
      rooms.add('admin:orders');
      break;
    case 'OrderReview':
      if (orderId) rooms.add(`order:${orderId}`);
      rooms.add('admin:orders');
      break;
    case 'DeliveryAssignment':
      if (orderId) rooms.add(`order:${orderId}`);
      rooms.add('admin:orders');
      break;
    case 'TableSession':
      if (payload.tableNumber !== undefined && payload.tableNumber !== null)
        rooms.add(`table:${payload.tableNumber}`);
      rooms.add('admin:orders');
      break;
    case 'TableOrderProposal':
      if (payload.tableNumber !== undefined && payload.tableNumber !== null)
        rooms.add(`table:${payload.tableNumber}`);
      rooms.add('admin:table-proposals');
      break;
    case 'TableServiceRequest':
      if (payload.tableNumber !== undefined && payload.tableNumber !== null)
        rooms.add(`table:${payload.tableNumber}`);
      rooms.add('admin:table-services');
      break;
    default:
      break;
  }
  rooms.add(fallback);
  return [...rooms];
}

export function isRoomAllowed(room, identity) {
  if (!identity) return false;
  if (identity.kind === 'public') return identity.rooms.includes(room);
  if (room === `employee:${identity.actorId}`) return true;
  if (
    room.startsWith('order:') ||
    room.startsWith('table:') ||
    room.startsWith('guest-session:') ||
    room.startsWith('customer-session:')
  )
    return true;
  if (room.startsWith('admin:'))
    return (identity.permissions ?? []).includes(ADMIN_ROOM_PERMISSIONS[room]);
  if (room.startsWith('aggregate:')) {
    const aggregateType = room.split(':')[1];
    return (identity.permissions ?? []).includes(AGGREGATE_PERMISSIONS[aggregateType]);
  }
  return false;
}
