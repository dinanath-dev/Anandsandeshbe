# Deploy Backend on Vercel

## 1) Import Project
- In Vercel, import this repository.
- Set the **Root Directory** to `Anandsandesh/backend`.

## 2) Framework Settings
- Framework preset: **Other**.
- Build command: leave empty.
- Output directory: leave empty.

## 3) Environment Variables
Add all required backend variables in Vercel Project Settings:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `FRONTEND_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `GOOGLE_SHEETS_SPREADSHEET_ID` (optional)
- `GOOGLE_SHEETS_RANGE` (optional)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (optional)

## 4) API Endpoints
- Health check: `/api/health`
- Existing routes continue as:
  - `/api/auth/*`
  - `/api/form/*`
  - `/api/payment/*`
  - `/api/admin/*`

## 5) Notes
- `server.js` is for local development (`npm run dev`).
- Vercel uses `api/[...all].js` serverless entrypoint.
