# EmailFlow AI

EmailFlow AI is a production-oriented Next.js 15 app for permission-based Gmail draft automation. It includes Supabase auth/database, Gmail OAuth with compose scope, reusable templates, CSV contact imports, personalization previews, draft creation, explicit send confirmation, rate limiting, and RLS-backed data isolation.

## Stack

- Next.js 15 App Router, TypeScript, Tailwind CSS
- shadcn/ui base-nova components
- Supabase Auth and Postgres with RLS
- Google OAuth and Gmail API
- Zod, React Hook Form, Papaparse, Vitest

## Local Setup

1. Copy `.env.example` to `.env.local` and fill in values.
2. Run the SQL in `supabase/migrations/202607060001_initial_schema.sql` in your Supabase project.
3. Configure Google OAuth with the Gmail API enabled and `GOOGLE_REDIRECT_URI` pointing to `/api/gmail/callback`.
4. Start the app:

```bash
npm install
npm run dev
```

## Required Environment

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
NEXT_PUBLIC_APP_URL=
ENCRYPTION_KEY=
```

`ENCRYPTION_KEY` can be a long random string, a 32-byte hex value, or a 32-byte base64 value. Gmail tokens are encrypted server-side before storage.

## Safety Defaults

- Gmail draft creation is the primary flow.
- Sending requires explicit confirmation and a permission checkbox.
- Campaigns are capped at 50 recipients by default.
- API routes require Supabase auth and Zod validation.
- Sensitive Gmail routes are rate limited.
- The app does not support scraping, purchased lists, hidden sender identity, or unsolicited bulk email.

## Validation

```bash
npm run lint
npm run test
npm run build
```

## Vercel Deployment

Set the same environment variables in Vercel, then deploy:

```bash
npx vercel
```

For production, set `NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI` to the deployed URL.
