# Architecture

Living technical companion to [vision.md](./vision.md). Records stack and key technical
decisions as they're made. Singapore product baseline (what to build next):
[plans/singapore-bsb-roadmap-2026.md](./plans/singapore-bsb-roadmap-2026.md).

## Stack (decided)

| Layer | Choice | Notes |
| --- | --- | --- |
| **Language** | TypeScript end-to-end | One language across FE + server |
| **Framework** | Next.js (App Router) | Full-stack — FE + server logic in one app |
| **Backend** | Next.js Server Actions + Route Handlers | **No separate backend service** |
| **UI** | Tailwind CSS v4 + shadcn/ui (base-ui) | "Editorial wine-cellar" design system, light + dark, mobile-first — see [Design system](#design-system-ui-2026-redesign) |
| **Database** | Supabase (Postgres) | Also provides Auth, RLS, storage, edge functions |
| **Auth** | Supabase Auth — **email + password only** (v1) | No social/magic-link for now |
| **Transactional email** | Resend | App notifications (confirmations, reminders) |
| **Hosting** | Vercel (app) + Supabase cloud (data) | Free tiers cover early scale comfortably |

## Multi-tenancy (foundational)

Tenant = **club/chapter**. Isolation is enforced at the **database** via Postgres
**Row-Level Security (RLS)**, not in application code.

- Every tenant-scoped table carries a **`club_id`**.
- A **`memberships`** table maps `user ↔ club ↔ role` (`member` | `committee`).
- RLS policies ensure a signed-in user can only read/write rows for clubs they belong to.
- **Self-serve club signup:** the person who signs up creates the club row and gets a
  `committee` membership for it (their first admin).

## Server-side privileges

- **Member-facing reads/writes** go through the user's session → RLS enforces tenant + role.
- **Privileged operations** (sending member invites, admin actions) run **server-side** in
  Next.js using the Supabase **service-role key** — never exposed to the client.
- Business rules that must be reliable (waitlist auto-promotion, sign-up cutoff locking,
  capacity changes) live in **server-side logic**, not the client.

## Why this shape

- Smallest thing to build, run, and deploy for a solo/at-cost build — one codebase, one deploy.
- RLS is the cleanest answer to the multi-tenant isolation requirement (enforced in the DB).
- Mobile-friendly web covers members signing up on phones without a native app.

## Data model (implemented — `supabase/migrations/00001_init.sql`)

- **clubs** — the tenant. Club-level settings: `signup_cutoff_days` (default
  cutoff), `committee_priority_days` / `members_only_days` /
  `guests_phase_days` (default 2 / 14 / 14) for the three-phase sign-up
  windows (`supabase/migrations/00002_signup_phases.sql`), and `timezone`.
- **memberships** — `user ↔ club ↔ role` plus the member's club-scoped profile
  (name, phone, dietary, `function` for a club office). `role`
  (member/committee), `status` (invited/active/resigned/lapsed/removed —
  never hard-deleted).
- **venues** — the restaurants the club books: name, address, contact, room
  capacity, notes. `status` is `approved` (in use) or `archived` (a venue
  with lunch history is archived instead of deleted). Created from the
  Venues page or from the venue picker on the lunch form.
- **lunches** — venue, date/time, fixed `capacity`, `status`
  (draft → released → completed / cancelled), `signup_opens_at` /
  `members_open_at` / `guests_open_at` / `signup_cutoff_at`, and the
  lunch's own guest decision (`guests_allowed`, `max_guests_per_member`;
  there is no club default since 00006). Phase logic lives in
  `lib/signup-phases.ts` and the `sign_up_for_lunch` /
  `update_my_guests` RPCs. Committee may add their own names before the
  membership, but nobody adds guests before `guests_open_at`.
- **signups** — one per member per lunch: confirmed/waitlisted/cancelled,
  `guest_count` (guests consume seats), `created_at` is the FCFS order,
  `attended` for history.
- **Unused since 00006**, kept until a cleanup migration drops them:
  `tastings` (venue pipeline), `wines` and `lunch_wines` (the Cellar),
  `lunch_roles` and its RPCs (speaking roles), `memberships.wine_master`,
  `clubs.guests_allowed` and `clubs.max_guests_per_member`. All were empty
  or unread when the features were removed.

