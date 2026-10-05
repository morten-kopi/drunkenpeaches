# CLAUDE.md

Members' booking app for Beefsteaks & Burgundy, a private dining club in Singapore. The code is multi-tenant (every table is scoped by `club_id`), but this deployment serves one club.

This repo is the main line: PRs target `master` on `morten-kopi/drunkenpeaches`. It is public, so secrets only ever go in Vercel env vars.

Architecture, data model and access rules are in `docs/architecture.md`. Read it before changing the schema or the sign-up logic.

## Commands

- `npm run dev`, `npm run build`, `npm run lint`.
- There is no test suite. Verify changes with `npx tsc --noEmit`, `npm run lint` and `npm run build`. The build runs without real credentials if `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set to placeholders.

## Database

- Schema changes are new files in `supabase/migrations/`, applied with `supabase db push`. Never change the schema in the Supabase SQL editor.
- Push a migration before merging the code that depends on it. Preview deployments and production share one database, so unmerged code runs against the live schema.
- New tables need RLS policies and explicit `GRANT`s to `anon` and `authenticated`.
- Business rules (capacity, waitlist, sign-up windows, speaking roles) live in SECURITY DEFINER functions in the migrations. Writes that enforce a rule go through those functions, not direct table updates.

## Dates and times

- `lunch_date` and `start_time` are wall-clock values in the club's zone (`clubs.timezone`, e.g. `Asia/Singapore`). Timestamps such as `signup_cutoff_at` are stored as exact instants.
- Convert only through the helpers: `todayInZone`, `dateInZone` and `fmtDateTime(iso, timeZone)` in `lib/format.ts`; `lunchStartAt`, `addClubDays`, `toDatetimeLocalValue` and `fromDatetimeLocalValue` in `lib/signup-phases.ts`.
- Never use `toISOString().slice(0, 10)` for "today" or `new Date(localString)` for form input. Both read the server's or the browser's zone instead of the club's.
- Change a club's zone only through the `set_club_timezone` function, which moves upcoming lunches' sign-up windows with it.

## Email

- All emails are in `lib/email.ts`. Without `RESEND_API_KEY` they are skipped, and the log records only the recipient and subject.
- Sign emails with the club's name, never a hard-coded one.

## Scope

Keep features basic. Improve what exists before adding anything new.
