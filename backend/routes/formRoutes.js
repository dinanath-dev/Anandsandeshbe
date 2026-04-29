import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  claimLegacySubmission,
  findLegacySubmissions,
  getMySubmission,
  saveForm
} from '../controllers/formController.js';
import { requireUser } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

const legacySearchLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many legacy searches. Please wait and try again.' }
});

const legacyClaimLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many link attempts. Please wait or contact support.' }
});

router.get('/me', requireUser, getMySubmission);
router.post('/find-legacy', requireUser, legacySearchLimit, findLegacySubmissions);
router.post('/lookup-legacy', requireUser, legacySearchLimit, findLegacySubmissions);
router.post('/claim-legacy', requireUser, legacyClaimLimit, claimLegacySubmission);
router.post('/', requireUser, upload.single('screenshot'), saveForm);

export default router;
