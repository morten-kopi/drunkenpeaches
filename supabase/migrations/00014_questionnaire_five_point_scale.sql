-- =============================================================================
-- The lunch questionnaire on a five-point scale, with "Will you come back?"
--
-- The committee's changes after the first lunches with the questionnaire:
-- 1. The ratings go from four points to five: Poor, Fair, Good, Very Good,
--    Outstanding.
-- 2. A new question, "Will you come back?": No, Maybe or Absolutely, in red,
--    yellow and green. It is an add-on to the rating, not part of it: it
--    doesn't count in the score, and the results show it as a pie chart.
--
-- "Will you come back?" is a new kind of question, a choice: each option has
-- a text value, a label and optionally a colour, and the answers are counted
-- rather than averaged.
--
-- Both changes are a new questionnaire version, copied from each club's
-- newest (00013's rule: never edit a version a lunch uses). Lunches already
-- answered keep the version they were answered with; every other lunch gets
-- the new one with its first answer.
--
-- Apply this after the code that knows choice questions is deployed: the
-- earlier code shows a choice as a comment box.
-- =============================================================================

-- ---------- the questions may now include choices ----------------------------

-- Shape of a choice (see 00013 for ratings and text):
--   { "key": "come_back", "type": "choice", "label": "Will you come back?",
--     "required": true,
--     "options": [ { "value": "no", "label": "No", "color": "red" }, ... ] }
-- value: a unique, stable text, stored as the answer. color: optional, one
-- of red, yellow, green.
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
         or e->>'type' not in ('rating', 'choice', 'text')
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
         or (e->>'type' = 'choice' and (
               jsonb_typeof(e->'options') is distinct from 'array'
               or jsonb_array_length(e->'options') = 0
               or exists (
                 select 1 from jsonb_array_elements(e->'options') o
                 where jsonb_typeof(o->'value') is distinct from 'string'
                    or btrim(o->>'value') = ''
                    or jsonb_typeof(o->'label') is distinct from 'string'
                    or btrim(o->>'label') = ''
                    or (o ? 'color' and (
                          jsonb_typeof(o->'color') <> 'string'
                          or o->>'color' not in ('red', 'yellow', 'green')))
               )
               or (select count(distinct o->>'value')
                     from jsonb_array_elements(e->'options') o)
                  <> jsonb_array_length(e->'options')
             ))
    )
    and (select count(distinct e->>'key') from jsonb_array_elements(q) e)
        = jsonb_array_length(q);
$$;

-- ---------- answering a choice -------------------------------------------------

-- As in 00013, plus choices: the answer must be one of the option values,
-- and that value is stored.
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
    elsif v_question->>'type' = 'choice' then
      select o.value into v_option
        from jsonb_array_elements(v_question->'options') o
        where o.value->>'value' = v_given
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

-- ---------- the new version ----------------------------------------------------

-- Each club's newest version, with every rating on the five-point scale and
-- "Will you come back?" after the ratings, before the comments. The hints
-- are the four-point scale's, with one new for Good. clock_timestamp(), not
-- now(), so the new version is the newest even when this runs in the same
-- transaction as 00013.
with scale as (
  select '[
    {"value": 5, "label": "Outstanding", "hint": "Significantly above standard / memorable"},
    {"value": 4, "label": "Very Good", "hint": "Solid, above-average execution"},
    {"value": 3, "label": "Good", "hint": "Meets the standard"},
    {"value": 2, "label": "Fair", "hint": "Acceptable but unremarkable or inconsistent"},
    {"value": 1, "label": "Poor", "hint": "Below standard / flawed"}
  ]'::jsonb as options
),
come_back as (
  select '{
    "key": "come_back", "type": "choice", "label": "Will you come back?",
    "required": true,
    "options": [
      {"value": "no", "label": "No", "color": "red"},
      {"value": "maybe", "label": "Maybe", "color": "yellow"},
      {"value": "absolutely", "label": "Absolutely", "color": "green"}
    ]
  }'::jsonb as question
),
newest as (
  select distinct on (club_id) club_id, intro, questions
  from questionnaires
  order by club_id, created_at desc, id
)
insert into questionnaires (club_id, intro, questions, created_at)
select
  n.club_id,
  n.intro,
  coalesce((
    select jsonb_agg(jsonb_set(x.e, '{options}', s.options) order by x.i)
    from jsonb_array_elements(n.questions) with ordinality as x(e, i)
    where x.e->>'type' = 'rating'
  ), '[]'::jsonb)
  || jsonb_build_array(c.question)
  || coalesce((
    select jsonb_agg(x.e order by x.i)
    from jsonb_array_elements(n.questions) with ordinality as x(e, i)
    where x.e->>'type' <> 'rating'
  ), '[]'::jsonb),
  clock_timestamp()
from newest n
cross join scale s
cross join come_back c
where not exists (
  select 1 from jsonb_array_elements(n.questions) e
  where e->>'key' = 'come_back'
);
