const SECRET_KEY = /password|secret|token|authorization|cookie|api[-_]?key/i;

export function redactSensitive(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redactSensitive(item, seen));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : redactSensitive(item, seen)
    ])
  );
}
