import { getRequestMeta, logger } from '../utils/logger.js';

export function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Something went wrong.' : error.message;

  logger[statusCode >= 500 ? 'error' : 'warn']('http.error', {
    ...getRequestMeta(req),
    statusCode,
    message: error?.message,
    stack: statusCode >= 500 ? error?.stack : undefined
  });

  res.status(statusCode).json({ message });
}
