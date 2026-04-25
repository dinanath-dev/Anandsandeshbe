# SSDN Payment Submission App

Production-ready full-stack donation / details submission using React, Vite, Tailwind CSS, Express, and Supabase PostgreSQL. Visitors land on a single form (no separate payment step). The optional `POST /api/payment` route remains if you want to pre-create rows from another client.

## Project Structure

```text
/frontend
  /src
    /components
    /pages
    /services
    /styles
/backend
  /routes
  /controllers
  /middlewares
  /models
  /utils
  server.js
```

## Supabase Setup

Create a `submissions` table:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  mobile text,
  email text,
  gender text,
  address text,
  house_no text,
  street text,
  area text,
  town text,
  district text,
  state text,
  pin text,
  rehbar text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'verified')),
  transaction_id text,
  screenshot_url text,
  subscription_type text,
  created_at timestamptz not null default now()
);
```

If you already created the table with the older shape, add the new columns in the Supabase SQL editor:

```sql
alter table public.submissions add column if not exists gender text;
alter table public.submissions add column if not exists house_no text;
alter table public.submissions add column if not exists street text;
alter table public.submissions add column if not exists area text;
alter table public.submissions add column if not exists town text;
alter table public.submissions add column if not exists district text;
alter table public.submissions add column if not exists rehbar text;
alter table public.submissions add column if not exists subscription_type text;
```

Create a private storage bucket named `payment-screenshots`.

## Environment

Copy examples and fill credentials:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

## Local Development

```bash
npm install
npm run install:all
npm run dev
```

Frontend: `http://localhost:5173`
Backend: `http://localhost:5000`

## Deployment

Backend:

1. Deploy `/backend` to Render, Railway, Fly.io, or another Node host.
2. Set all variables from `backend/.env.example`.
3. Use `npm install` as build command and `npm start` as start command.
4. Ensure `FRONTEND_URL` matches the deployed frontend URL.

Frontend:

1. Deploy `/frontend` to Vercel, Netlify, or Cloudflare Pages.
2. Set `VITE_API_BASE_URL` to your backend URL, for example `https://api.example.com/api`.
3. Build command: `npm run build`.
4. Publish directory: `dist`.

Security notes:

- Keep `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and `ADMIN_PASSWORD` server-only.
- Use HTTPS in production.
- Add Supabase RLS policies if you later expose Supabase directly to clients.
