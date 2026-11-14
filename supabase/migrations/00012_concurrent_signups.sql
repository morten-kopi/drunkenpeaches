-- =============================================================================
-- Members can sign up for any lunch whose sign-up window is open
--
-- Until now a member could only sign up for the earliest lunch with an open
-- window. When December opened while November was still open, December
-- stayed locked until November's cutoff passed. Each lunch already has its
-- own opening dates, cutoff and capacity, so those now decide on their own.
--
-- 1. sign_up_with_guests is the 00010 version without the next-open check.
--    create or replace keeps its grants.
-- 2. next_open_lunch_id has no other callers and is dropped.
-- =============================================================================

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

drop function if exists public.next_open_lunch_id(uuid);
