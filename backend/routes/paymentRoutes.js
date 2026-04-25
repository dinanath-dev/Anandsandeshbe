import { Router } from 'express';
import { savePayment } from '../controllers/paymentController.js';
import { requireUser } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.post('/', requireUser, upload.single('screenshot'), savePayment);

export default router;
