// The lunch questionnaire: who may answer, when it opens, and the scores.
// The questions are data (the questionnaires table), never code: a new
// version is a new row, and a lunch keeps the version its first answer used.

import type { SupabaseClient } from "@supabase/supabase-js";
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

function ratingOf(answers: QuestionnaireAnswers, key: string) {
  const v = answers[key];
  return typeof v === "number" ? v : null;
}

/**
 * One member's overall score: the weighted average of their ratings, on the
 * questions' own scale. Questions without a weight count equally when none
 * has one, and not at all otherwise.
 */
export function weightedScore(
  questions: QuestionnaireQuestion[],
  answers: QuestionnaireAnswers
) {
  const rated = ratingQuestions(questions);
  const weighted = rated.some((q) => q.weight != null);
  let sum = 0;
  let total = 0;
  for (const q of rated) {
    const v = ratingOf(answers, q.key);
    const w = weighted ? (q.weight ?? 0) : 1;
    if (v == null || w <= 0) continue;
    sum += v * w;
    total += w;
  }
  return total > 0 ? sum / total : null;
}

/** The top of the scale, for "3.4 out of 4". */
export function scaleMax(questions: QuestionnaireQuestion[]) {
  const values = ratingQuestions(questions).flatMap((q) =>
    q.options.map((o) => o.value)
  );
  return values.length ? Math.max(...values) : null;
}

export function average(values: number[]) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

export function fmtScore(n: number | null) {
  return n == null ? "–" : n.toFixed(1);
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

/** "Excellent" for a stored 4, or the value itself if the scale changed. */
export function optionLabel(q: RatingQuestion, value: number | string | undefined) {
  if (value == null) return null;
  return q.options.find((o) => o.value === value)?.label ?? String(value);
}