### Business rules live in SQL functions (SECURITY DEFINER)

Sign-up, cancel, waitlist auto-promotion, capacity change, cutoff and
guest-date enforcement are Postgres functions (`sign_up_for_lunch`,
`update_my_guests`, `cancel_my_signup`, `promote_from_waitlist`,
`set_lunch_capacity`, `cancel_lunch`, …) so they are atomic (row-locked)
and cannot be bypassed from any client. `signups` has no direct write
policies at all. Promotion functions return who was promoted so the app
layer sends the notification emails.

### RLS summary

- Helpers: `is_member_of(club)`, `is_committee_of(club)` (security definer to
  avoid policy recursion).
- Members read their club, roster, venues, non-draft lunches and signups;
  committee additionally reads drafts and writes everything (sign-up writes
  only via RPCs).
- Club creation and member invites run server-side with the service-role key.

### Email (Resend, implemented)

Invite, sign-up confirmed, waitlisted, promoted from waitlist, lunch
changed/cancelled, password reset — plus a daily Vercel cron
(`/api/cron/reminders`) for the ~2-days-before reminder. No email on release
(per vision). Emails no-op gracefully when `RESEND_API_KEY` is unset.

## Design system (UI, 2026 redesign)

The front end is an **"editorial wine-cellar"** system (burgundy/oxblood +
parchment/cream, Fraunces serif display + Geist body), full **light and dark**
themes. Built front-end-only — no data-model/RLS/server-action changes. Full
per-phase notes live in [`docs/completions/`](./completions/).

- **Tokens, not hardcoded colors.** All color/elevation/motion is OKLCH CSS
  variables in `app/globals.css` (`@theme inline`): semantic surfaces
  (`background`/`card`/`primary`/`muted`/`accent`…), a `--gold` premium accent,
  a status set (`success`/`warning`/`danger`/`neutral`/`info` + foregrounds)
  shared by badges/dots/banners, two-tier `shadow-soft`/`shadow-lifted`
  (warm-tinted, theme-aware), and motion tokens (`--ease-out-quint`,
  `--duration-*`). A global `prefers-reduced-motion` guard collapses all motion.
- **Theming.** `next-themes` (`class` strategy, `system` default) via
  `components/theme-provider.tsx`; `ThemeToggle` in the nav and on the profile.
- **Typography.** Fraunces (`--font-fraunces` → `--font-heading`) for display/
  headings via `.text-display`/`.text-h1`/`.text-h2`/`.font-heading`; Geist Sans
  body, Geist Mono for the restaurant export block.
- **Primitives** (`components/ui/*`, base-ui based): refined Button (incl.
  `loading`, `gold`), Card (`hover`), Badge (`tone` + `dot`), Table, Select,
  Dialog, Skeleton — plus shared `PageHeader`, `EmptyState`, `SeatMeter`,
  `DataList` (responsive table→cards), `ConfirmDialog`/`ConfirmSubmit` (the
  `window.confirm` replacement), `LunchCard`, `AttendanceHistory`, `CopyButton`,
  `AuthShell`, and a `sonner` toast helper (`lib/toast.ts`).
- **Conventions.** Every in-app index page uses `PageHeader`; empties use
  `EmptyState`; every confirm is a branded `ConfirmDialog`; in-place form
  successes toast (`lib/use-success-toast.ts`); every `<select>` is the `Select`
  primitive (zero native selects / `window.confirm` remain); data-heavy routes
  have `loading.tsx` skeletons.

## Known v1 limitations
- A user who is invited to a second club reuses their existing account and is
  activated immediately (no second invite email flow).
- No public application/nomination flow (by design, v1).
- Committee redirect/revalidate forms (lunch lifecycle, capacity/cutoff, venue
  archive/restore) surface success via the revalidated UI rather than a
  toast — toasts there would require changing the server actions (a redesign
  non-goal). Errors still surface via `?error=` banners.
- Brand favicon/OG image still use placeholders (metadata fields are set; a
  designed asset is pending).
