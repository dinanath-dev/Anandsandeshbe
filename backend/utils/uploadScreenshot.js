import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabase } from './supabaseClient.js';
import { AppError } from './AppError.js';

const bucket = process.env.SUPABASE_BUCKET || 'payment-screenshots';

export async function uploadScreenshot(file) {
  if (!file) return null;

  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filePath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    throw new AppError(`Unable to upload screenshot: ${error.message}`, 500);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
