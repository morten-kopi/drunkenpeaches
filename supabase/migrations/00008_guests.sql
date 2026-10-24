-- =============================================================================
-- Guests as records
--
-- A guest is a person a member brings to a lunch. Each one is a row with a
-- name, email and dietary notes, so the same person is one record however
-- many lunches and hosts they come with. The email identifies them. Guests
-- never log in and are not memberships. When the committee makes a guest a
-- member, guests.membership_id links the two, so the lunches they came to as
-- a guest stay in their history.
--
-- signups.guest_count stays the seat count that every capacity rule reads.
-- The functions below keep it equal to the number of guests linked to the
-- signup. They sit beside sign_up_for_lunch, update_my_guests and
-- committee_add_signup, which the app version live before this one still
-- calls. A cleanup migration drops those, and signups.guest_names.
-- =============================================================================

-- ---------- Tables -----------------------------------------------------------

create table guests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  full_name text generated always as (btrim(first_name || ' ' || last_name)) stored,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  dietary_notes text,
  membership_id uuid references memberships(id) on delete set null,
  upgraded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (club_id, email)
);
create index guests_membership_idx on guests (membership_id) where membership_id is not null;

comment on table guests is
  'People members bring to lunches. One row per person per club, matched on email.';
comment on column guests.membership_id is
  'Set when the committee makes the guest a member. Their guest lunches stay linked here.';

create table signup_guests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  signup_id uuid not null references signups(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (signup_id, guest_id)
);
create index signup_guests_guest_idx on signup_guests (guest_id);

comment on table signup_guests is
  'The guests on a member''s signup. Rows stay when the signup is cancelled; readers skip cancelled signups.';
comment on column signups.guest_names is
  'Unused since 00008: guests are rows in signup_guests.';

-- ---------- RLS --------------------------------------------------------------

alter table guests enable row level security;
alter table signup_guests enable row level security;

-- Guests are committee business. Members see guest names only through
-- lunch_guests() and their own past guests through previous_guests().
-- Guests are created by the sign-up functions and never deleted.
create policy guests_select on guests for select using (is_committee_of(club_id));
create policy guests_update on guests for update
  using (is_committee_of(club_id)) with check (is_committee_of(club_id));

-- Written only by the sign-up functions.
create policy signup_guests_select on signup_guests for select using (is_committee_of(club_id));

grant select, insert, update, delete on guests, signup_guests to anon, authenticated, service_role;

-- ---------- Internal helpers -------------------------------------------------

