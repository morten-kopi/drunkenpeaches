# Drunken Peaches

The members' book for private dining clubs: luncheons, the list, the venues.
Built to replace WildApricot for clubs such as **Beefsteaks & Burgundy**.
See [docs/vision.md](docs/vision.md) and [docs/architecture.md](docs/architecture.md).

## Stack

- **Next.js (App Router) + TypeScript** — full-stack, no separate backend
- **Tailwind CSS + shadcn/ui**
- **Supabase** — Postgres, Auth (email + password), Row-Level Security for tenant isolation
- **Resend** — transactional email (invites, confirmations, reminders)
- **Vercel** — hosting + daily reminder cron

Every club/chapter is a tenant (`clubs` row). All tenant tables carry
`club_id`, and **RLS enforces isolation in the database** — member reads/writes
run through the user's session; capacity/waitlist/cutoff rules live in
SECURITY DEFINER Postgres functions so they're atomic and can't be bypassed.

## Setup (production: Supabase + Vercel)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema: open the **SQL editor** and run
   [`supabase/migrations/00001_init.sql`](supabase/migrations/00001_init.sql)
   (or `supabase link && supabase db push` with the CLI).
3. **Auth → Providers → Email**: leave email+password enabled. Since the app
   sends its own emails via Resend, you can disable Supabase's confirmation
   emails (club creators are auto-confirmed; member invites go through Resend).
4. **Auth → URL Configuration**: set the Site URL to your production domain.
5. Copy from **Project Settings → API**: project URL, `anon` key,
   `service_role` key.

### 2. Resend (optional but recommended)

Create an API key at [resend.com](https://resend.com) and verify your sending
domain. Without it the app still works — emails are logged to the console and
skipped.

### 3. Vercel

Import the repo and set the environment variables (see
[`.env.example`](.env.example)):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; used for invites & cron |
| `RESEND_API_KEY` | optional — emails skipped if unset |
| `EMAIL_FROM` | e.g. `Beefsteaks & Burgundy <lunch@yourdomain.com>` |
| `NEXT_PUBLIC_APP_URL` | your production URL (used in invite links) |
| `CRON_SECRET` | any random string; protects the reminder cron |

`vercel.json` registers a daily cron (`/api/cron/reminders`, 01:00 UTC ≈ 9am
Singapore) that emails confirmed attendees ~2 days before a lunch.

### 4. First run

1. Visit `/signup` → create your club. You become its first committee admin.
2. **Members** → invite the roster (they get a Resend email to set a password).
3. **Venues** → add the restaurants you book (or create one from the lunch form).
4. **New lunch** → book the restaurant first; capacity X comes from that
   booking. Decide whether guests are allowed. Lunches start as **drafts**;
   release when ready.
5. Members sign up first-come-first-served; beyond X they're waitlisted and
   auto-promoted (with email) when seats free up.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

There is no local database — the app talks to your Supabase project.

## Project layout

```
supabase/migrations/   schema, RLS policies, business-logic functions
lib/supabase/          browser / server / admin clients + middleware session
lib/email.ts           all v1 notification emails (Resend)
app/actions/           server actions (auth, members, lunches, venues, settings)
app/c/[club]/          the club-scoped app (dashboard, lunches, members, venues…)
app/api/cron/          daily lunch-reminder cron
```
