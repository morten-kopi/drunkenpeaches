import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardListIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  average,
  choiceOption,
  choiceQuestions,
  fmtScore,
  hasQuestionnaire,
  mayAnswer,
  optionLabel,
  questionnaireFor,
  questionnairePath,
  ratingQuestions,
  scaleMax,
  summarize,
  tallyChoice,
  weightedScore,
} from "@/lib/questionnaire";
import type {
  Lunch,
  Membership,
  QuestionnaireResponse,
  Signup,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoicePie, choiceColor } from "@/components/choice-pie";

export const metadata: Metadata = { title: "Questionnaire answers" };

type ResponseRow = QuestionnaireResponse & {
  memberships: Pick<Membership, "full_name"> | null;
};

type SignupRow = Pick<Signup, "membership_id" | "status" | "attended"> & {
  memberships: Pick<Membership, "full_name"> | null;
};

export default async function QuestionnaireResultsPage({
  params,
}: {
  params: Promise<{ club: string; id: string }>;
}) {
  const { club: slug, id } = await params;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();
  const supabase = await createClient();

  const { data: lunchData } = await supabase
    .from("lunches")
    .select("*, venues(name)")
    .eq("id", id)
    .eq("club_id", ctx.club.id)
    .maybeSingle();
  if (!lunchData) notFound();
  const lunch = lunchData as Lunch & { venues: { name: string } | null };
  const lunchHref = `/c/${slug}/lunches/${lunch.id}`;

  const header = (
    <PageHeader
      kicker="Questionnaire answers"
      title={lunch.title}
      description={[lunch.venues?.name, fmtDate(lunch.lunch_date)]
        .filter(Boolean)
        .join(" · ")}
    >
      <Button variant="outline" render={<Link href={lunchHref} />}>
        Back to the lunch
      </Button>
      {hasQuestionnaire(lunch) ? (
        <Button
          variant="outline"
          render={<Link href={questionnairePath(slug, lunch.id)} />}
        >
          Open the questionnaire
        </Button>
      ) : null}
    </PageHeader>
  );

  const [form, { data: responseData }, { data: signupData }] = await Promise.all([
    questionnaireFor(supabase, lunch),
    supabase
      .from("questionnaire_responses")
      .select("*, memberships(full_name)")
      .eq("lunch_id", lunch.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("signups")
      .select("membership_id, status, attended, memberships(full_name)")
      .eq("lunch_id", lunch.id)
      .eq("status", "confirmed"),
  ]);
  const responses = (responseData ?? []) as ResponseRow[];

  if (!form || (!hasQuestionnaire(lunch) && responses.length === 0)) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={ClipboardListIcon}
          title="There is no questionnaire for this lunch."
          description={
            form ? "Turn it on in Edit details to ask the members who were there." : undefined
          }
        />
      </div>
    );
  }

  const eligible = ((signupData ?? []) as unknown as SignupRow[]).filter(mayAnswer);
  const answered = new Set(responses.map((r) => r.membership_id));
  const waiting = eligible
    .filter((s) => !answered.has(s.membership_id))
    .map((s) => s.memberships?.full_name ?? "Unknown")
    .sort((a, b) => a.localeCompare(b));

  const ratings = ratingQuestions(form.questions);
  const choices = choiceQuestions(form.questions);
  const texts = form.questions.filter((q) => q.type === "text");
  const max = scaleMax(form.questions);
  const scores = responses
    .map((r) => weightedScore(form.questions, r.answers))
    .filter((s): s is number => s != null);
  const overall = average(scores);
  const weighted = ratings.some((q) => q.weight != null);
  const summary = summarize(form.questions, responses);
  const tallies = choices.map((q) =>
    tallyChoice(q, responses.map((r) => r.answers))
  );

  return (
    <div className="space-y-8">
      {header}

      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-1 p-5">
          <p className="text-sm text-muted-foreground">
            Overall score{weighted ? ", weighted" : ""}
          </p>
          {overall == null ? (
            <p className="text-lg text-muted-foreground">No answers yet</p>
          ) : (
            <p className="font-heading text-4xl text-foreground tabular-nums">
              {fmtScore(overall)}
              {max != null ? (
                <span className="ml-1.5 text-base text-muted-foreground">
                  out of {max}
                </span>
              ) : null}
            </p>
          )}
        </Card>
        <Card className="gap-1 p-5">
          <p className="text-sm text-muted-foreground">Answered</p>
          <p className="font-heading text-4xl text-foreground tabular-nums">
            {responses.length}
            <span className="ml-1.5 text-base text-muted-foreground">
              of {eligible.length} who had a seat
            </span>
          </p>
        </Card>
      </section>

      {tallies.map((t) => (
        <Card key={t.question.key}>
          <CardHeader>
            <CardTitle>{t.question.label}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Asked beside the rating; not part of the score.
            </p>
          </CardHeader>
          <CardContent>
            <ChoicePie tally={t} />
          </CardContent>
        </Card>
      ))}

      {summary.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2">
          {summary.map((s) => (
            <Card key={s.question.key}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-3">
                  <span>
                    {s.question.label}
                    {s.question.weight != null ? (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        ({s.question.weight}%)
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {fmtScore(s.average)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {s.options.map(({ option, count }) => (
                    <li
                      key={option.value}
                      className="grid grid-cols-[minmax(0,10rem)_1fr_1.5rem] items-center gap-3 text-sm"
                      title={`${option.label}: ${count} of ${s.answered}`}
                    >
                      <span className="truncate text-muted-foreground">
                        {option.value}. {option.label}
                      </span>
                      <span className="h-2 rounded-full bg-muted">
                        <span
                          className="block h-2 rounded-full bg-primary"
                          style={{
                            width: s.answered
                              ? `${(count / s.answered) * 100}%`
                              : 0,
                          }}
                        />
                      </span>
                      <span className="text-right text-foreground tabular-nums">
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-h2 text-foreground">Answers</h2>
        {responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No answers yet.</p>
        ) : (
          <ul className="space-y-3">
            {responses.map((r) => {
              const score = weightedScore(form.questions, r.answers);
              return (
                <li key={r.id}>
                  <Card className="gap-3 p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-medium text-foreground">
                        {r.memberships?.full_name ?? "Unknown"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {score != null ? (
                          <span className="mr-3 font-medium text-foreground tabular-nums">
                            {fmtScore(score)}
                          </span>
                        ) : null}
                        {fmtDateTime(r.updated_at, ctx.club.timezone)}
                      </p>
                    </div>
                    {ratings.length + choices.length > 0 ? (
                      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        {ratings.map((q) => (
                          <div key={q.key} className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">{q.label}</dt>
                            <dd className="shrink-0 text-foreground">
                              {r.answers[q.key] != null
                                ? `${r.answers[q.key]}. ${optionLabel(q, r.answers[q.key])}`
                                : "–"}
                            </dd>
                          </div>
                        ))}
                        {choices.map((q) => {
                          const picked = choiceOption(q, r.answers[q.key]);
                          return (
                            <div key={q.key} className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">{q.label}</dt>
                              <dd className="flex shrink-0 items-center gap-1.5 text-foreground">
                                {picked ? (
                                  <span
                                    className="size-2.5 rounded-full"
                                    style={{
                                      background: choiceColor(
                                        picked.color,
                                        q.options.indexOf(picked)
                                      ),
                                    }}
                                    aria-hidden
                                  />
                                ) : null}
                                {picked?.label ?? r.answers[q.key] ?? "–"}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    ) : null}
                    {texts.map((q) =>
                      r.answers[q.key] ? (
                        <div key={q.key} className="space-y-1">
                          {texts.length > 1 ? (
                            <p className="text-xs text-muted-foreground">{q.label}</p>
                          ) : null}
                          <p className="text-sm whitespace-pre-line text-foreground/90">
                            {String(r.answers[q.key])}
                          </p>
                        </div>
                      ) : null
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {waiting.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-h2 text-foreground">
            Not answered yet ({waiting.length})
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {waiting.join(", ")}
          </p>
        </section>
      ) : null}
    </div>
  );
}