-- Turn the guest list a form sends into guest ids. Each item is either
-- {"id": ...} for a guest already on file, or
-- {"first_name", "last_name", "email", "dietary_notes"} for someone new.
-- A new entry whose email the club already knows links to that guest, so a
-- second host never creates a duplicate. Members may pick by id only guests
-- they have brought before; the committee may pick any of the club's guests.
-- A member (or someone with a pending invite) can't be added as a guest, but
-- a guest already on this host's signup for p_lunch stays, so a guest made a
-- member doesn't lock their host's party.
create or replace function public.resolve_guests(
  p_club uuid, p_lunch uuid, p_host uuid, p_guests jsonb, p_any_guest boolean
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_ids uuid[] := '{}';
  v_first text;
  v_last text;
  v_email text;
  v_dietary text;
  v_guest guests%rowtype;
begin
  if p_guests is null then return v_ids; end if;
  if jsonb_typeof(p_guests) <> 'array' then raise exception 'Invalid guest list'; end if;

  for v_item in select value from jsonb_array_elements(p_guests) loop
    if nullif(v_item->>'id', '') is not null then
      select * into v_guest from guests
        where id = (v_item->>'id')::uuid and club_id = p_club;
      if v_guest.id is null
         or (not p_any_guest and not exists (
           select 1 from signup_guests sg join signups s on s.id = sg.signup_id
           where sg.guest_id = v_guest.id and s.membership_id = p_host
         )) then
        raise exception 'Guest not found';
      end if;
    else
      v_first := btrim(coalesce(v_item->>'first_name', ''));
      v_last := btrim(coalesce(v_item->>'last_name', ''));
      v_email := lower(btrim(coalesce(v_item->>'email', '')));
      v_dietary := nullif(btrim(coalesce(v_item->>'dietary_notes', '')), '');
      if v_first = '' or v_last = '' then
        raise exception 'Each guest needs a first and a last name';
      end if;
      if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'Enter a valid email for % %', v_first, v_last;
      end if;

      select * into v_guest from guests where club_id = p_club and email = v_email;
      if v_guest.id is null then
        -- Another lunch may be adding the same new guest right now.
        insert into guests (club_id, first_name, last_name, email, dietary_notes)
          values (p_club, v_first, v_last, v_email, v_dietary)
          on conflict (club_id, email) do nothing
          returning * into v_guest;
        if v_guest.id is null then
          select * into v_guest from guests where club_id = p_club and email = v_email;
        end if;
      elsif v_dietary is not null then
        -- Someone the club knows, brought again: keep the name on file and
        -- take the latest dietary notes.
        update guests set dietary_notes = v_dietary
          where id = v_guest.id returning * into v_guest;
      end if;
    end if;

    -- Members, and people with a pending invite, add their own names.
    if exists (
      select 1 from memberships m
      where m.club_id = p_club and m.status in ('active', 'invited')
        and (lower(m.email) = v_guest.email or m.id = v_guest.membership_id)
    ) and not exists (
      select 1 from signup_guests sg join signups s on s.id = sg.signup_id
      where sg.guest_id = v_guest.id and s.lunch_id = p_lunch
        and s.membership_id = p_host and s.status <> 'cancelled'
    ) then
      raise exception '% is a member and adds their own name', v_guest.full_name;
    end if;
    if v_guest.id = any(v_ids) then
      raise exception '% is listed twice', v_guest.full_name;
    end if;
    v_ids := v_ids || v_guest.id;
  end loop;
  return v_ids;
end;
$$;

-- Make a signup's guests exactly p_ids and set guest_count to match. A guest
-- comes to a lunch once, whoever brings them. Callers hold the lunch row lock.
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
  update signups set guest_count = coalesce(array_length(p_ids, 1), 0), guest_names = null
    where id = p_signup;
end;
$$;

-- The host's name when this member is already at the lunch as someone's
-- guest (say a guest made a member before the lunch), else null. Stops one
-- person holding two seats.
create or replace function public.guest_seat_holder(p_lunch uuid, p_membership uuid)
returns text
language sql stable security definer set search_path = public as $$
  select host.full_name
  from memberships m
  join guests g on g.club_id = m.club_id
    and (g.membership_id = m.id or g.email = lower(m.email))
  join signup_guests sg on sg.guest_id = g.id
  join signups s on s.id = sg.signup_id
  join memberships host on host.id = s.membership_id
  where m.id = p_membership and s.lunch_id = p_lunch and s.status <> 'cancelled'
  limit 1;
$$;

revoke execute on function public.resolve_guests(uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.set_signup_guests(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.guest_seat_holder(uuid, uuid) from public, anon, authenticated;

-- ---------- Member: sign up with guests ---------------------------------------
-- Same rules as sign_up_for_lunch (00006); the guests are records.

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
      set status = v_status, guest_count = v_guest_count, guest_names = null,
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

-- ---------- Member: change own guests -----------------------------------------
-- Same rules as update_my_guests (00006). Seats are checked only when the
-- party grows, so a lunch over capacity never blocks a member shrinking it.
-- Returns whoever the waitlist promoted, so the app can write to them
-- (update_my_guests promoted them without telling anyone).

create or replace function public.set_my_guests(p_lunch uuid, p_guests jsonb)
returns table (membership_id uuid, email text, full_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_lunch lunches%rowtype;
  v_signup signups%rowtype;
  v_membership memberships%rowtype;
  v_ids uuid[];
  v_guest_count int;
  v_max_guests int;
  v_other_seats int;
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

  v_ids := resolve_guests(v_lunch.club_id, p_lunch, v_membership.id, p_guests, false);
  v_guest_count := coalesce(array_length(v_ids, 1), 0);

  v_max_guests := case when v_lunch.guests_allowed
                       then coalesce(v_lunch.max_guests_per_member, 0) else 0 end;
  if v_guest_count > v_max_guests then
    raise exception 'Invalid guest count (max % per member)', v_max_guests;
  end if;

  if v_guest_count > v_signup.guest_count then
    if v_lunch.guests_open_at is not null and now() < v_lunch.guests_open_at then
      raise exception 'Guests may not be added yet';
    end if;
    if v_signup.status = 'confirmed' then
      v_other_seats := lunch_seats_taken(p_lunch) - (1 + v_signup.guest_count);
      if v_other_seats + 1 + v_guest_count > v_lunch.capacity then
        raise exception 'Not enough seats left to add that many guests';
      end if;
    end if;
  end if;

  perform set_signup_guests(v_signup.id, v_ids);

  -- Shrinking a confirmed party can free seats for the waitlist.
  return query select * from promote_from_waitlist(p_lunch);
end;
$$;

-- ---------- Committee: add a member with guests -------------------------------
-- Same rules as committee_add_signup (00001): ignores the cutoff and the
-- guest rules; p_force seats them even beyond capacity.

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
      set status = v_status, guest_count = v_guest_count, guest_names = null,
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

-- ---------- Committee: change anyone's guests ---------------------------------
-- Ignores the cutoff, the guest date and the per-member limit. On a draft or
-- released lunch a confirmed party may grow only into free seats, unless
-- p_force. After the lunch it corrects the record without seat checks.
-- Returns whoever the waitlist promoted, so the app can write to them.

create or replace function public.committee_set_guests(
  p_signup uuid, p_guests jsonb, p_force boolean default false
) returns table (membership_id uuid, email text, full_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_lunch_id uuid;
  v_lunch lunches%rowtype;
  v_signup signups%rowtype;
  v_ids uuid[];
  v_guest_count int;
begin
  select s.lunch_id into v_lunch_id from signups s where s.id = p_signup;
  if v_lunch_id is null then raise exception 'Signup not found'; end if;
  select * into v_lunch from lunches where id = v_lunch_id for update;
  if not is_committee_of(v_lunch.club_id) then raise exception 'Committee only'; end if;
  if v_lunch.status = 'cancelled' then raise exception 'This lunch is cancelled'; end if;

  select * into v_signup from signups where id = p_signup;
  if v_signup.status = 'cancelled' then raise exception 'That place was withdrawn'; end if;

  v_ids := resolve_guests(v_lunch.club_id, v_lunch.id, v_signup.membership_id, p_guests, true);
  v_guest_count := coalesce(array_length(v_ids, 1), 0);

  if v_guest_count > v_signup.guest_count
     and v_signup.status = 'confirmed'
     and v_lunch.status in ('draft', 'released')
     and not p_force
     and lunch_seats_taken(v_lunch.id) - v_signup.guest_count + v_guest_count > v_lunch.capacity then
    raise exception 'Not enough seats for that many guests. Tick "Seat even if full" to add them anyway.';
  end if;

  perform set_signup_guests(p_signup, v_ids);
  return query select * from promote_from_waitlist(v_lunch.id);
end;
$$;

-- ---------- Reading guests ----------------------------------------------------

-- Guests on a lunch's live signups. Any member who can see the lunch gets the
-- names; email and dietary notes come back for the committee only.
create or replace function public.lunch_guests(p_lunch uuid)
returns table (
  signup_id uuid, guest_id uuid, full_name text, email text, dietary_notes text
)
language sql stable security definer set search_path = public as $$
  select sg.signup_id, g.id, g.full_name,
         case when is_committee_of(l.club_id) then g.email end,
         case when is_committee_of(l.club_id) then g.dietary_notes end
  from lunches l
  join signups s on s.lunch_id = l.id
  join signup_guests sg on sg.signup_id = s.id
  join guests g on g.id = sg.guest_id
  where l.id = p_lunch
    and s.status <> 'cancelled'
    and (is_committee_of(l.club_id) or (is_member_of(l.club_id) and l.status <> 'draft'))
  order by sg.created_at, g.full_name;
$$;

-- Guests a member has brought before, most recent first, for the guest picker.
-- The member themselves or the committee may ask. Guests who became members
-- are left out.
create or replace function public.previous_guests(p_membership uuid)
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select g.id, g.full_name, g.email
  from memberships m
  join signups s on s.membership_id = m.id
  join signup_guests sg on sg.signup_id = s.id
  join guests g on g.id = sg.guest_id
  where m.id = p_membership
    and g.membership_id is null
    and (m.user_id = auth.uid() or is_committee_of(m.club_id))
  group by g.id, g.full_name, g.email
  order by max(sg.created_at) desc;
$$;

revoke execute on function public.sign_up_with_guests(uuid, jsonb) from public, anon;
revoke execute on function public.set_my_guests(uuid, jsonb) from public, anon;
revoke execute on function public.committee_add_signup_with_guests(uuid, uuid, jsonb, boolean) from public, anon;
revoke execute on function public.committee_set_guests(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.lunch_guests(uuid) from public, anon;
revoke execute on function public.previous_guests(uuid) from public, anon;
grant execute on function public.sign_up_with_guests(uuid, jsonb) to authenticated;
grant execute on function public.set_my_guests(uuid, jsonb) to authenticated;
grant execute on function public.committee_add_signup_with_guests(uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.committee_set_guests(uuid, jsonb, boolean) to authenticated;
grant execute on function public.lunch_guests(uuid) to authenticated;
grant execute on function public.previous_guests(uuid) to authenticated;
