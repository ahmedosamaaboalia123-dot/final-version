import { AsyncLocalStorage } from 'node:async_hooks';

const requestStorage = new AsyncLocalStorage();

export function runWithRequestContext(context, callback) {
  return requestStorage.run(Object.freeze({ ...context }), callback);
}

export function getRequestContext() {
  return requestStorage.getStore() ?? Object.freeze({});
}
