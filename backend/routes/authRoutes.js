import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getCurrentUser,
  loginWithPassword,
  requestOtp,
  resetPasswordWithOtp,
  verifyOtp
} from '../controllers/authController.js';
import { requireUser } from '../middlewares/auth.js';

const router = Router();
const authRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP attempts. Please wait and try again.' }
});

router.post('/request-otp', authRateLimit, requestOtp);
router.post('/verify-otp', authRateLimit, verifyOtp);
router.post('/login', authRateLimit, loginWithPassword);
router.post('/reset-password', authRateLimit, resetPasswordWithOtp);
router.get('/me', requireUser, getCurrentUser);

export default router;
