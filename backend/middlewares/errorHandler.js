import { AppError } from '../utils/AppError.js';
import { getRequestMeta, logger } from '../utils/logger.js';

/**
 * Only `AppError` may set the HTTP status. Third-party libs (e.g. Razorpay) attach
 * `statusCode` for *their* API failures; forwarding that produced fake `401` responses
 * even when the user JWT was valid.
 */
export function errorHandler(error, req, res, _next) {
  const statusCode = error instanceof AppError ? error.statusCode || 500 : 500;
  const safeClientMessage =
    statusCode === 500 ? 'Something went wrong.' : error?.message || 'Request failed.';

  logger[statusCode >= 500 ? 'error' : 'warn']('http.error', {
    ...getRequestMeta(req),
    statusCode,
    upstreamStatus: error instanceof AppError ? undefined : error?.statusCode,
    message: error?.message || error?.toString?.() || 'unknown_error',
    stack: statusCode >= 500 ? error?.stack : undefined
  });

  res.status(statusCode).json({ message: safeClientMessage });
}
