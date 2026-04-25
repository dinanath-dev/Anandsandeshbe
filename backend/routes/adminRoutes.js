import { Router } from 'express';
import {
  adminLogin,
  backfillGoogleSheets,
  getSubmissions,
  verifySubmission
} from '../controllers/adminController.js';
import { requireAdmin } from '../middlewares/auth.js';

const router = Router();

router.post('/login', adminLogin);
router.get('/submissions', requireAdmin, getSubmissions);
router.put('/verify/:id', requireAdmin, verifySubmission);
router.post('/sheets/backfill', requireAdmin, backfillGoogleSheets);

export default router;
