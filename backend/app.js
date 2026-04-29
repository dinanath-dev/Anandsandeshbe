import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import paymentRoutes from './routes/paymentRoutes.js';
import formRoutes from './routes/formRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { validateEnv } from './utils/env.js';

validateEnv();

const app = express();

const frontendOrigin = (
  process.env.FRONTEND_URL || 'http://localhost:5173'
).replace(/\/+$/, '');

app.use(helmet());
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
const jsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => {
  if ((req.originalUrl || '').startsWith('/api/payment/webhook')) return next();
  return jsonParser(req, res, next);
});
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));
app.use(requestLogger);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/payment', paymentRoutes);
app.use('/api/form', formRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use(errorHandler);

export default app;
