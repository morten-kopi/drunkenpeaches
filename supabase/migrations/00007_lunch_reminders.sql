-- Reminder emails from the daily cron (/api/cron/reminders). Each column
-- records when that reminder went out for the lunch, so it is sent once.
-- reminder_sent_at (00001) stays the reminder for the lunch itself, now sent
-- the day before. Moving a window on the lunch form clears its column so the
-- reminder goes out again with the new time.

alter table lunches
  add column committee_reminder_sent_at timestamptz,
  add column members_reminder_sent_at timestamptz,
  add column guests_reminder_sent_at timestamptz;

comment on column lunches.committee_reminder_sent_at is
  'When the day-before reminder for committee registration (signup_opens_at) was sent to the committee.';
comment on column lunches.members_reminder_sent_at is
  'When the day-before reminder for member registration (members_open_at) was sent to every active member.';
comment on column lunches.guests_reminder_sent_at is
  'When the day-before reminder for guest registration (guests_open_at) was sent to every active member.';

-- New lunches start at 12:15 unless the committee picks another time.
alter table lunches alter column start_time set default '12:15';
