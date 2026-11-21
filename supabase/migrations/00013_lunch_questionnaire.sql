-- =============================================================================
-- The lunch questionnaire
--
-- After a lunch, the members who were there rate the food, the service and
-- the venue, and can leave comments. It replaces the Google Form the
-- committee sent around the day after.
--
-- 1. questionnaires holds the questions, one row per version per club. New
--    lunches use the newest row. To change the questions, insert a new row
--    (copy the newest and edit it). Never edit a row a lunch already uses:
--    past results keep the questions and weights they were answered with.
-- 2. Each lunch decides whether it has a questionnaire
--    (questionnaire_enabled, on by default). The first answer pins the lunch
--    to the newest version (questionnaire_id), so every answer to one lunch
--    is to the same questions.
-- 3. questionnaire_responses holds one row per member per lunch. Members
--    write only through submit_questionnaire, which checks that they had a
--    confirmed seat, that the lunch has started and that the answers fit the
--    questions. Answering again replaces the earlier answers.
-- 4. questionnaire_email_sent_at marks the email the morning after (sent by
--    the daily cron), so it goes once.
-- 5. Lunches already past get no questionnaire, so nobody is asked about
--    them.
-- =============================================================================

-- ---------- the questions ------------------------------------------------------

-- Shape of questions: a JSON array, shown in order.
--   { "key": "food_taste", "type": "rating", "label": "Food 1 - Taste & Quality",
--     "weight": 50, "required": true,
--     "options": [ { "value": 4, "label": "Excellent", "hint": "..." }, ... ] }
--   { "key": "comments", "type": "text", "label": "Comments", "required": false }
-- key: unique, stable, names the answer. weight: optional, how much a rating
-- counts in the overall score. hint: optional.
create or replace function public.questionnaire_questions_valid(q jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(q) = 'array'
    and jsonb_array_length(q) > 0
    and not exists (
      select 1 from jsonb_array_elements(q) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e->'key') is distinct from 'string'
         or btrim(e->>'key') = ''
         or jsonb_typeof(e->'label') is distinct from 'string'
         or btrim(e->>'label') = ''
         or e->>'type' is null
         or e->>'type' not in ('rating', 'text')
         or (e ? 'required' and jsonb_typeof(e->'required') <> 'boolean')
         or (e->>'type' = 'rating' and (
               jsonb_typeof(e->'options') is distinct from 'array'
               or jsonb_array_length(e->'options') = 0
               or (e ? 'weight' and jsonb_typeof(e->'weight') <> 'number')
               or exists (
                 select 1 from jsonb_array_elements(e->'options') o
                 where jsonb_typeof(o->'value') is distinct from 'number'
                    or jsonb_typeof(o->'label') is distinct from 'string'
                    or btrim(o->>'label') = ''
               )
             ))
    )
    and (select count(distinct e->>'key') from jsonb_array_elements(q) e)
        = jsonb_array_length(q);
$$;

create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  -- Shown above the questions, e.g. what to leave out of the rating.
  intro text,
  questions jsonb not null check (questionnaire_questions_valid(questions)),
  created_at timestamptz not null default now()
);
create index questionnaires_club_idx on questionnaires (club_id, created_at desc);

comment on table questionnaires is
  'The lunch questionnaire, one row per version. The newest is used for new lunches. Change the questions by inserting a new row, never by editing one a lunch uses.';

alter table questionnaires enable row level security;

create policy questionnaires_select on questionnaires for select
  using (is_member_of(club_id));

grant select on questionnaires to anon, authenticated;
grant all on questionnaires to service_role;

-- The questions of the Google Form the club used until now.
with scale as (
  select '[
    {"value": 4, "label": "Excellent", "hint": "Significantly above standard / memorable"},
    {"value": 3, "label": "Very Good", "hint": "Solid, above-average execution"},
    {"value": 2, "label": "Fair", "hint": "Acceptable but unremarkable or inconsistent"},
    {"value": 1, "label": "Poor / Below Average", "hint": "Below standard / flawed"}
  ]'::jsonb as options
)
insert into questionnaires (club_id, intro, questions)
select
  c.id,
  'This rating should not include the Wines or the Wine pairing - We evaluate the venue''s performance only',
  jsonb_build_array(
    jsonb_build_object('key', 'food_taste', 'type', 'rating',
      'label', 'Food 1 - Taste & Quality', 'weight', 50, 'required', true,
      'options', s.options),
    jsonb_build_object('key', 'food_creativity', 'type', 'rating',
      'label', 'Food 2 - Creativity & Presentation', 'weight', 15, 'required', true,
      'options', s.options),
    jsonb_build_object('key', 'service', 'type', 'rating',
      'label', 'Service & Hospitality', 'weight', 20, 'required', true,
      'options', s.options),
    jsonb_build_object('key', 'venue', 'type', 'rating',
      'label', 'Venue & Ambience', 'weight', 15, 'required', true,
      'options', s.options),
    jsonb_build_object('key', 'comments', 'type', 'text',
      'label', 'Provide your detailed comments and observations towards this luncheon',
      'required', false)
  )
from clubs c cross join scale s;

-- ---------- lunches ------------------------------------------------------------

alter table lunches
  add column questionnaire_enabled boolean not null default true,
  add column questionnaire_id uuid references questionnaires(id),
  add column questionnaire_email_sent_at timestamptz;

