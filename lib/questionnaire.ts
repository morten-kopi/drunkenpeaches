// The lunch questionnaire: who may answer, when it opens, and the scores.
// The questions are data (the questionnaires table), never code: a new
// version is a new row, and a lunch keeps the version its first answer used.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { dateInZone, todayInZone } from "@/lib/format";
import { addClubDays, lunchStartAt } from "@/lib/signup-phases";
import type {
  Lunch,
  Questionnaire,
  QuestionnaireAnswers,
  QuestionnaireQuestion,
  Signup,
} from "@/lib/types";

export type RatingQuestion = Extract<QuestionnaireQuestion, { type: "rating" }>;
export type ChoiceQuestion = Extract<QuestionnaireQuestion, { type: "choice" }>;

export function questionnairePath(slug: string, lunchId: string) {
  return `/c/${slug}/lunches/${lunchId}/questionnaire`;
}

/** The link the secretary shares, and the email's button. */
export function questionnaireUrl(slug: string, lunchId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${questionnairePath(slug, lunchId)}`;
}

/** Whether a lunch has a questionnaire at all. */
export function hasQuestionnaire(
  lunch: Pick<Lunch, "questionnaire_enabled" | "status">
) {
  return (
    lunch.questionnaire_enabled &&
    (lunch.status === "released" || lunch.status === "completed")
  );
}

/** It opens when the lunch starts. */
export function questionnaireOpensAt(
  lunch: Pick<Lunch, "lunch_date" | "start_time">,
  timeZone: string
) {
  return lunchStartAt(lunch.lunch_date, lunch.start_time, timeZone);
}

/** The email can go from the day after the lunch until this many days after. */
export const QUESTIONNAIRE_EMAIL_DAYS = 7;

/**
 * Where the lunch stands for the questionnaire email, on the club's clock:
 * "before" the day after the lunch, "due" from then for a week, "past" after.
 */
export function questionnaireEmailWindow(
  lunch: Pick<Lunch, "lunch_date" | "start_time">,
  timeZone: string,
  now: Date = new Date()
): "before" | "due" | "past" {
  const today = todayInZone(timeZone, now);
  if (today <= lunch.lunch_date) return "before";
  const last = dateInZone(
    addClubDays(
      questionnaireOpensAt(lunch, timeZone),
      QUESTIONNAIRE_EMAIL_DAYS,
      timeZone
    ),
    timeZone
  );
  return today <= last ? "due" : "past";
}

/** Members with a confirmed seat who weren't marked as no-show. */
export function mayAnswer(
  signup: Pick<Signup, "status" | "attended"> | null | undefined
) {
  return signup?.status === "confirmed" && signup.attended !== false;
}

/** The lunch's own version once answered, else the club's newest. */
export async function questionnaireFor(
  supabase: SupabaseClient,
  lunch: Pick<Lunch, "club_id" | "questionnaire_id">
): Promise<Questionnaire | null> {
  const query = supabase.from("questionnaires").select("*");
  const { data } = lunch.questionnaire_id
    ? await query.eq("id", lunch.questionnaire_id).maybeSingle()
    : await query
        .eq("club_id", lunch.club_id)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(1)
        .maybeSingle();
  return (data as Questionnaire | null) ?? null;
}

export function ratingQuestions(questions: QuestionnaireQuestion[]) {
  return questions.filter((q): q is RatingQuestion => q.type === "rating");
}

/** Questions like "Will you come back?": counted, never part of the score. */
export function choiceQuestions(questions: QuestionnaireQuestion[]) {
  return questions.filter((q): q is ChoiceQuestion => q.type === "choice");
}

function ratingOf(answers: QuestionnaireAnswers, key: string) {
  const v = answers[key];
  return typeof v === "number" ? v : null;
}

/** The lowest and highest rating on offer, e.g. 1 to 5. */
export type Scale = { min: number; max: number };

export function ratingScale(questions: QuestionnaireQuestion[]): Scale | null {
  const values = ratingQuestions(questions).flatMap((q) =>
    q.options.map((o) => o.value)
  );
  return values.length
    ? { min: Math.min(...values), max: Math.max(...values) }
    : null;
}

/** The top of the scale, for "3.4 out of 5". */
export function scaleMax(questions: QuestionnaireQuestion[]) {
  return ratingScale(questions)?.max ?? null;
}

/**
 * A rating moved from its question's scale onto another, end to end: lowest
 * to lowest, highest to highest, evenly between. On 1 to 5, an answer on
 * 1 to 4 counts 4 as 5 and 3 as 3.67. Without a scale, the rating as given.
 */
function onScale(value: number, q: RatingQuestion, to: Scale | null) {
  const from = ratingScale([q]);
  if (!to || !from || from.max === from.min) return value;
  return to.min + ((value - from.min) * (to.max - to.min)) / (from.max - from.min);
}

/**
 * One member's overall score: the weighted average of their ratings, on the
 * questions' own scale, or on `to` when scores from versions with different
 * scales are pooled. Questions without a weight count equally when none has
 * one, and not at all otherwise.
 */
export function weightedScore(
  questions: QuestionnaireQuestion[],
  answers: QuestionnaireAnswers,
  to: Scale | null = null
) {
  const rated = ratingQuestions(questions);
  const weighted = rated.some((q) => q.weight != null);
  let sum = 0;
  let total = 0;
  for (const q of rated) {
    const v = ratingOf(answers, q.key);
    const w = weighted ? (q.weight ?? 0) : 1;
    if (v == null || w <= 0) continue;
    sum += onScale(v, q, to) * w;
    total += w;
  }
  return total > 0 ? sum / total : null;
}

export function average(values: number[]) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

export function fmtScore(n: number | null, digits = 1) {
  return n == null ? "–" : n.toFixed(digits);
}

/** Per rating question: how many answered, the average and each option's count. */
export function summarize(
  questions: QuestionnaireQuestion[],
  responses: { answers: QuestionnaireAnswers }[]
) {
  return ratingQuestions(questions).map((q) => {
    const values = responses
      .map((r) => ratingOf(r.answers, q.key))
      .filter((v): v is number => v != null);
    return {
      question: q,
      answered: values.length,
      average: average(values),
      options: [...q.options]
        .sort((a, b) => b.value - a.value)
        .map((o) => ({
          option: o,
          count: values.filter((v) => v === o.value).length,
        })),
    };
  });
}

/** "Outstanding" for a stored 5, or the value itself if the scale changed. */
export function optionLabel(q: RatingQuestion, value: number | string | undefined) {
  if (value == null) return null;
  return q.options.find((o) => o.value === value)?.label ?? String(value);
}

/** The option a choice answer picked, if it is still one of them. */
export function choiceOption(q: ChoiceQuestion, value: number | string | undefined) {
  return q.options.find((o) => o.value === value) ?? null;
}

/** How many answers picked each of a choice's options, in its order. */
export function tallyChoice(q: ChoiceQuestion, answers: QuestionnaireAnswers[]) {
  const options = q.options.map((option) => ({
    option,
    count: answers.filter((a) => a[q.key] === option.value).length,
  }));
  return {
    question: q,
    answered: options.reduce((n, o) => n + o.count, 0),
    options,
  };
}

export type ChoiceTally = ReturnType<typeof tallyChoice>;

// ---------- venue scores and rankings -----------------------------------------

/** One member's answers to a lunch, with what scoring and grouping need. */
export type ScoredResponse = {
  lunchId: string;
  venueId: string;
  /** The lunch's date, club wall-clock (YYYY-MM-DD). */
  lunchDate: string;
  questionnaireId: string;
  /** The questions of the version this answer used. */
  questions: QuestionnaireQuestion[];
  answers: QuestionnaireAnswers;
};

/**
 * Every answer to a lunch held at a venue, for the committee. Each answer
 * is scored with its own version's questions and weights.
 */
export async function loadVenueResponses(
  supabase: SupabaseClient,
  clubId: string
): Promise<{ responses: ScoredResponse[]; questionnaires: Questionnaire[] }> {
  type Row = {
    lunch_id: string;
    questionnaire_id: string;
    answers: QuestionnaireAnswers;
    lunches: { venue_id: string | null; lunch_date: string } | null;
  };
  const [rows, { data: forms }] = await Promise.all([
    fetchAll<Row>((from, to) =>
      supabase
        .from("questionnaire_responses")
        .select("lunch_id, questionnaire_id, answers, lunches(venue_id, lunch_date)")
        .eq("club_id", clubId)
        .order("id")
        .range(from, to)
    ),
    supabase
      .from("questionnaires")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false }),
  ]);
  const questionnaires = (forms ?? []) as Questionnaire[];
  const byId = new Map(questionnaires.map((q) => [q.id, q]));
  const responses = rows.flatMap((r) => {
    const form = byId.get(r.questionnaire_id);
    if (!form || !r.lunches?.venue_id) return [];
    return [
      {
        lunchId: r.lunch_id,
        venueId: r.lunches.venue_id,
        lunchDate: r.lunches.lunch_date,
        questionnaireId: form.id,
        questions: form.questions,
        answers: r.answers,
      },
    ];
  });
  return { responses, questionnaires };
}

function newestFirst(questionnaires: Questionnaire[]) {
  return [...questionnaires].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

/**
 * Questions to show across versions, by key: the newest version's wording
 * and order first, then keys only older versions had.
 */
function questionsByKey<Q extends QuestionnaireQuestion>(
  questionnaires: Questionnaire[],
  pick: (questions: QuestionnaireQuestion[]) => Q[]
) {
  const seen = new Map<string, Q>();
  for (const form of newestFirst(questionnaires)) {
    for (const q of pick(form.questions)) {
      if (!seen.has(q.key)) seen.set(q.key, q);
    }
  }
  return [...seen.values()];
}

/** The rating questions to show across versions. */
export function rankingQuestions(questionnaires: Questionnaire[]) {
  return questionsByKey(questionnaires, ratingQuestions);
}

/** The choice questions to show across versions. */
export function pooledChoiceQuestions(questionnaires: Questionnaire[]) {
  return questionsByKey(questionnaires, choiceQuestions);
}

/**
 * The newest version's scale. Scores pooled over several lunches are shown
 * on it, so answers to an older version with another scale (the first one
 * rated 1 to 4) count alongside the rest.
 */
export function currentScale(questionnaires: Questionnaire[]): Scale | null {
  for (const form of newestFirst(questionnaires)) {
    const scale = ratingScale(form.questions);
    if (scale) return scale;
  }
  return null;
}

/** Whether any of these answers were rated on another scale than `to`. */
export function onOtherScale(responses: ScoredResponse[], to: Scale | null) {
  return (
    to != null &&
    responses.some((r) => {
      const own = ratingScale(r.questions);
      return own != null && (own.min !== to.min || own.max !== to.max);
    })
  );
}

export type Score = {
  /** How many members answered. */
  answers: number;
  lunchIds: Set<string>;
  /** Average of each answer's weighted score, on the pooled scale. */
  overall: number | null;
  /** Average rating per question key, over the answers that rated it. */
  byQuestion: Map<string, number>;
};

/**
 * Pools every answer in a group: venue, lunch, or anything else. Ratings
 * are moved onto `to` (normally currentScale) first, so answers on
 * different scales can be averaged.
 */
export function scoreGroups(
  responses: ScoredResponse[],
  keyOf: (r: ScoredResponse) => string,
  to: Scale | null
) {
  const groups = new Map<string, ScoredResponse[]>();
  for (const r of responses) {
    const key = keyOf(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const scores = new Map<string, Score>();
  for (const [key, group] of groups) {
    const ratings = new Map<string, number[]>();
    for (const r of group) {
      for (const q of ratingQuestions(r.questions)) {
        const v = ratingOf(r.answers, q.key);
        if (v != null) {
          ratings.set(q.key, [...(ratings.get(q.key) ?? []), onScale(v, q, to)]);
        }
      }
    }
    scores.set(key, {
      answers: group.length,
      lunchIds: new Set(group.map((r) => r.lunchId)),
      overall: average(
        group
          .map((r) => weightedScore(r.questions, r.answers, to))
          .filter((s): s is number => s != null)
      ),
      byQuestion: new Map(
        [...ratings].map(([k, values]) => [k, average(values)!])
      ),
    });
  }
  return scores;
}

/**
 * Highest first, with shared places for equal scores as shown (two
 * decimals): 1, 2, 2, 4. Items without a score are left out.
 */
export function rank<T>(items: T[], value: (item: T) => number | null | undefined) {
  const scored = items
    .map((item) => ({ item, value: value(item) }))
    .filter((x): x is { item: T; value: number } => x.value != null)
    .map((x) => ({ ...x, shown: Math.round(x.value * 100) }))
    .sort((a, b) => b.shown - a.shown);
  return scored.map((x) => ({
    item: x.item,
    value: x.value,
    place: scored.findIndex((y) => y.shown === x.shown) + 1,
  }));
}
