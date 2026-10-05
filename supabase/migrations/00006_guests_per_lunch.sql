-- =============================================================================
-- Guests per lunch, one guest date for everyone, venues without a pipeline
--
-- 1. Each lunch decides whether guests are allowed. Lunches that inherited the
--    club setting get it written onto the lunch; the club columns go unread.
-- 2. The guest date (guests_open_at) now binds the committee too. Committee
--    priority covers their own names, not guests.
-- 3. Venues drop candidate / tasting / rejected: a venue is approved (in use)
--    or archived.
-- 4. The Cellar, venue tastings and speaking roles are gone from the app.
--    Their tables are empty and stay until a cleanup migration, so this one
--    is safe to run while the previous app version is still live.
-- =============================================================================

-- ---------- 1. Guests are decided per lunch ----------------------------------

update lunches l
set guests_allowed = c.guests_allowed,
    max_guests_per_member = coalesce(l.max_guests_per_member, c.max_guests_per_member)
from clubs c
where c.id = l.club_id
  and l.guests_allowed is null;

comment on column lunches.guests_allowed is
  'Whether members may bring guests. Decided per lunch; null is read as no.';
comment on column lunches.max_guests_per_member is
  'Guests per member when guests_allowed; 0 otherwise.';
comment on column clubs.guests_allowed is
  'Unused since 00006: each lunch decides.';
comment on column clubs.max_guests_per_member is
  'Unused since 00006: set per lunch.';

-- ---------- 2. Sign-up functions: lunch policy, guest date for all -----------

create or replace function public.sign_up_for_lunch(
  p_lunch uuid, p_guest_count int default 0, p_guest_names text default null
) returns signups
language plpgsql security definer set search_path = public as $$
declare
  v_lunch lunches%rowtype;
  v_membership memberships%rowtype;
  v_existing signups%rowtype;
  v_max_guests int;
  v_status signup_status;
  v_result signups%rowtype;
  v_is_committee boolean;
  v_next uuid;
begin
  select * into v_lunch from lunches where id = p_lunch for update;
  if v_lunch is null then raise exception 'Lunch not found'; end if;
  if v_lunch.status <> 'released' then raise exception 'Sign-ups are not open for this lunch'; end if;
  if v_lunch.signup_cutoff_at is not null and now() >= v_lunch.signup_cutoff_at then
    raise exception 'The sign-up cutoff for this lunch has passed';
  end if;

  select * into v_membership from memberships
    where club_id = v_lunch.club_id and user_id = auth.uid() and status = 'active';
  if v_membership is null then raise exception 'You are not an active member of this club'; end if;

  v_is_committee := v_membership.role = 'committee';

  -- Committee may add their own names before the membership.
  if not v_is_committee then
    if v_lunch.signup_opens_at is not null and now() < v_lunch.signup_opens_at then
      raise exception 'Sign-ups are not yet open for this lunch';
    end if;
    if v_lunch.members_open_at is not null and now() < v_lunch.members_open_at then
      raise exception 'Committee priority is in effect';
    end if;

    v_next := next_open_lunch_id(v_lunch.club_id);
    if v_next is not null and v_next is distinct from p_lunch then
      raise exception 'You may only add your name to the next luncheon that is currently open';
    end if;
  end if;

  -- Guests: the lunch decides, and nobody adds them before the guest date.
  v_max_guests := case when v_lunch.guests_allowed
                       then coalesce(v_lunch.max_guests_per_member, 0) else 0 end;
  if p_guest_count < 0 then raise exception 'Invalid guest count'; end if;
  if p_guest_count > 0 and v_lunch.guests_allowed is not true then
    raise exception 'Guests are not allowed for this lunch';
  end if;
  if p_guest_count > v_max_guests then
    raise exception 'At most % guest(s) per member', v_max_guests;
  end if;
  if p_guest_count > 0
     and v_lunch.guests_open_at is not null
     and now() < v_lunch.guests_open_at then
    raise exception 'Guests may not be added yet';
  end if;

  select * into v_existing from signups
    where lunch_id = p_lunch and membership_id = v_membership.id;
  if v_existing.id is not null and v_existing.status <> 'cancelled' then
    raise exception 'You are already signed up for this lunch';
  end if;

  -- Guests consume seats out of the same fixed capacity.
  if lunch_seats_taken(p_lunch) + 1 + p_guest_count <= v_lunch.capacity then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  if v_existing.id is not null then
    update signups
      set status = v_status, guest_count = p_guest_count, guest_names = p_guest_names,
          created_at = now(), cancelled_at = null, added_by_committee = false
      where id = v_existing.id
      returning * into v_result;
  else
    insert into signups (club_id, lunch_id, membership_id, status, guest_count, guest_names)
      values (v_lunch.club_id, p_lunch, v_membership.id, v_status, p_guest_count, p_guest_names)
      returning * into v_result;
  end if;
  return v_result;
