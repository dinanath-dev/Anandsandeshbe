import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new AppError('Only JPG, PNG, WEBP, or PDF files are allowed.', 400));
      return;
    }
    cb(null, true);
  }
});
