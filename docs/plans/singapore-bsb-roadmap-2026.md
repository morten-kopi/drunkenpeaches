# Singapore B&B — product baseline & roadmap (2026)

> Status: **baseline for Singapore-chapter development** · 2026-09-09
> Companion to [vision.md](../vision.md) and [architecture.md](../architecture.md).
> This file wins when those docs conflict with the Singapore secretary’s notes.

---

## 1. Purpose & audience

This is the working product/engineering baseline for continued work on
**Drunken Peaches** for the **Beefsteak & Burgundy Singapore chapter**
(charter #253). It is written for the people who will implement the next
trains, and for Phil / the chapter secretary to argue with.

It does three things:

1. State honestly what the repo already ships.
2. Gap-analyse that against the real Singapore use case (WildApricot
   replacement + secretary notes + Phil’s cellar/gallery desire).
3. Propose a phased roadmap that **gets the secretary off WildApricot
   first**, then adds delight, then packages for other chapters.

It is not a rewrite of the vision. Where [vision.md](../vision.md) and
the secretary disagree, this document says so and picks a Singapore
direction.

---

## 2. Context

**Beefsteak & Burgundy** was founded in Adelaide in 1954. There are
~180 branches worldwide. Singapore is charter #253: about **45 members**
(hard-ish cap; other chapters vary), last-Friday lunches at **12:30**,
restaurant chosen by committee — often planned for the full calendar
year, with last-minute swaps.

Registrations usually open at the **beginning of the month**. Each lunch
has a **fixed seat cap from the restaurant booking**. Signup is
**first-come-first-served** with a waitlist. Confirmation emails matter.

They are on **WildApricot**. It is a nightmare for the club secretary.
Phil wants a better admin UX and a better member UX (what’s the next
lunch, am I signed up). He also wants a compounding wine cellar +
social gallery over years.

The secretary’s WhatsApp notes are more specific and more conservative:
a **simple system that administers registrations**. Members register,
add guests, cancel. Phased open: **committee → members → guests** (guests
only after ~2 weeks, and only if seats remain). Secretary controls when
registration opens, and can add/delete people by hand. The system should
produce a **complete participant list for the food master**, and keep a
**list of visited restaurants**. The **membership registry is a
spreadsheet and does not need to be integrated**.

That last sentence is the sharpest product conflict in the repo today.

---

## 3. Current product snapshot

What actually ships (0.2.0, `docs/CHANGELOG.md`). No unfinished work
invented below.

### Stack

Next.js App Router + TypeScript, Server Actions, Tailwind v4 + shadcn
(base-ui), Supabase Postgres + Auth + RLS, Resend, Vercel. One schema
file: [`supabase/migrations/00001_init.sql`](../../supabase/migrations/00001_init.sql).
Tenant = `clubs` row. Isolation is RLS, not app code
([`docs/architecture.md`](../architecture.md)).

Club app lives under `app/c/[club]/`. Actions in
`app/actions/{auth,members,lunches,venues,wine,settings}.ts`.

### Roles

Two roles on `memberships.role`: `member` | `committee`. A committee
row may also have `wine_master`. Auth is email + password. Club signup
is self-serve (`/signup`); members are **invited by the committee**
(`inviteMemberAction` in `app/actions/members.ts`). Inactive members are
never hard-deleted.

There is no “secretary” role. The secretary is a committee user.

### Lunch flow (the heart — this part is real)

```
draft → released → completed | cancelled
```

- Capacity is an input from the restaurant booking
  (`lunches.capacity`). Never derived from signups.
- Members sign up FCFS via `sign_up_for_lunch`. Beyond capacity they
  are waitlisted. Cancel / shrink guests / raise capacity calls
  `promote_from_waitlist` (strict `created_at` order). `signups` has
  **no direct write policy** — all mutations go through SECURITY
  DEFINER functions.
- Guests are `guest_count` + `guest_names` on the member’s signup
  row. They consume seats from the same X. Allowed when
  `lunches.guests_allowed` (or club default) is true **and**
  `guests_open_at` has passed (three-phase windows; see Settings).
- Cutoff: `lunches.signup_cutoff_at`. After it, members cannot sign
  up or cancel. Computed on create/release from club defaults if unset
  (`releaseLunchAction` in `app/actions/lunches.ts`), together with
  `signup_opens_at` / `members_open_at` / `guests_open_at`.
- Committee overrides already exist: `committee_add_signup` (ignores
  cutoff; `p_force` can seat beyond capacity),
  `committee_remove_signup`, `set_lunch_capacity`, `setCutoffAction`,
  `cancel_lunch`, `mark_attendance`.
- Surfaces: dashboard next-lunch hero
  (`app/c/[club]/dashboard/page.tsx`), lunches list + detail +
  `SignupCard`, committee control room on the same detail page.

Release still reveals the luncheon to every member. Sign-up itself
is now three timed waves (committee → members → guests), configured
on the club and overridable per lunch. Members may only add their
name to the next luncheon that is currently in an open window.

### Venues

First-class pipeline, committee-only UI (`app/c/[club]/venues`):
candidate → tasting → approved (rejected/archived shelf). Tastings
capture go/no-go feedback. Venue detail lists “Lunches at this venue.”
Members can *read* venues via RLS (lunch detail shows the name) but
cannot open the pipeline.

This is a **planning board**, not a “restaurants we have visited”
history. The data to derive history exists (`lunches.venue_id`).

### Wine

`wines` is a lightweight catalogue: name, vintage, `source`
(`cellar` | `restaurant`), notes. `lunch_wines` is the Wine Master’s
pairing for a lunch. **Committee-only.** RLS hides both tables from
members. Copy on `/wine` is explicit: “No bottle counting in v1.”
Vision forbids member-facing wine during the lunch (phones away,
blind tasting in the room).

### Email (`lib/email.ts`)

Shipped: invite, password reset, **signup confirmed**, waitlisted,
promoted off waitlist, lunch changed, lunch cancelled, ~2-day reminder
(`app/api/cron/reminders`, 01:00 UTC ≈ 09:00 Singapore). Failures are
swallowed. **Release does not email** — documented in vision and in
the release confirm copy.

### Design

The 2026 “editorial wine-cellar” redesign is **done**
([`docs/plans/frontend-redesign-2026.md`](./frontend-redesign-2026.md),
[`docs/completions/`](../completions/)). Burgundy/parchment tokens,
Fraunces + Geist, light/dark, `PageHeader` / `EmptyState` /
`SeatMeter` / `LunchCard` / `ConfirmDialog`. Do not reopen that
plan as product work.

### Known limitations that hit Singapore

- Cutoff datetimes are UTC. `releaseLunchAction` builds the default
  cutoff as `` `${lunch_date}T${start_time}Z` `` — a 12:30 Singapore
  lunch is treated as 12:30 **UTC**. Called out in
  `docs/architecture.md`.
- No per-club timezone.
- No year calendar, no “last Friday” helper.
- No photo storage, no gallery, no member tasting notes.
- No bottle-level inventory (vision lists it under Future).

---

## 4. Gap analysis

Legend: **gap** = not in the product · **partial** = exists but
wrong shape or incomplete for Singapore · **fit** = ships and
matches the need.

### 4a. Secretary notes vs code

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| Simple system that administers registrations | **Partial.** Core signup engine is solid; the product around it is a membership CRM + venue pipeline + wine cellar. | `memberships` is required for every signup; nav is Dashboard / Lunches / **Members** / Venues / Wine / Settings. |
| Members register, add guests, cancel | **Partial.** All three exist, but guests are available immediately if the lunch/club toggle is on — not as a later wave. | `sign_up_for_lunch`, `update_my_guests`, `cancel_my_signup`; `SignupCard`. |
| Phased registration: committee → members → guests after ~2 weeks, only if seats remain | **Gap.** One wave. `released` = all active members. No `registration_wave`, no `members_opens_at` / `guests_opens_at`. | `lunches.status` enum is `draft \| released \| completed \| cancelled` only. `sign_up_for_lunch` checks `status = released` + cutoff, not role or wave. |
| Max registrants in the system; overflow → waitlist | **Fit.** | `lunches.capacity`, `lunch_seats_taken`, waitlist + auto-promote. |
| If cap not reached after 2 weeks, guests can be added; if reached, waiting list | **Gap.** Guest policy is a boolean, not a timed gate on remaining capacity. | `clubs.guests_allowed`, `lunches.guests_allowed`. |
| If automation isn’t possible, manual is OK | **Partial.** Secretary can already add/remove people and toggle guests per lunch, but must remember the club’s custom and flip settings by hand. No phase buttons. | `committee_add_signup`, lunch form guests mode, settings Switch. |
| Secretary controls when registration opens | **Partial.** Draft/release is the open switch. No scheduled “open at the beginning of the month.” Release does not announce. | `releaseLunchAction`; vision: “releasing does NOT auto-email.” |
| Secretary add or delete registrants | **Fit.** | Committee add/remove on `lunches/[id]/page.tsx`. |
| Complete participant list for the food master | **Partial.** “Restaurant list — dietary notes” + copy-to-clipboard exists. Not labelled for the food master; no CSV/download; guest names only if entered. | Built in `lunches/[id]/page.tsx` (`restaurantList`). |
| List of all visited restaurants | **Partial.** Venues exist; each venue shows lunches held there. No club-wide history of *visited* places (completed lunches). Pipeline UI is the opposite job (candidates). | `venues` + `lunches.venue_id`; `venues/[id]` “Lunches at this venue.” |
| Membership spreadsheet stays **out** of the registrations system | **Conflict.** Today membership *is* the registrations system. `signups.membership_id` is NOT NULL. Invite/auth/roster is the v1 onboarding model. Phase 6 completion notes call the roster a CRM. | `00001_init.sql`; `app/actions/members.ts`; `docs/completions/phase-6-members.md`. |

### 4b. Phil’s member / admin UX vs code

| Desire | Verdict | Evidence |
| --- | --- | --- |
| Upcoming lunches, obvious next lunch | **Partial.** Dashboard hero + “Coming up” (max 6) + lunches list (upcoming / past). No year-at-a-glance. Drafts are hidden from members, so a planned year is invisible until each month’s release. | `dashboard/page.tsx`, `lunches/page.tsx`. |
| “Am I signed up?” | **Partial.** Hero shows the member’s status badge; lunch cards on the **list** show `mySignupStatus`; coming-up cards on the **dashboard** do not. Must open the lunch for the full “you’re in / waitlist / cancel” card. | `SignupCard`; `LunchCard` prop used on list, not dashboard coming-up. |
| Confirmation emails on register | **Fit.** | `sendSignupConfirmed` / `sendWaitlisted` from `signUpAction`. |
| Better admin UX than WildApricot | **Partial.** Control room is organized (capacity, cutoff, add member, dietary copy, wine). Missing: phase control, scheduled open, year planning, food-master export, restaurant history. Committee lifecycle actions still don’t toast (redesign non-goal). | `lunches/[id]/page.tsx`; `docs/architecture.md` known limitations. |
| Year calendar + last-minute venue swap | **Partial.** Venue change on a released lunch already emails attendees (`updateLunchAction`). No year grid, no “generate last Fridays of 2027” helper. Default time is already `12:30`. | `lunch-form.tsx`; `lunches.start_time` default. |

### 4c. Cellar + lunch gallery vs code

| Desire | Verdict | Evidence |
| --- | --- | --- |
| Admin cellar inventory — wines the club currently owns | **Gap** (catalogue only). `wines` has no quantity, location, consumed flag, or bottle rows. Vision already deferred bottle-level inventory to Future. | `wines` table; `/wine` copy; `docs/vision.md` Future. |
| Members upload photos of food and especially wines, with comments / tasting notes | **Gap.** No Storage bucket, no photo tables, no comments. Pairing notes on `lunch_wines` are committee-only prep, not member notes. | Schema; RLS on `wines` / `lunch_wines`. |
| Compounding gallery of wines drunk at lunches over years | **Gap.** `lunch_wines` could become the spine of a history, but it is invisible to members and has no photos. | |

This also **conflicts with vision**: “members never see wine data;
blind tasting stays in the room.” A post-lunch gallery is compatible
with “phones away during the meal.” A live in-room scoring app is
not. Singapore should take the post-lunch reading.

### 4d. Must-have gaps for secretary adoption

These are the reasons a secretary still cannot replace WildApricot
*as they run lunches today*:

1. **No committee → members → guests waves.** The whole membership
   races the moment a draft is released. Guests are not a delayed
   privilege gated on leftover seats.
2. **No first-class “open registration” window.** Draft/release + a
   UTC cutoff is not “open on the 1st, guests from the 15th, lock
   before the Friday.”
3. **Membership is mandatory infrastructure.** You cannot register
   without a `memberships` row and (for self-serve) an auth user.
   The secretary asked for the opposite.
4. **Timezone.** Default cutoff math is wrong for Asia/Singapore
   12:30 lunches. This will bite the first real month.
5. **Year of lunches is not a first-class object.** They already
   plan twelve restaurants. The app thinks one lunch at a time.

Manual workarounds exist (keep guests off, add committee by hand
during draft, release later, flip guests on after two weeks). A
secretary who just escaped WildApricot will not trust a product
that requires that ritual.

### 4e. Product tension — membership out vs invite model

**vision.md** treats gated membership as the product: committee
invites by email, roster is the club, members see each other,
inactive statuses preserve attendance. **The secretary** says the
membership registry is a spreadsheet and should not be integrated.

Do not rip out `memberships`. The whole RLS model
(`is_member_of` / `is_committee_of`), `getClubContext`, and every
signup function hangs on it. Magic-link-only or “email a name onto
a lunch with no account” would be a rewrite, not a Singapore v1.

**Recommended path: registration-first contacts.**

- Keep `memberships` as **people who can log in and register for
  lunches** — name, email, dietary, role (member vs committee).
  That is a contact list, not the charter roll.
- The spreadsheet remains the source of truth for who is a paid /
  accepted member of B&B Singapore. The app does not sync to it.
- Optional one-way CSV import (name, email, dietary) to bootstrap
  lunch accounts from that sheet. No sync-back, no dues, no
  nomination workflow.
- Guests never become `memberships` rows. Since 00008 (2026-10-24)
  each guest is a record in `guests` (name, email, dietary notes),
  linked to the host’s signup, so the committee can see who came and
  make a guest a member with their guest lunches kept.
- Soften the CRM posture in the Singapore UI: “People who can
  register,” not a member directory that looks like WildApricot
  2.0. Whether members can see the roster is an open question
  (today they can — `memberships_select` + `/members`).
- Do not build the vision’s richer membership lifecycle until a
  chapter actually asks.

This is the pragmatic bend: **registration reliability over CRM.**
Vision’s “member onboarding is gated” still holds — the club is
not a public signup. The gate is “committee (or CSV) created your
lunch account,” not “this app is the membership registry.”

### 4f. Partial fits (do not rebuild)

Reuse these. They are the reason P0 is an extension, not a greenfield.

- FCFS + waitlist + auto-promote + confirmation/waitlist/promotion
  emails.
- Fixed capacity, raise-promotes / lower-never-bumps.
- Secretary add/remove/force-seat, cutoff override.
- Food-master-shaped text list + `CopyButton`.
- Venue records + per-venue lunch list (history is a query).
- Guest names on the host signup.
- Attendance history on profile / member detail.
- Editorial UI already in place.

### 4g. Missing delight

Cellar inventory, photo gallery, tasting notes — all later. Do not
let them jump the secretary’s registration work. They are also
where vision and Phil disagree (catalogue vs stock; wine hidden vs
wine as the social object).

### 4h. Design / journey shortfalls

The redesign made screens look like a product. The **journeys**
Singapore described are still missing:

| Journey | Today | Needed |
| --- | --- | --- |
| Member: “what’s next / am I in?” | Next released lunch hero; no year; dashboard coming-up omits personal status. | Year of lunches (even if later months are “venue TBA / not open yet”), status on every card, one-tap sign-up. |
| Secretary: open the window | Release (silent). | “Open to committee / members / guests” with dates, optional announce email. |
| Secretary: plan the year | Create twelve drafts by hand. | Year calendar; last-Friday defaults; last-minute venue swap (swap already works). |
| Secretary: food master | Copy a `<pre>` block labelled for the restaurant. | Same data, named for the food master, plus CSV. |
| Member: after the lunch | Attendance chip on profile. | Later: gallery of what we ate and drank. |

---

## 5. Product principles for Singapore v1

1. **Registration reliability over CRM.** If the secretary cannot
   open a lunch, run three waves, and hand the food master a list,
   nothing else matters.
2. **Secretary control beats clever automation.** Ship manual wave
   buttons first. Scheduled opens are an overlay, not a
   prerequisite. The secretary said so.
3. **Capacity is the restaurant booking.** Do not invent a second
   cap. Guests and waitlist share that one number. Already true —
   do not break it.
4. **Don’t boil membership.** Lunch accounts are enough. The
   spreadsheet stays the roll.
5. **Mobile-first for members, desk-first for the secretary.**
   Members sign up on a phone between meetings. The secretary
   builds the year and exports the food-master list on a laptop.
6. **Delight is post-lunch, not in-room.** Gallery and notes after
   `completed`. No live tasting app. Phones away still stands.
7. **Reuse the engine.** New behaviour goes into the existing
   SECURITY DEFINER functions and `app/c/[club]/lunches/…`. Do not
   add a parallel signup path.
8. **Singapore first, multi-tenant intact.** Keep `club_id` + RLS.
   Do not special-case the Singapore chapter in schema. Encode
   their defaults (timezone, last Friday, waves) as *club
   settings*, so the next chapter inherits them.

---

## 6. Updated product roadmap

Adjusted for what is already done. Frontend redesign, FCFS/waitlist,
overrides, confirmation email, venue pipeline, and wine *catalogue*
are not listed as unfinished work.

### P0 — Secretary registration core *(adoption)*

The WildApricot-replacement cut.

- Registration waves on each lunch: `closed → committee → members → guests`, plus the existing cutoff lock.
- Secretary buttons to open each wave (manual is the v1). Optional timestamps so a cron can advance members/guests.
- During `committee` / `members`, `guest_count` must stay 0. Guests unlock in the `guests` wave, and only consume remaining seats; overflow → waitlist (existing).
- Scheduled *or* explicit “registration opens” (beginning of the month), distinct from “lunch is a draft.”
- `clubs.timezone` (default `Asia/Singapore`) and cutoff math in that zone — fix the `…Z` bug.
- Food-master list: rename, keep copy, add CSV.
- Club-wide **visited restaurants** view (completed lunches × venues). Do not replace the pipeline; add history next to it.
- Year of draft lunches can already be created by hand — acceptable for P0 if the lunches list is less “card dump” and more scannable by month. Full calendar UI can slip to P1 if P0 time is tight.

**Exit:** the secretary can run one real month without a spreadsheet of signups and without flipping guest settings by memory.

### P1 — Member journey polish

- Year calendar (members see planned lunches; unreleased months as “coming,” not a dead end).
- “Am I in?” on every upcoming card, including the dashboard coming-up grid.
- Optional **announce-on-open** email when the members wave starts (vision deferred this; Singapore will want it).
- Last-Friday helper: “create 12 drafts for year N.”
- Member-facing empty/error copy that talks in waves (“Committee is signing up this week”) rather than generic “not open.”
- Committee toasts on lifecycle actions (the redesign left these silent).

**Exit:** a member opens the phone on the 2nd of the month and knows the Friday, the restaurant, and whether they have a seat.

### P2 — Membership stance (spreadsheet-friendly)

- Relabel roster as lunch contacts. Optional CSV import → existing invite path.
- Club setting: hide roster from members (committee-only directory) if the secretary wants it.
- Do **not** add dues, nominations, or spreadsheet sync.
- Document for the secretary: “this list is who can register; your sheet is who is a member.”

**Exit:** bootstrapping ~45 people from a sheet is a 5-minute import, not 45 invite forms. The secretary does not feel asked to move the roll into the app.

### P3 — Cellar inventory

- Extend `wines` (or add `wine_lots`) with quantity / location / consumed.
- Still committee/Wine Master. Selecting a wine for a lunch can decrement stock (explicit, confirmable).
- Catalogue rows remain valid for restaurant-list wines (`source = restaurant`) with qty unused.

**Exit:** the Wine Master can answer “what do we still own?” without a side spreadsheet.

### P4 — Lunch gallery + tasting notes

- After a lunch is `completed`, members upload photos (Supabase Storage) and write comments / tasting notes, optionally linked to a `wines` / `lunch_wines` row.
- Committee can remove a photo. No public internet gallery.
- This **revises vision**: wine becomes member-visible *after* the lunch. In-room blind tasting stays offline.

**Exit:** twelve lunches later, the chapter has a compounding record of what was poured.

### P5+ — Multi-chapter / SaaS packaging

The architecture is already multi-tenant. Remaining work is product
packaging, not isolation:

- Club onboarding presets: “B&B-style” (last Friday 12:30, three
  waves, 14-day guest delay, timezone).
- Announce-on-open as a setting, not a rewrite.
- Billing / dues only if a chapter pays and asks.
- Do not build a second app.

---

## 7. Implementation proposal

Near-term phases only, concrete to this codebase. Later phases stay
thinner until P0/P1 land.

### P0 — Secretary registration core

**Scope**

Waves + timezone + food-master export + visited-restaurants list.
Manual wave advance is required; scheduled advance is included if
cheap (same columns, cron sibling to `/api/cron/reminders`).

**Schema / RLS / SQL** (`supabase/migrations/00002_….sql`)

- `clubs.timezone text not null default 'Asia/Singapore'`.
- New enum `registration_wave`: `closed | committee | members | guests`.
- On `lunches`:
  - `registration_wave` default `closed`
  - `members_opens_at timestamptz` (nullable)
  - `guests_opens_at timestamptz` (nullable)
- On release: set `status = released` and `registration_wave = committee` (or a form choice). Drafts stay `closed`.
- `sign_up_for_lunch`: after the existing released + cutoff checks, enforce wave:
  - `closed` → reject
  - `committee` → caller’s `memberships.role` must be `committee`; `p_guest_count` must be 0
  - `members` → any active member; `p_guest_count` must be 0
  - `guests` → existing guest policy (club/lunch allow + max)
- `update_my_guests`: reject `p_guest_count > 0` unless wave is `guests`.
- `committee_add_signup`: secretary may still add anyone in any open wave (and in draft). Optionally allow guest_count only in `guests` / with force — default: secretary can always attach guests (they are the override).
- New function `set_lunch_wave(p_lunch, p_wave)` — committee only, row-lock the lunch, no skip-back without intent (allow step back; secretary will need it).
- Cutoff computation: replace the `Z` suffix with the club timezone (do this in the SQL function or in `releaseLunchAction` via a real tz library — do not leave it in the action as UTC).
- No new RLS tables. `signups` stays function-gated.

**Server actions** (`app/actions/lunches.ts`, `app/actions/settings.ts`)

- `setWaveAction(slug, lunchId, wave)` → `set_lunch_wave`.
- `releaseLunchAction` sets the starting wave; stop treating release as “open to all members.”
- Settings: timezone field.
- `exportFoodMasterAction` or a Route Handler `app/c/[club]/lunches/[id]/food-master/route.ts` that returns `text/csv` of the same rows as today’s `restaurantList`.

**UI**

- `app/c/[club]/lunches/[id]/page.tsx` committee toolbar: **Open to committee / Open to members / Open to guests**, current wave badge, optional datetime fields for the two opens.
- `SignupCard`: if released but wave is `committee` and the user is a member, show “Committee is registering first” — not a broken signup button. If wave is `members`, hide guest fields. If `guests`, show them.
- Relabel the `<pre>` block to **Food master list**. Keep `CopyButton`. Add CSV download.
- `app/c/[club]/venues/page.tsx` (or `/venues/history`): a **Visited** section — venues with at least one `completed` lunch, newest first, date + title links. Members may as well see this (RLS already lets them read venues + non-draft lunches); if the page stays committee-only, add a thin member-readable list on `/lunches` or dashboard.

**Risks**

- Existing released lunches have no wave: migrate them to `members` if `guests_allowed`, else `members` with guests off — don’t leave them `closed`.
- Guest-on-signup is the current mental model in vision and in `SignupCard`. Changing it is the point; update vision later, not in this PR.
- Cutoff vs wave: a cutoff that fires during `committee` would lock members out before their wave. Default cutoff should be *after* `guests_opens_at`, or cutoff should only apply once wave ≥ members. Pick one in implementation (recommendation: cutoff is the hard lock for everyone, including secretary self-serve; committee overrides still ignore it).
- `releaseLunchAction` cutoff math in UTC will produce wrong lock times until timezone lands — ship them together.

**Acceptance**

- A committee user can sign up for a released lunch in `committee` wave; a member cannot.
- Advancing to `members` lets members take seats without guests.
- After advance to `guests`, a member can add guests up to remaining seats; if X is full, they waitlist.
- Secretary can add/remove people throughout.
- Food-master CSV matches the on-screen list (name, guest names, dietary, headcount).
- Visited-restaurants list shows completed lunches only.
- Creating a lunch at 12:30 Asia/Singapore and using the default 2-day cutoff locks at 12:30 SGT two days prior, not 12:30 UTC.

### P1 — Member journey polish

**Scope**

Calendar + status + announce email + last-Friday drafts.

**Surfaces**

- New `app/c/[club]/lunches/year/page.tsx` (or a year toggle on `lunches/page.tsx`): 12 months, last-Friday highlight, each lunch card with `mySignupStatus`. Committee sees drafts.
- Dashboard coming-up: pass `mySignupStatus` into `LunchCard` (prop already exists).
- `sendLunchOpened` in `lib/email.ts`; called from `set_lunch_wave` → `members` (not from committee wave). Honor a new `clubs.announce_on_members_open boolean default false` so we don’t spam if they don’t want it.
- `createYearLunchesAction`: given a year, insert 12 drafts, `lunch_date` = last Friday, `start_time = 12:30`, title `{Mon} lunch`, capacity placeholder (0 or club default) — secretary fills venue + X as bookings land. Venue swap remains `updateLunchAction`.
- `components/lunch-card.tsx` / `SignupCard`: wave-aware helper copy.

**Risks**

- Members seeing draft year lunches contradicts current RLS
  (`lunches_select` hides drafts from members). Either (a) add
  `status = 'planned'` visible to members without signup, or (b)
  release-but-`closed` wave so the lunch is visible and
  un-signup-able. **Prefer (b)** — no new status, fits P0 waves,
  matches “planned for the year, registration closed.”
- Announce email to ~45 people is fine; do not build a campaign
  tool.

**Acceptance**

- A member can see the year’s Fridays and their status on each.
- Opening the members wave with announce on sends one email per
  active member with a link to `/c/{slug}/lunches/{id}`.
- “Create year” produces 12 last-Friday drafts (or
  released+`closed`) without touching capacity rules.

### P2 — Membership stance

**Scope**

Import + copy + optional roster visibility. No schema rewrite.

**Surfaces**

- `importContactsAction` in `app/actions/members.ts`: CSV
  `full_name,email,dietary_notes` → loop the existing invite
  path (reuse `inviteMemberAction` internals; do not fork
  auth-link generation). Cap ~200 rows. Report created /
  skipped / failed.
- UI: dialog on `app/c/[club]/members/page.tsx`. Relabel page
  header to “Lunch accounts” (or “Who can register”) with one
  line: *The chapter roll stays on your spreadsheet.*
- `clubs.roster_visible_to_members boolean default true`. If
  false: members route 404s (committee still sees it); tighten
  `memberships_select` so members only read their own row
  **or** rows they need for “who’s coming” on a lunch (signups
  already join names). Be careful: lunch detail shows other
  members’ names on the confirmed list — that can stay; the
  *directory* is what we hide.
- Do not add payment fields.

**Risks**

- Tightening `memberships_select` can break the confirmed-list
  join if the policy becomes “own row only.” Test
  `lunches/[id]/page.tsx` select of `signups(*, memberships(…))`
  under a member session. If it breaks, keep select-on-roster
  and only hide the `/members` page.
- Importing the whole spreadsheet trains the secretary to treat
  the app as the roll. Copy must stay blunt.

**Acceptance**

- Secretary imports the 45-person sheet; each gets an invite
  email; duplicates are skipped.
- With roster hidden, a member cannot open `/members` and still
  can sign up and see who’s coming to a released lunch.

### P3 — Cellar inventory *(sketch)*

- Migration: `wines.quantity int`, `wines.location text`, or a
  child `wine_lots` table if they track cases. Do not over-model
  bin locations.
- `addLunchWineAction`: optional “consume N bottles” with
  confirm. Never go negative without an override.
- `/wine` DataList gains qty. Still committee-only.
- Risk: restaurant-list wines must not require qty.

### P4 — Lunch gallery + tasting notes *(sketch)*

- New tables `lunch_photos` (`lunch_id`, `membership_id`,
  `storage_path`, `caption`, `wine_id` nullable) and
  `lunch_notes` (`lunch_id`, `membership_id`, `wine_id` nullable,
  `body`). RLS: club members read; author insert; author or
  committee delete.
- Supabase Storage bucket `lunch-photos`, path
  `{club_id}/{lunch_id}/…`.
- UI: `/c/[club]/lunches/[id]/gallery` visible when
  `status = completed` (and maybe `released` after the date —
  prefer `completed` so the Wine Master still controls the
  reveal).
- This is when wine becomes member-visible. Update
  `wines` / `lunch_wines` select policies accordingly, **after**
  the lunch, not before.
- Risk: moderation, copyrighted bottle shots, drunk uploads.
  Committee delete is enough for ~45 people. No ML filters.

### P5+ — Packaging *(sketch)*

- Settings preset “Beefsteak & Burgundy chapter”: timezone,
  12:30, last Friday, 14-day guest delay, announce-on-open.
- Marketing `/` already exists; do not rebuild it for Singapore
  adoption.
- Billing is out until a second paying club appears.

---

## 8. Out of scope / explicit non-goals (next cut)

- Rewriting [vision.md](../vision.md) or
  [architecture.md](../architecture.md) beyond a pointer to this
  file.
- Reopening the frontend redesign
  ([`frontend-redesign-2026.md`](./frontend-redesign-2026.md)).
- Dues, payments, richer roles (President, Treasurer, Food
  Master as a role).
- Spreadsheet sync, WildApricot import, or treating
  `memberships` as the charter roll.
- Public application / nomination.
- Live in-room tasting, scoring, or member-visible wines **before**
  the lunch ends.
- Native apps.
- Multi-chapter marketplace / billing.
- A second signup engine. No parallel tables for “simple mode.”
- Bottle-level valuation, supplier docs, or cellar insurance
  features.
- Guest-as-first-class login accounts.

---

## 9. Open questions for Phil / the secretary

Answer these before or during P0 implementation. Defaults in
*italics* are what this plan will use if nobody replies.

1. **Timezone.** Confirm all lunch times are Asia/Singapore, no
   exceptions. *Default: `Asia/Singapore`.*
2. **Guest rules.** Is a “guest” only someone a *member* brings
   (today’s model), or can the secretary add a named guest who
   isn’t attached to a member? *Default: attached to a member;
   secretary override may add a member-row stand-in.*
3. **Guest cap.** Per-member max (today) vs a single remaining-seats
   pool anyone can fill? *Default: keep per-member max, also
   bounded by remaining X.*
4. **Committee wave.** Is it the sitting committee only (~5–8
   people), or anyone with `role = committee` in the app (Wine
   Master included)? *Default: `role = committee`.*
5. **Wave timing.** Always “open beginning of month, guests +14
   days,” or does the secretary want to type dates per lunch?
   *Default: per-lunch dates, prefilled month-start / +14 days.*
6. **Food-master format.** CSV columns? Need phone numbers, or
   names + dietary + guest names only? *Default: name, guests,
   dietary, headcount — same as today’s `<pre>`.*
7. **Year visibility.** Should members see the year’s restaurants
   before their wave opens (venue spoilers / last-minute swaps)?
   *Default: yes, as released+`closed` or visible planned cards;
   venue can still change (email already fires).*
8. **Roster visibility.** Should ordinary members see the 45-person
   list in-app? *Default: hide the directory (P2); keep “who’s
   coming” on each lunch.*
9. **Announce-on-open.** Email the chapter when the members wave
   starts, or keep vision’s silent release? *Default: setting,
   off until they turn it on — but the setting exists in P1.*
10. **Photo moderation.** Committee-only delete, or a pre-approve
    queue? *Default: post-then-delete (P4).*
11. **Cellar ownership.** Club-owned bottles only, or also
    members’ bottles brought to lunch? *Default: club-owned
    inventory; BYO can be a note on `lunch_wines`.*
12. **Charter extras.** Anything Singapore-specific besides last
    Friday 12:30 and ~45 seats (dress code, no-guest months,
    AGM lunch)? *Default: notes field on the lunch covers it.*

---

## Appendix — what not to argue with

The following are settled in code and should not be re-litigated
for Singapore v1:

- Capacity is the booking, not a count of names.
- Waitlist is FCFS by `signups.created_at`.
- Signups mutate only through SQL functions.
- Tenant isolation is `club_id` + RLS.
- Email never breaks a signup if Resend is down.
- Design tokens / component library — already shipped.