comment on column lunches.questionnaire_enabled is
  'Whether members who were at the lunch are asked to rate it.';
comment on column lunches.questionnaire_id is
  'The questionnaire version this lunch''s answers use. Set by the first answer; null until then.';
comment on column lunches.questionnaire_email_sent_at is
  'When the questionnaire email went out, the morning after the lunch. Set before sending, so it goes once.';

update lunches l
  set questionnaire_enabled = false
  from clubs c
  where c.id = l.club_id
    and l.lunch_date < (now() at time zone c.timezone)::date;

-- ---------- the answers --------------------------------------------------------

create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  lunch_id uuid not null references lunches(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  questionnaire_id uuid not null references questionnaires(id),
  -- Keyed by question key: a rating's option value, or a comment's text.
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lunch_id, membership_id)
);

comment on table questionnaire_responses is
  'A member''s answers to a lunch''s questionnaire. Written only through submit_questionnaire.';

alter table questionnaire_responses enable row level security;

-- The committee reads every answer; a member reads their own. No write
-- policies: answers go through submit_questionnaire.
create policy questionnaire_responses_select on questionnaire_responses for select
  using (
    is_committee_of(club_id)
    or exists (
      select 1 from memberships m
      where m.id = questionnaire_responses.membership_id
        and m.user_id = auth.uid()
    )
  );

grant select on questionnaire_responses to anon, authenticated;
grant all on questionnaire_responses to service_role;

-- ---------- answering ------------------------------------------------------------

-- p_answers is keyed by question key. A rating may come as a number or as
-- text ("4"); the option's own value is stored. Unknown keys are dropped.
create or replace function public.submit_questionnaire(p_lunch uuid, p_answers jsonb)
returns questionnaire_responses
language plpgsql security definer set search_path = public as $$
declare
  v_lunch lunches%rowtype;
  v_timezone text;
  v_membership memberships%rowtype;
  v_form questionnaires%rowtype;
  v_question jsonb;
  v_given text;
  v_option jsonb;
  v_answers jsonb := '{}'::jsonb;
  v_result questionnaire_responses%rowtype;
begin
  select * into v_lunch from lunches where id = p_lunch for update;
  if v_lunch.id is null then raise exception 'Lunch not found'; end if;
  if not v_lunch.questionnaire_enabled
     or v_lunch.status not in ('released', 'completed') then
    raise exception 'There is no questionnaire for this lunch';
  end if;

  select timezone into v_timezone from clubs where id = v_lunch.club_id;
  if now() < (v_lunch.lunch_date + v_lunch.start_time) at time zone v_timezone then
    raise exception 'The questionnaire opens when the lunch starts';
  end if;

  select * into v_membership from memberships
    where club_id = v_lunch.club_id and user_id = auth.uid() and status = 'active';
  if v_membership.id is null then
    raise exception 'You are not an active member of this club';
  end if;

  if not exists (
    select 1 from signups
    where lunch_id = p_lunch and membership_id = v_membership.id
      and status = 'confirmed' and attended is distinct from false
  ) then
    raise exception 'The questionnaire is for members who were at the lunch';
  end if;

  if v_lunch.questionnaire_id is not null then
    select * into v_form from questionnaires where id = v_lunch.questionnaire_id;
  else
    select * into v_form from questionnaires
      where club_id = v_lunch.club_id
      order by created_at desc, id
      limit 1;
    if v_form.id is null then
      raise exception 'No questionnaire is set up for this club';
    end if;
    update lunches set questionnaire_id = v_form.id where id = p_lunch;
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    p_answers := '{}'::jsonb;
  end if;

  for v_question in select value from jsonb_array_elements(v_form.questions) loop
    v_given := btrim(coalesce(p_answers ->> (v_question->>'key'), ''));

    if v_given = '' then
      if coalesce((v_question->>'required')::boolean, false) then
        raise exception 'Please answer "%"', v_question->>'label';
      end if;
      continue;
    end if;

    if v_question->>'type' = 'rating' then
      select o.value into v_option
        from jsonb_array_elements(v_question->'options') o
        where (o.value->>'value')::numeric = case
          when v_given ~ '^-?[0-9]+(\.[0-9]+)?$' then v_given::numeric end
        limit 1;
      if v_option is null then
        raise exception 'Pick one of the answers to "%"', v_question->>'label';
      end if;
      v_answers := v_answers || jsonb_build_object(v_question->>'key', v_option->'value');
      v_option := null;
    else
      if length(v_given) > 5000 then
        raise exception 'Keep "%" under 5000 characters', v_question->>'label';
      end if;
      v_answers := v_answers || jsonb_build_object(v_question->>'key', v_given);
    end if;
  end loop;

  insert into questionnaire_responses (club_id, lunch_id, membership_id, questionnaire_id, answers)
    values (v_lunch.club_id, p_lunch, v_membership.id, v_form.id, v_answers)
  on conflict (lunch_id, membership_id) do update
    set answers = excluded.answers,
        questionnaire_id = excluded.questionnaire_id,
        updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.submit_questionnaire(uuid, jsonb) from public, anon;
grant execute on function public.submit_questionnaire(uuid, jsonb) to authenticated;
