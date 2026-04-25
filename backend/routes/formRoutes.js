import { Router } from 'express';
import { getMySubmission, saveForm } from '../controllers/formController.js';
import { requireUser } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.get('/me', requireUser, getMySubmission);
router.post('/', requireUser, upload.single('screenshot'), saveForm);

export default router;
