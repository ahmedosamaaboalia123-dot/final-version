export const tableDto = (table) => ({
  id: String(table._id),
  tableNumber: table.tableNumber,
  outOfService: table.outOfService,
  version: table.version ?? 0
});

export const sessionDto = (session) => ({
  id: String(session._id),
  sessionNumber: session.sessionNumber,
  tableId: String(session.tableId),
  tableNumber: session.tableNumber,
  status: session.status,
  activeOrderId: session.activeOrderId ? String(session.activeOrderId) : null,
  openedAt: session.openedAt,
  closedAt: session.closedAt ?? null,
  version: session.version ?? 0
});
