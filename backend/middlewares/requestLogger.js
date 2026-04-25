import { createRequestId, logger, maskEmail } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const requestId = createRequestId();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = Date.now();
  logger.info('http.request.start', {
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    userEmail: req.user?.email ? maskEmail(req.user.email) : undefined
  });

  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    const status = res.statusCode;
    const event = status >= 500 ? 'http.request.error' : 'http.request.done';
    logger.info(event, {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      elapsedMs
    });
  });

  next();
}
