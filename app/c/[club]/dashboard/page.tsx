import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarDaysIcon,
  CalendarOffIcon,
  MapPinIcon,
  PlusIcon,
  UsersIcon,
  UtensilsIcon,
} from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtTime, todayInZone } from "@/lib/format";
import { seatsTaken, type Lunch, type Signup } from "@/lib/types";
import {
  findNextOpenLunch,
  lunchCardPhaseLabel,
  resolveSignupPhase,
  signupWindowCopy,
} from "@/lib/signup-phases";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SeatMeter } from "@/components/seat-meter";
import { StatusBadge } from "@/components/status-badge";
import { LunchCard } from "@/components/lunch-card";

export const metadata: Metadata = { title: "Dashboard" };

type LunchRow = Lunch & { venues: { name: string } | null };

const waitlistedCount = (signups: Signup[]) =>
  signups.filter((s) => s.status === "waitlisted").length;

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club: slug } = await params;
  const ctx = await getClubContext(slug);
  const supabase = await createClient();
  const today = todayInZone(ctx.club.timezone);

  const { data: upcoming } = await supabase
    .from("lunches")
    .select("*, venues(name)")
    .eq("club_id", ctx.club.id)
    .gte("lunch_date", today)
    .in("status", ctx.isCommittee ? ["draft", "released"] : ["released"])
    .order("lunch_date")
    .limit(6);

  const lunches = (upcoming ?? []) as LunchRow[];
  const next = lunches.find((l) => l.status === "released");

  // One query for sign-ups across every visible upcoming lunch → seat meters.
  const signupsByLunch = new Map<string, Signup[]>();
  if (lunches.length) {
    const { data: allSignups } = await supabase
      .from("signups")
      .select("*")
      .in(
        "lunch_id",
        lunches.map((l) => l.id)
      );
    for (const s of (allSignups ?? []) as Signup[]) {
      const arr = signupsByLunch.get(s.lunch_id) ?? [];
      arr.push(s);
      signupsByLunch.set(s.lunch_id, arr);
    }
  }

  const nextSignups = next ? (signupsByLunch.get(next.id) ?? []) : [];
  const mySignup = next
    ? nextSignups.find(
        (s) =>
          s.membership_id === ctx.membership.id && s.status !== "cancelled"
      )
    : undefined;
  const nextPhase = next ? resolveSignupPhase(next) : null;
  const nextCopy = next && nextPhase ? signupWindowCopy(next, nextPhase, ctx.club.timezone) : null;
  const nextOpen = findNextOpenLunch(lunches, ctx.club.timezone);
  const heroCta = (() => {
    if (!next) return "Consult the luncheon";
    if (mySignup) return "View my place";
    if (nextPhase === "closed") return "The list is closed";
    if (nextPhase === "not_open") {
      return nextCopy?.title ?? "The list is not yet open";
    }
    if (nextPhase === "committee" && !ctx.isCommittee) {
      return "Committee priority";
    }
    if (!ctx.isCommittee && nextOpen && nextOpen.id !== next.id) {
      return "Consult the luncheon";
    }
    return "Consult & add your name";
  })();

  // Committee extras
  let venueCount = 0;
  let memberCount = 0;
  if (ctx.isCommittee) {
    const [{ count: vc }, { count: mc }] = await Promise.all([
      supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .eq("club_id", ctx.club.id)
        .neq("status", "archived"),
      supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("club_id", ctx.club.id)
        .eq("status", "active"),
    ]);
    venueCount = vc ?? 0;
    memberCount = mc ?? 0;
  }

  const comingUp = lunches.filter((l) => l.id !== next?.id);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={ctx.club.name}
        title={ctx.membership.first_name || "The notice board"}
        description="Forthcoming luncheons and the list."
      >
        {ctx.isCommittee ? (
          <Button render={<Link href={`/c/${slug}/lunches/new`} />}>
            <PlusIcon />
            Arrange a lunch
          </Button>
        ) : null}
      </PageHeader>

      {/* Next-lunch hero */}
      {next ? (
        <Card className="club-notice gap-0 p-5 sm:p-7">
          <p className="club-kicker">Next luncheon</p>
          <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h2 text-foreground">{next.title}</h2>
                <StatusBadge status={next.status} />
                {mySignup ? <StatusBadge status={mySignup.status} /> : null}
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <CalendarDaysIcon className="size-4 shrink-0" />
                  {fmtDate(next.lunch_date)} at {fmtTime(next.start_time)}
                </p>
                {next.venues ? (
                  <p className="flex items-center gap-1.5">
                    <MapPinIcon className="size-4 shrink-0" />
                    {next.venues.name}
                  </p>
                ) : null}
                {nextCopy ? (
                  <p className="max-w-md text-sm text-muted-foreground">
                    {nextCopy.title}
                    {nextCopy.detail ? ` — ${nextCopy.detail}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-4 md:w-64">
              <SeatMeter
                taken={seatsTaken(nextSignups)}
                capacity={next.capacity}
                waitlisted={waitlistedCount(nextSignups)}
              />
              <Button
                className="w-full"
                variant={mySignup ? "outline" : "default"}
                render={<Link href={`/c/${slug}/lunches/${next.id}`} />}
              >
                {heroCta}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={CalendarOffIcon}
          title="Nothing on the calendar"
          description={
            ctx.isCommittee
              ? "Arrange the first lunch and release it once the restaurant is booked."
              : "The next luncheon will appear here when the committee releases it."
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
      )}

      {/* Coming up */}
      {comingUp.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground">Also forthcoming</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comingUp.map((l) => {
              const s = signupsByLunch.get(l.id) ?? [];
              return (
                <LunchCard
                  key={l.id}
                  href={`/c/${slug}/lunches/${l.id}`}
                  title={l.title}
                  status={l.status}
                  date={l.lunch_date}
                  venueName={l.venues?.name}
                  taken={seatsTaken(s)}
                  capacity={l.capacity}
                  waitlisted={waitlistedCount(s)}
                  phaseLabel={
                    l.status === "released"
                      ? lunchCardPhaseLabel(l, ctx.club.timezone, {
                          isNextOpen: nextOpen?.id === l.id,
                        })
                      : null
                  }
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Committee stat tiles */}
      {ctx.isCommittee ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Link href={`/c/${slug}/venues`} className="block">
            <Card hover className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center border border-primary/20 bg-primary/8 text-primary">
                  <UtensilsIcon className="size-5" />
                </div>
                <div>
                  <p className="font-heading text-2xl leading-none">
                    {venueCount}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    venues on file
                  </p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href={`/c/${slug}/members`} className="block">
            <Card hover className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center border border-primary/20 bg-primary/8 text-primary">
                  <UsersIcon className="size-5" />
                </div>
                <div>
                  <p className="font-heading text-2xl leading-none">
                    {memberCount}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    members in good standing
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
