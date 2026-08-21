/** Wraps an async route handler so a thrown/rejected error reaches Express's error handler instead of crashing the process. */
export function asyncRoute(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Throw this from inside a route to return a specific HTTP status with a message. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
