import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPinIcon, PhoneIcon, Trash2Icon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDateShort } from "@/lib/format";
import type { Venue } from "@/lib/types";
import { deleteVenueAction, restoreVenueAction } from "@/app/actions/venues";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Card } from "@/components/ui/card";
import {
  fmtScore,
  loadVenueResponses,
  questionnairePath,
  rankingQuestions,
  scaleMax,
  scoreGroups,
} from "@/lib/questionnaire";
import { plural } from "@/lib/email-templates";
import { VenueForm } from "../venue-form";

export const metadata: Metadata = { title: "Venue" };

export default async function VenueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug, id } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const [{ data: venueData }, { data: lunchData }, venueResponses] = await Promise.all([
    supabase
      .from("venues")
      .select("*")
      .eq("id", id)
      .eq("club_id", ctx.club.id)
      .single(),
    supabase
      .from("lunches")
      .select("id, title, lunch_date, status")
      .eq("venue_id", id)
      .order("lunch_date", { ascending: false }),
    loadVenueResponses(supabase, ctx.club.id),
  ]);
  if (!venueData) notFound();
  const venue = venueData as Venue;
  const archived = venue.status === "archived";
  const lunches = (lunchData ?? []) as {
    id: string;
    title: string;
    lunch_date: string;
    status: string;
  }[];

  // All-time questionnaire scores for this venue and each of its lunches.
  const responses = venueResponses.responses.filter((r) => r.venueId === id);
  const venueScore = scoreGroups(responses, () => "venue").get("venue") ?? null;
  const lunchScores = scoreGroups(responses, (r) => r.lunchId);
  const usedVersions = new Set(responses.map((r) => r.questionnaireId));
  const questions = rankingQuestions(
    venueResponses.questionnaires.filter((q) => usedVersions.has(q.id))
  );
  const max = scaleMax(questions);

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 text-foreground">{venue.name}</h1>
            {archived ? <StatusBadge status="archived" /> : null}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            {venue.address ? (
              <p className="flex items-center gap-2">
                <MapPinIcon className="size-4 shrink-0" />
                {venue.address}
              </p>
            ) : null}
            {venue.contact ? (
              <p className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0" />
                {venue.contact}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {archived ? (
            <form action={restoreVenueAction.bind(null, slug, venue.id)}>
              <Button type="submit" variant="outline">
                Restore venue
              </Button>
            </form>
          ) : (
            <Button
              render={
                <Link href={`/c/${slug}/lunches/new?venue=${venue.id}`} />
              }
            >
              Book a lunch here
            </Button>
          )}
        </div>
      </div>

      {/* Questionnaire scores */}
      {venueScore ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-h2 text-foreground">Scores</h2>
            <p className="text-sm text-muted-foreground">
              All time, from {plural(venueScore.answers, "answer")} to the
              lunch questionnaire
              {venueScore.lunchIds.size > 1
                ? ` over ${venueScore.lunchIds.size} lunches`
                : ""}
              .
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="gap-1 p-4">
              <p className="text-sm text-muted-foreground">Overall, weighted</p>
              <p className="font-heading text-3xl text-foreground tabular-nums">
                {fmtScore(venueScore.overall, 2)}
                {max != null ? (
                  <span className="ml-1.5 text-sm text-muted-foreground">
                    out of {max}
                  </span>
                ) : null}
              </p>
            </Card>
            {questions.map((q) => (
              <Card key={q.key} className="gap-1 p-4">
                <p className="text-sm text-muted-foreground">
                  {q.label}
                  {q.weight != null ? ` (${q.weight}%)` : ""}
                </p>
                <p className="font-heading text-2xl text-foreground tabular-nums">
                  {fmtScore(venueScore.byQuestion.get(q.key) ?? null, 2)}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Details */}
      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Details</h2>
        <VenueForm slug={slug} venue={venue} />
      </section>

      {/* Lunches at this venue */}
      {lunches.length > 0 ? (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-h2 text-foreground">Lunches at this venue</h2>
            <ul className="space-y-2">
              {lunches.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground tabular-nums">
                    {fmtDateShort(l.lunch_date)}
                  </span>
                  <Link
                    href={`/c/${slug}/lunches/${l.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {l.title}
                  </Link>
                  <StatusBadge status={l.status} />
                  {lunchScores.get(l.id)?.overall != null ? (
                    <Link
                      href={`${questionnairePath(slug, l.id)}/results`}
                      className="text-muted-foreground underline-offset-4 hover:underline"
                    >
                      <span className="font-medium text-foreground tabular-nums">
                        {fmtScore(lunchScores.get(l.id)!.overall, 2)}
                      </span>{" "}
                      · {plural(lunchScores.get(l.id)!.answers, "answer")}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* An archived venue with lunches is already as retired as it gets. */}
      {archived && lunches.length > 0 ? null : (
        <>
          <Separator />
          <form action={deleteVenueAction.bind(null, slug, venue.id)}>
            <ConfirmSubmit
              confirmTitle={lunches.length > 0 ? "Archive venue?" : "Delete venue?"}
              confirmMessage={
                lunches.length > 0
                  ? `${venue.name} has lunch history, so it will be archived instead of deleted.`
                  : `This permanently deletes ${venue.name}.`
              }
              confirmLabel={lunches.length > 0 ? "Archive venue" : "Delete venue"}
              variant="destructive"
            >
              <Trash2Icon />
              {lunches.length > 0 ? "Archive venue" : "Delete venue"}
            </ConfirmSubmit>
          </form>
        </>
      )}
    </div>
  );
}
