import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardListIcon, EyeIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  hasQuestionnaire,
  mayAnswer,
  questionnaireFor,
  questionnaireOpensAt,
  questionnairePath,
} from "@/lib/questionnaire";
import type { Lunch, QuestionnaireResponse, Signup } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { QuestionnaireForm } from "./questionnaire-form";

export const metadata: Metadata = { title: "Lunch questionnaire" };

export default async function QuestionnairePage({
  params,
}: {
  params: Promise<{ club: string; id: string }>;
}) {
  const { club: slug, id } = await params;
  const ctx = await getClubContext(slug);
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
      kicker="Lunch questionnaire"
      title={lunch.title}
      description={[lunch.venues?.name, fmtDate(lunch.lunch_date)]
        .filter(Boolean)
        .join(" · ")}
    >
      {ctx.isCommittee && hasQuestionnaire(lunch) ? (
        <Button
          variant="outline"
          render={<Link href={`${questionnairePath(slug, lunch.id)}/results`} />}
        >
          See the answers
        </Button>
      ) : null}
    </PageHeader>
  );
  const backToLunch = (
    <Button variant="outline" render={<Link href={lunchHref} />}>
      Back to the lunch
    </Button>
  );

  if (!hasQuestionnaire(lunch)) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={ClipboardListIcon}
          title="There is no questionnaire for this lunch."
          action={backToLunch}
        />
      </div>
    );
  }

  const opensAt = questionnaireOpensAt(lunch, ctx.club.timezone);
  const now = new Date();
  if (now < opensAt) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={ClipboardListIcon}
          title="The questionnaire opens when the lunch starts."
          description={`That is ${fmtDateTime(opensAt.toISOString(), ctx.club.timezone)}.`}
          action={backToLunch}
        />
      </div>
    );
  }

  const [form, { data: signup }, { data: response }] = await Promise.all([
    questionnaireFor(supabase, lunch),
    supabase
      .from("signups")
      .select("status, attended")
      .eq("lunch_id", lunch.id)
      .eq("membership_id", ctx.membership.id)
      .maybeSingle(),
    supabase
      .from("questionnaire_responses")
      .select("answers")
      .eq("lunch_id", lunch.id)
      .eq("membership_id", ctx.membership.id)
      .maybeSingle(),
  ]);

  if (!form) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={ClipboardListIcon}
          title="No questionnaire is set up yet."
          action={backToLunch}
        />
      </div>
    );
  }

  const canAnswer = mayAnswer(signup as Pick<Signup, "status" | "attended"> | null);

  if (!canAnswer && !ctx.isCommittee) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={ClipboardListIcon}
          title="This questionnaire is for the members who were at the lunch."
          action={backToLunch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}
      {!canAnswer ? (
        <p className="flex max-w-2xl items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <EyeIcon className="mt-0.5 size-4 shrink-0" />
          You had no seat at this lunch, so you see the questions as members
          do, without a way to answer.
        </p>
      ) : null}
      <QuestionnaireForm
        slug={slug}
        lunchId={lunch.id}
        intro={form.intro}
        questions={form.questions}
        answers={
          (response as Pick<QuestionnaireResponse, "answers"> | null)?.answers ??
          null
        }
        preview={!canAnswer}
      />
    </div>
  );
}
