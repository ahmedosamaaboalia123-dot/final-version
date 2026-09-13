export function mapRealtimePayload(outboxEvent) {
  return {
    eventId: String(outboxEvent._id),
    type: outboxEvent.eventType,
    aggregateType: outboxEvent.aggregateType,
    aggregateId: String(outboxEvent.aggregateId),
    sequence: outboxEvent.sequence,
    occurredAt: outboxEvent.createdAt,
    data: outboxEvent.payloadSafe ?? {},
    requestId: outboxEvent.payloadSafe?.requestId ?? null
  };
}
