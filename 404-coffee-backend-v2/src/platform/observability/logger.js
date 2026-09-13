import { getRequestContext } from '../context/request-context.js';
import { redactSensitive } from './redact.js';

export function createLogger({ sink = console } = {}) {
  const write = (level, message, fields = {}) => {
    const entry = {
      level,
      message,
      ...getRequestContext(),
      ...redactSensitive(fields),
      timestamp: new Date().toISOString()
    };
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    sink[method](JSON.stringify(entry));
  };
  return Object.freeze({
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
  });
}

export const logger = createLogger();
