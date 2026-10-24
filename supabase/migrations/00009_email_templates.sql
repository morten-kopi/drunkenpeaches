-- =============================================================================
-- Editable email wording, and guest confirmation emails
--
-- 1. The committee can rewrite the subject, heading and body of each of the
--    club's automatic emails in Settings. Only edited emails have a row; an
--    email without one uses the default wording in lib/email-templates.ts.
--    The app sends with the service role, so members never read this table.
-- 2. A guest is written to once their seat is confirmed. The column marks
--    that it happened, so each guest hears once per lunch.
-- =============================================================================

create table email_templates (
  club_id uuid not null references clubs(id) on delete cascade,
  key text not null,
  subject text not null check (btrim(subject) <> ''),
  heading text not null default '',
  body text not null check (btrim(body) <> ''),
  updated_at timestamptz not null default now(),
  updated_by uuid references memberships(id) on delete set null,
  primary key (club_id, key)
);

comment on table email_templates is
  'The committee''s own wording for a club email, keyed as in lib/email-templates.ts. No row = default wording.';

alter table email_templates enable row level security;

create policy email_templates_select on email_templates for select
  using (is_committee_of(club_id));
create policy email_templates_insert on email_templates for insert
  with check (is_committee_of(club_id));
create policy email_templates_update on email_templates for update
  using (is_committee_of(club_id)) with check (is_committee_of(club_id));
create policy email_templates_delete on email_templates for delete
  using (is_committee_of(club_id));

grant select, insert, update, delete on email_templates to anon, authenticated, service_role;

alter table signup_guests add column confirmation_sent_at timestamptz;

comment on column signup_guests.confirmation_sent_at is
  'When the guest was emailed that their seat is confirmed. Set before sending, so it goes once.';
