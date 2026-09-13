import { mapRealtimePayload } from './realtime.mapper.js';
import { resolveEventRooms } from './realtime.rooms.js';

const subscribers = new Set();

export function subscribeRealtime(handler) {
  subscribers.add(handler);
  return () => subscribers.delete(handler);
}

export function clearRealtimeSubscribers() {
  subscribers.clear();
}

export async function publishRealtimeEvent(outboxEvent, context = {}) {
  const emit = context.realtimeTransport?.emit ?? fanOut;
  const rooms = resolveEventRooms(outboxEvent);
  const envelope = mapRealtimePayload(outboxEvent);
  const delivered = await emit({ rooms, envelope });
  return { rooms, envelope, delivered };
}

async function fanOut({ rooms, envelope }) {
  const deliveries = [...subscribers].map((handler) => handler({ rooms, envelope }));
  await Promise.all(deliveries);
  return subscribers.size;
}
