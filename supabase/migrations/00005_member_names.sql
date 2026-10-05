-- =============================================================================
-- Member names, function and comments
-- Names are stored as first and last name, matching the club's own member
-- list. full_name stays as a derived column so every reader (emails, rosters,
-- waitlist promotion) keeps working unchanged. function is the free-text club
-- office (President, Treasurer, Wine Master ...); comments are the
-- committee's notes on the membership.
-- =============================================================================

alter table memberships
  add column first_name text not null default '',
  add column last_name text not null default '',
  add column function text,
  add column comments text;

comment on column memberships.function is
  'Free-text club office, e.g. President or Treasurer. Does not grant access; role does.';
comment on column memberships.comments is
  'Committee notes on the membership. Readable by any active member through the API, like the rest of the roster.';

-- Existing names split on the first space. A two-word first name such as
-- "Mary Anne Smith" comes out wrong and is corrected by hand.
update memberships set
  first_name = coalesce(substring(btrim(full_name) from '^\S+'), ''),
  last_name = btrim(regexp_replace(btrim(full_name), '^\S+', ''));

alter table memberships drop column full_name;
alter table memberships add column full_name text
  generated always as (btrim(first_name || ' ' || last_name)) stored;

-- Member edits their own profile (never their role, status, function or
-- comments; those stay with the committee).
drop function public.update_my_profile(uuid, text, text, text);

create function public.update_my_profile(
  p_club uuid, p_first_name text, p_last_name text, p_phone text, p_dietary_notes text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update memberships
    set first_name = coalesce(p_first_name, first_name),
        last_name = coalesce(p_last_name, last_name),
        phone = p_phone,
        dietary_notes = p_dietary_notes
    where club_id = p_club and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Membership not found'; end if;
end;
$$;

revoke execute on function public.update_my_profile(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.update_my_profile(uuid, text, text, text, text)
  to authenticated;
