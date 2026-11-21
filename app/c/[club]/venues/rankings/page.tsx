import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrophyIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import {
  fmtScore,
  loadVenueResponses,
  rank,
  rankingQuestions,
  scaleMax,
  scoreGroups,
  type Score,
} from "@/lib/questionnaire";
import { plural } from "@/lib/email-templates";
import type { Venue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { VenuesTabs } from "../venues-tabs";

export const metadata: Metadata = { title: "Venue rankings" };

type Ranked = {
  venue: Pick<Venue, "id" | "name">;
  score: Score;
};

function RankedList({
  slug,
  rows,
  value,
  detail,
}: {
  slug: string;
  rows: Ranked[];
  value: (r: Ranked) => number | null | undefined;
  detail?: (r: Ranked) => string;
}) {
  const ranked = rank(rows, value);
  if (ranked.length === 0) {
    return <p className="text-sm text-muted-foreground">No ratings yet.</p>;
  }
  return (
    <ol className="divide-y divide-border">
      {ranked.map(({ item, value: v, place }) => (
        <li key={item.venue.id} className="flex items-center gap-3 py-2.5">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
              place === 1
                ? "bg-gold text-gold-foreground"
                : "bg-muted text-muted-foreground"
            )}
            aria-label={`Place ${place}`}
          >
            {place}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/c/${slug}/venues/${item.venue.id}`}
              className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {item.venue.name}
            </Link>
            {detail ? (
              <p className="text-xs text-muted-foreground">{detail(item)}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
            {fmtScore(v, 2)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function VenueRankingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { club: slug } = await params;
  const { year: yearParam } = await searchParams;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const [{ data: venueData }, { responses, questionnaires }] = await Promise.all([
    supabase.from("venues").select("id, name").eq("club_id", ctx.club.id),
    loadVenueResponses(supabase, ctx.club.id),
  ]);
  const venues = new Map(
    ((venueData ?? []) as Pick<Venue, "id" | "name">[]).map((v) => [v.id, v])
  );

  // Years run on the lunch's own date, January to December.
  const years = [...new Set(responses.map((r) => r.lunchDate.slice(0, 4)))].sort(
    (a, b) => b.localeCompare(a)
  );
  const year = yearParam && years.includes(yearParam) ? yearParam : null;
  const inPeriod = year
    ? responses.filter((r) => r.lunchDate.startsWith(year))
    : responses;

  const scores = scoreGroups(inPeriod, (r) => r.venueId);
  const rows: Ranked[] = [...scores].flatMap(([venueId, score]) => {
    const venue = venues.get(venueId);
    return venue ? [{ venue, score }] : [];
  });
  const usedVersions = new Set(inPeriod.map((r) => r.questionnaireId));
  const questions = rankingQuestions(
    questionnaires.filter((q) => usedVersions.has(q.id))
  );
  const max = scaleMax(questions);

  const periods = [
    { label: "All time", href: `/c/${slug}/venues/rankings`, active: year == null },
    ...years.map((y) => ({
      label: y,
      href: `/c/${slug}/venues/rankings?year=${y}`,
      active: year === y,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Committee"
        title="Venues"
        description="How members rated each venue in the lunch questionnaire."
      />

      <VenuesTabs slug={slug} active="rankings" />

      {rows.length === 0 ? (
        <EmptyState
          icon={TrophyIcon}
          title="No rankings yet"
          description="Venues are ranked once members answer the questionnaire after a lunch."
        />
      ) : (
        <>
          <nav aria-label="Period" className="flex flex-wrap gap-2">
            {periods.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                aria-current={p.active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  p.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>

          <Card>
            <CardHeader>
              <CardTitle>Overall</CardTitle>
              <p className="text-sm text-muted-foreground">
                Each answer&apos;s weighted score, averaged over every answer
                for the venue{year ? ` in ${year}` : ""}
                {max != null ? `, out of ${max}` : ""}.
              </p>
            </CardHeader>
            <CardContent>
              <RankedList
                slug={slug}
                rows={rows}
                value={(r) => r.score.overall}
                detail={(r) =>
                  `${r.score.lunchIds.size} ${r.score.lunchIds.size === 1 ? "lunch" : "lunches"} · ${plural(r.score.answers, "answer")}`
                }
              />
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-2">
            {questions.map((q) => (
              <Card key={q.key}>
                <CardHeader>
                  <CardTitle>
                    {q.label}
                    {q.weight != null ? (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        ({q.weight}%)
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RankedList
                    slug={slug}
                    rows={rows}
                    value={(r) => r.score.byQuestion.get(q.key)}
                  />
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
