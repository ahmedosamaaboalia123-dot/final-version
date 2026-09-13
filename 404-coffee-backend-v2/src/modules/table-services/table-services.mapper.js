export const serviceRequestDto = (request) => ({
  id: String(request._id),
  serviceRequestNumber: request.serviceRequestNumber,
  tableNumber: request.tableNumberSnapshot,
  type: request.type,
  purpose: request.purpose,
  priority: request.priority,
  status: request.status,
  details: request.details ?? null,
  requestedQuantity: request.requestedQuantity ?? null,
  resolutionNote: request.resolutionNote ?? null,
  responseDurationSeconds: request.responseDurationSeconds ?? null,
  version: request.version ?? 0
});
