# Deploy Backend on Vercel

## 1) Import Project
- In Vercel, import this repository.
- Set the **Root Directory** to `Anandsandeshbe/backend` (match your repo folder name).

## 2) Framework Settings
- Framework preset: **Other**.
- Build command: leave empty.
- Output directory: leave empty.
- Node version: use **`package.json` → `engines.node`** (`20.x`) or set the same under Project **Settings → General → Node.js Version**. Do **not** put `runtime: "nodejs20.x"` in `vercel.json` — Vercel rejects that and fails with *Function Runtimes must have a valid version*.

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
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (required in production per `utils/env.js`)
- Any Razorpay plan IDs / URLs your `paymentController` reads from env (see `.env` / code)

## 4) API Endpoints
- Health check: `/api/health`
- Existing routes continue as:
  - `/api/auth/*`
  - `/api/form/*`
  - `/api/payment/*`
  - `/api/admin/*`

## 5) Notes
- `server.js` is for local development (`npm run dev`).
- Vercel uses `api/index.js` plus `vercel.json` rewrites so every `/api/...` path hits the same Express app (multi-segment paths like `/api/auth/login` need this).
- Set **`FRONTEND_URL`** to your deployed SPA origin so CORS matches (e.g. `https://your-app.vercel.app`).
- **Function duration / payload limits** apply on Vercel (Hobby has a short default timeout; increase in project settings if webhooks or uploads need more time).
- **Razorpay webhook** URL in the Razorpay dashboard must be your production base + `/api/payment/webhook`.
- **File uploads** (form screenshot) use serverless memory limits; very large files may need a different storage flow.
                                      