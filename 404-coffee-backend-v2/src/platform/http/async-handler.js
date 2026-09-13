export function asyncHandler(handler) {
  return function handledRequest(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