end;
$$;

-- Member changes their own guest party. Fewer guests is always fine before
-- the cutoff; more guests only from the guest date, committee included.
create or replace function public.update_my_guests(
  p_lunch uuid, p_guest_count int, p_guest_names text default null
) returns signups
language plpgsql security definer set search_path = public as $$
declare
  v_lunch lunches%rowtype;
  v_signup signups%rowtype;
  v_membership memberships%rowtype;
  v_max_guests int;
  v_other_seats int;
  v_result signups%rowtype;
begin
  select * into v_lunch from lunches where id = p_lunch for update;
  if v_lunch is null or v_lunch.status <> 'released' then
    raise exception 'Sign-ups are not open for this lunch';
  end if;
  if v_lunch.signup_cutoff_at is not null and now() >= v_lunch.signup_cutoff_at then
    raise exception 'The sign-up cutoff for this lunch has passed';
  end if;

  select * into v_membership from memberships
    where club_id = v_lunch.club_id and user_id = auth.uid() and status = 'active';
  if v_membership is null then raise exception 'You are not an active member of this club'; end if;

  select s.* into v_signup from signups s
    where s.lunch_id = p_lunch and s.membership_id = v_membership.id
      and s.status in ('confirmed', 'waitlisted');
  if v_signup is null then raise exception 'You are not signed up for this lunch'; end if;

  v_max_guests := case when v_lunch.guests_allowed
                       then coalesce(v_lunch.max_guests_per_member, 0) else 0 end;
  if p_guest_count < 0 or p_guest_count > v_max_guests then
    raise exception 'Invalid guest count (max % per member)', v_max_guests;
  end if;

  if p_guest_count > v_signup.guest_count
     and v_lunch.guests_open_at is not null
     and now() < v_lunch.guests_open_at then
    raise exception 'Guests may not be added yet';
  end if;

  if v_signup.status = 'confirmed' then
    v_other_seats := lunch_seats_taken(p_lunch) - (1 + v_signup.guest_count);
    if v_other_seats + 1 + p_guest_count > v_lunch.capacity then
      raise exception 'Not enough seats left to add that many guests';
    end if;
  end if;

  update signups set guest_count = p_guest_count, guest_names = p_guest_names
    where id = v_signup.id returning * into v_result;

  -- Shrinking a confirmed party can free seats for the waitlist.
  perform promote_from_waitlist(p_lunch);
  return v_result;
end;
$$;

-- ---------- 3. Venues: approved or archived ----------------------------------

update venues set status = 'approved' where status in ('candidate', 'tasting');
update venues set status = 'archived' where status = 'rejected';
alter table venues alter column status set default 'approved';

comment on column venues.status is
  'approved (in use) or archived. candidate, tasting and rejected are unused since 00006.';

-- ---------- 4. Removed features: mark what is left behind --------------------

comment on table tastings is 'Unused since 00006 (venue tastings removed).';
comment on table wines is 'Unused since 00006 (Cellar removed).';
comment on table lunch_wines is 'Unused since 00006 (Cellar removed).';
comment on table lunch_roles is 'Unused since 00006 (speaking roles removed).';
comment on column memberships.wine_master is
  'Unused since 00006 (Cellar removed). Club offices go in memberships.function.';
