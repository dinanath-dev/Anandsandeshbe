import express, { Router } from 'express';
import {
  createSubscription,
  handleWebhook,
  savePayment,
  verifySubscription
} from '../controllers/paymentController.js';
import { requireUser } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.post('/', requireUser, upload.single('screenshot'), savePayment);
router.post('/subscriptions', requireUser, createSubscription);
router.post('/verify-subscription', requireUser, verifySubscription);
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

export default router;
