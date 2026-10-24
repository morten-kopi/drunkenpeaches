-- =============================================================================
-- Guest cleanup, before the club goes live
--
-- 1. Test data: removes the test guest added on 2026-10-24 and resets every
--    signup's guest_count to the guests actually linked to it. Signups from
--    before guests were records (October @ OSO) kept counts with no names;
--    all of it was test data.
-- 2. The free-text signups.guest_names is gone, so the 00008 functions that
--    cleared it are redefined without it.
-- 3. The pre-00008 sign-up functions are dropped. Push this only once the
--    app version that uses the guest-aware functions is live.
-- =============================================================================

-- ---------- 1. Test data -----------------------------------------------------

delete from guests where id = '7ede67ee-bf7b-4b9d-8fd4-11f9e2464ab0';

update signups s
set guest_count = (select count(*) from signup_guests sg where sg.signup_id = s.id)
where s.guest_count <> (select count(*) from signup_guests sg where sg.signup_id = s.id);

-- ---------- 2. Functions without guest_names ---------------------------------

create or replace function public.set_signup_guests(p_signup uuid, p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_signup signups%rowtype;
  v_taken text;
begin
  select * into v_signup from signups where id = p_signup;
  if v_signup.id is null then raise exception 'Signup not found'; end if;

  select g.full_name into v_taken
    from signup_guests sg
    join signups s on s.id = sg.signup_id
    join guests g on g.id = sg.guest_id
    where s.lunch_id = v_signup.lunch_id
      and s.id <> p_signup
      and s.status <> 'cancelled'
      and sg.guest_id = any(p_ids)
    limit 1;
  if v_taken is not null then
    raise exception '% is already coming to this lunch with another member', v_taken;
  end if;

  delete from signup_guests where signup_id = p_signup and not (guest_id = any(p_ids));
  insert into signup_guests (club_id, signup_id, guest_id)
    select v_signup.club_id, p_signup, g from unnest(p_ids) as g
    on conflict (signup_id, guest_id) do nothing;
  update signups set guest_count = coalesce(array_length(p_ids, 1), 0)
    where id = p_signup;
end;
$$;

create or replace function public.sign_up_with_guests(
  p_lunch uuid, p_guests jsonb default '[]'::jsonb
) returns signups
language plpgsql security definer set search_path = public as $$
declare
  v_lunch lunches%rowtype;
  v_membership memberships%rowtype;
  v_existing signups%rowtype;
  v_ids uuid[];
  v_guest_count int;
  v_max_guests int;
  v_status signup_status;
  v_result signups%rowtype;
  v_next uuid;
  v_host text;
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

  -- Committee may add their own names before the membership.
  if v_membership.role <> 'committee' then
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

  v_ids := resolve_guests(v_lunch.club_id, p_lunch, v_membership.id, p_guests, false);
  v_guest_count := coalesce(array_length(v_ids, 1), 0);

  -- Guests: the lunch decides, and nobody adds them before the guest date.
  v_max_guests := case when v_lunch.guests_allowed
                       then coalesce(v_lunch.max_guests_per_member, 0) else 0 end;
  if v_guest_count > 0 and v_lunch.guests_allowed is not true then
    raise exception 'Guests are not allowed for this lunch';
  end if;
  if v_guest_count > v_max_guests then
    raise exception 'At most % guest(s) per member', v_max_guests;
  end if;
  if v_guest_count > 0
     and v_lunch.guests_open_at is not null
     and now() < v_lunch.guests_open_at then
    raise exception 'Guests may not be added yet';
  end if;

  select * into v_existing from signups
    where lunch_id = p_lunch and membership_id = v_membership.id;
  if v_existing.id is not null and v_existing.status <> 'cancelled' then
    raise exception 'You are already signed up for this lunch';
  end if;
  v_host := guest_seat_holder(p_lunch, v_membership.id);
  if v_host is not null then
    raise exception 'You are already coming to this lunch as a guest of %. Ask them to take you off their guests, then add your own name.', v_host;
  end if;

  -- Guests consume seats out of the same fixed capacity.
  if lunch_seats_taken(p_lunch) + 1 + v_guest_count <= v_lunch.capacity then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  if v_existing.id is not null then
    update signups
      set status = v_status, guest_count = v_guest_count,
          created_at = now(), cancelled_at = null, added_by_committee = false
      where id = v_existing.id
      returning * into v_result;
  else
    insert into signups (club_id, lunch_id, membership_id, status, guest_count)
      values (v_lunch.club_id, p_lunch, v_membership.id, v_status, v_guest_count)
      returning * into v_result;
  end if;

  perform set_signup_guests(v_result.id, v_ids);
  return v_result;
end;
$$;

create or replace function public.committee_add_signup_with_guests(
  p_lunch uuid, p_membership uuid, p_guests jsonb default '[]'::jsonb,
  p_force boolean default false
) returns signups
language plpgsql security definer set search_path = public as $$
declare
  v_lunch lunches%rowtype;
  v_existing signups%rowtype;
  v_ids uuid[];
  v_guest_count int;
  v_status signup_status;
  v_result signups%rowtype;
  v_host text;
begin
  select * into v_lunch from lunches where id = p_lunch for update;
  if v_lunch is null then raise exception 'Lunch not found'; end if;
  if not is_committee_of(v_lunch.club_id) then raise exception 'Committee only'; end if;
  if v_lunch.status not in ('draft', 'released') then
    raise exception 'This lunch is no longer open';
  end if;
  if not exists (
    select 1 from memberships
    where id = p_membership and club_id = v_lunch.club_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  select * into v_existing from signups
    where lunch_id = p_lunch and membership_id = p_membership;
  if v_existing.id is not null and v_existing.status <> 'cancelled' then
    raise exception 'That member is already signed up';
  end if;
  v_host := guest_seat_holder(p_lunch, p_membership);
  if v_host is not null then
    raise exception 'That member is already coming to this lunch as a guest of %. Take them off %''s guests first.', v_host, v_host;
  end if;

  v_ids := resolve_guests(v_lunch.club_id, p_lunch, p_membership, p_guests, true);
  v_guest_count := coalesce(array_length(v_ids, 1), 0);

  if p_force or lunch_seats_taken(p_lunch) + 1 + v_guest_count <= v_lunch.capacity then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  if v_existing.id is not null then
    update signups
      set status = v_status, guest_count = v_guest_count,
          created_at = now(), cancelled_at = null, added_by_committee = true
      where id = v_existing.id returning * into v_result;
  else
    insert into signups (club_id, lunch_id, membership_id, status, guest_count, added_by_committee)
      values (v_lunch.club_id, p_lunch, p_membership, v_status, v_guest_count, true)
      returning * into v_result;
  end if;

  perform set_signup_guests(v_result.id, v_ids);
  return v_result;
end;
$$;

-- ---------- 3. Old functions and column --------------------------------------

drop function if exists public.sign_up_for_lunch(uuid, int, text);
drop function if exists public.update_my_guests(uuid, int, text);
drop function if exists public.committee_add_signup(uuid, uuid, int, boolean);

alter table signups drop column guest_names;
