import app from './app.js';
import { logStartupServices } from './utils/serviceLogger.js';
import { logger } from './utils/logger.js';

const port = process.env.PORT || 5000;

app.listen(port, () => {
  logger.info('server.listen', { port: Number(port) });
  logStartupServices();
});
