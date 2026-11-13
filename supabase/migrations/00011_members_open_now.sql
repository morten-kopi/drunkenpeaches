-- =============================================================================
-- "Sign-ups now open" email, sent at the moment member sign-ups open
--
-- 1. members_open_now_sent_at marks that the email went out for a lunch, so it
--    goes once.
-- 2. A pg_cron job checks every minute, inside the database, whether a
--    released lunch's member sign-ups opened in the last hour without that
--    email. Only then does it call the app's /api/cron/open, which sends it.
--    The Vercel cron (Hobby) runs once a day, too coarse for this.
-- 3. The job reads the app's address and CRON_SECRET from Supabase Vault,
--    secrets named app_url and cron_secret. They are added by hand, never in
--    a migration, because the repo is public. Until both exist the job does
--    nothing.
-- 4. A second job keeps pg_cron's run history to a week, since the minute job
--    adds a row per run.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table lunches add column members_open_now_sent_at timestamptz;

comment on column lunches.members_open_now_sent_at is
  'When the "sign-ups now open" email for member registration (members_open_at) was sent. Set before sending, so it goes once.';

-- Lunches whose member sign-ups already opened never get the email late.
update lunches
  set members_open_now_sent_at = now()
  where members_open_at is not null and members_open_at <= now();

select cron.schedule(
  'members-open-now-email',
  '* * * * *',
  $job$
  select net.http_get(
    url := rtrim(
      (select decrypted_secret from vault.decrypted_secrets where name = 'app_url'),
      '/'
    ) || '/api/cron/open',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  )
  where exists (
      select 1 from public.lunches
      where status = 'released'
        and members_open_now_sent_at is null
        and members_open_at <= now()
        and members_open_at > now() - interval '1 hour'
    )
    and exists (select 1 from vault.decrypted_secrets where name = 'app_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret')
  $job$
);

select cron.schedule(
  'purge-cron-history',
  '0 20 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$
);
