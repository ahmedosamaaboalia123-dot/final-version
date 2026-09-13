export function createEventBus() {
  const handlers = new Map();
  return Object.freeze({
    subscribe(eventType, handler) {
      const current = handlers.get(eventType) ?? new Set();
      current.add(handler);
      handlers.set(eventType, current);
      return () => current.delete(handler);
    },
    async publish(event) {
      const current = [...(handlers.get(event.eventType) ?? []), ...(handlers.get('*') ?? [])];
      await Promise.all(current.map((handler) => handler(event)));
    }
  });
}

export const eventBus = createEventBus();
