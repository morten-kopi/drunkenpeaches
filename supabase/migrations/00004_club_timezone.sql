-- =============================================================================
-- Club time zone
-- Lunch dates and start times are wall-clock values in the club's zone. Until
-- now they were read as UTC, so a 12:30 lunch in Singapore was treated as
-- 20:30 local and every cutoff and sign-up window landed 8 hours late.
-- Existing clubs stay on UTC, which keeps their current behavior.
-- =============================================================================

alter table clubs
  add column timezone text not null default 'UTC';

comment on column clubs.timezone is
  'IANA time zone (e.g. Asia/Singapore) for lunch dates, start times and sign-up windows.';

-- "Upcoming" now means on or after today in the club's zone, not UTC.
create or replace function public.next_open_lunch_id(p_club uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from lunches l
  join clubs c on c.id = l.club_id
  where l.club_id = p_club
    and l.status = 'released'
    and l.lunch_date >= (now() at time zone c.timezone)::date
    and (l.signup_opens_at is null or l.signup_opens_at <= now())
    and (l.signup_cutoff_at is null or now() < l.signup_cutoff_at)
  order by l.lunch_date, l.start_time
  limit 1;
$$;

-- Change a club's zone and move the sign-up windows of its draft and released
-- lunches with it, so each window keeps the same local clock time.
create or replace function public.set_club_timezone(p_club uuid, p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not is_committee_of(p_club) then raise exception 'Committee only'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone: %', p_timezone;
  end if;

  select timezone into v_old from clubs where id = p_club for update;
  if v_old is null then raise exception 'Club not found'; end if;
  if v_old = p_timezone then return; end if;

  update lunches set
    signup_opens_at = (signup_opens_at at time zone v_old) at time zone p_timezone,
    members_open_at = (members_open_at at time zone v_old) at time zone p_timezone,
    guests_open_at = (guests_open_at at time zone v_old) at time zone p_timezone,
    signup_cutoff_at = (signup_cutoff_at at time zone v_old) at time zone p_timezone
  where club_id = p_club and status in ('draft', 'released');

  update clubs set timezone = p_timezone where id = p_club;
end;
$$;
