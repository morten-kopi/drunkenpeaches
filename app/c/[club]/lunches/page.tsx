import Link from "next/link";
import type { Metadata } from "next";
import { CalendarOffIcon, PlusIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { seatsTaken, type Lunch, type Signup } from "@/lib/types";
import {
  findNextOpenLunch,
  lunchCardPhaseLabel,
} from "@/lib/signup-phases";
import { todayInZone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LunchCard } from "@/components/lunch-card";
import { ErrorBanner } from "@/components/error-banner";

export const metadata: Metadata = { title: "Lunches" };

type LunchRow = Lunch & { venues: { name: string } | null };
type SignupLite = Pick<
  Signup,
  "id" | "lunch_id" | "membership_id" | "status" | "guest_count"
>;

export default async function LunchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  const supabase = await createClient();
  const today = todayInZone(ctx.club.timezone);

  const [{ data: lunchData }, { data: signupData }] = await Promise.all([
    supabase
      .from("lunches")
      .select("*, venues(name)")
      .eq("club_id", ctx.club.id)
      .order("lunch_date", { ascending: false }),
    supabase
      .from("signups")
      .select("id, lunch_id, membership_id, status, guest_count")
      .eq("club_id", ctx.club.id),
  ]);

  const lunches = (lunchData ?? []) as LunchRow[];
  const signups = (signupData ?? []) as SignupLite[];

  const upcoming = lunches
    .filter((l) => l.lunch_date >= today && l.status !== "cancelled")
    .sort((a, b) => a.lunch_date.localeCompare(b.lunch_date));
  const past = lunches.filter(
    (l) => l.lunch_date < today || l.status === "cancelled"
  );
  const nextOpen = findNextOpenLunch(lunches, ctx.club.timezone);

  function card(l: LunchRow) {
    const ls = signups.filter((s) => s.lunch_id === l.id);
    const mine = ls.find(
      (s) => s.membership_id === ctx.membership.id && s.status !== "cancelled"
    );
    return (
      <LunchCard
        key={l.id}
        href={`/c/${slug}/lunches/${l.id}`}
        title={l.title}
        status={l.status}
        date={l.lunch_date}
        venueName={l.venues?.name}
        taken={seatsTaken(ls)}
        capacity={l.capacity}
        waitlisted={ls.filter((s) => s.status === "waitlisted").length}
        mySignupStatus={mine?.status}
        phaseLabel={
          l.status === "released"
            ? lunchCardPhaseLabel(l, ctx.club.timezone, {
                isNextOpen: nextOpen?.id === l.id,
              })
            : null
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />
      <PageHeader
        kicker="The book"
        title="Luncheons"
        description="Forthcoming and past tables."
      >
        {ctx.isCommittee ? (
          <Button render={<Link href={`/c/${slug}/lunches/new`} />}>
            <PlusIcon />
            Arrange a lunch
          </Button>
        ) : null}
      </PageHeader>

      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Forthcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarOffIcon}
            title="Nothing on the calendar"
            description={
              ctx.isCommittee
                ? "Arrange a lunch and release it once the restaurant is booked."
                : "The committee will post the next luncheon here."
            }
            action={
              ctx.isCommittee ? (
                <Button render={<Link href={`/c/${slug}/lunches/new`} />}>
                  <PlusIcon />
                  Arrange a lunch
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(card)}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground">Past &amp; cancelled</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map(card)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
