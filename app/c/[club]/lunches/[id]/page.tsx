import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDaysIcon,
  ClockIcon,
  DownloadIcon,
  LockIcon,
  MapPinIcon,
  PencilIcon,
} from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import {
  fmtDate,
  fmtTime,
  fmtDateTime,
  initials,
  todayInZone,
} from "@/lib/format";
import {
  guestPolicy,
  seatsTaken,
  type GuestOption,
  type Lunch,
  type LunchGuest,
  type Membership,
  type Signup,
} from "@/lib/types";
import { guestNames, guestsBySignup } from "@/lib/guests";
import { fetchAll } from "@/lib/fetch-all";
import {
  findNextOpenLunch,
  resolveSignupPhase,
  signupWindowCopy,
  toDatetimeLocalValue,
} from "@/lib/signup-phases";
import {
  releaseLunchAction,
  completeLunchAction,
  cancelLunchAction,
  deleteDraftLunchAction,
  setCapacityAction,
  setCutoffAction,
  committeeRemoveSignupAction,
  markAttendanceAction,
} from "@/app/actions/lunches";
import {
  restaurantListText,
  restaurantRows,
} from "@/lib/restaurant-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SeatMeter } from "@/components/seat-meter";
import { CopyButton } from "@/components/copy-button";
import { SignupCard } from "./signup-card";
import { EditGuestsDialog } from "./edit-guests-dialog";
import { CommitteeAddForm } from "./committee-add-form";

type SignupRow = Signup & {
  memberships: Pick<
    Membership,
    "id" | "full_name" | "email" | "dietary_notes"
  > | null;
};

export default async function LunchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug, id } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  const supabase = await createClient();

  const { data: lunchData } = await supabase
    .from("lunches")
    .select("*, venues(id, name, address)")
    .eq("id", id)
    .eq("club_id", ctx.club.id)
    .single();
  if (!lunchData) notFound();
  const lunch = lunchData as Lunch & {
    venues: { id: string; name: string; address: string | null } | null;
  };

  const { data: signupData } = await supabase
    .from("signups")
    .select("*, memberships(id, full_name, email, dietary_notes)")
    .eq("lunch_id", id)
    .order("created_at");
  const signups = (signupData ?? []) as SignupRow[];

  // Guest names for everyone; email and dietary notes for the committee.
  const { data: lunchGuestData } = await supabase.rpc("lunch_guests", {
    p_lunch: id,
  });
  const guestMap = guestsBySignup(lunchGuestData as LunchGuest[] | null);
  const guestsOf = (signupId: string): GuestOption[] =>
    (guestMap.get(signupId) ?? []).map((g) => ({
      id: g.guest_id,
      full_name: g.full_name,
    }));
  const guestText = (s: Signup) => guestNames(guestMap.get(s.id));

  const confirmed = signups.filter((s) => s.status === "confirmed");
  const waitlisted = signups.filter((s) => s.status === "waitlisted");
  const taken = seatsTaken(signups);
  const seatsLeft = Math.max(0, lunch.capacity - taken);
  const overCapacity = taken > lunch.capacity;
  const policy = guestPolicy(lunch);
  const now = new Date();
  const phase = resolveSignupPhase(lunch, now);
  const cutoffPassed = phase === "closed";
  const windowCopy = signupWindowCopy(lunch, phase, ctx.club.timezone);

  const today = todayInZone(ctx.club.timezone, now);
  const { data: upcomingData } = await supabase
    .from("lunches")
    .select("*")
    .eq("club_id", ctx.club.id)
    .eq("status", "released")
    .gte("lunch_date", today)
    .order("lunch_date")
    .order("start_time");
  const nextOpen = findNextOpenLunch(
    (upcomingData ?? []) as Lunch[],
    ctx.club.timezone,
    now
  );
  const isNextOpenLunch = nextOpen?.id === lunch.id;
  const mySignup =
    signups.find(
      (s) => s.membership_id === ctx.membership.id && s.status !== "cancelled"
    ) ?? null;

  // Committee extras
  let roster: Pick<Membership, "id" | "full_name" | "email">[] = [];
  if (ctx.isCommittee) {
    const { data: r } = await supabase
      .from("memberships")
      .select("id, full_name, email")
      .eq("club_id", ctx.club.id)
      .eq("status", "active")
      .order("full_name");
    roster = (r ?? []) as Pick<Membership, "id" | "full_name" | "email">[];
  }
  const signedUpIds = new Set(
    signups.filter((s) => s.status !== "cancelled").map((s) => s.membership_id)
  );
  const addable = roster.filter((m) => !signedUpIds.has(m.id));

  // Guests each member has brought before, for the committee's guest picker.
  const previousByMember: Record<string, GuestOption[]> = {};
  if (ctx.isCommittee) {
    type Link = {
      guests: { id: string; full_name: string; membership_id: string | null } | null;
      signups: { membership_id: string } | null;
    };
    const links = await fetchAll<Link>((from, to) =>
      supabase
        .from("signup_guests")
        .select("guests(id, full_name, membership_id), signups(membership_id)")
        .eq("club_id", ctx.club.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
    for (const { guests: g, signups: host } of links) {
      if (!g || !host || g.membership_id) continue;
      const list = (previousByMember[host.membership_id] ??= []);
      if (!list.some((o) => o.id === g.id)) list.push({ id: g.id, full_name: g.full_name });
    }
  }
  const { data: myPreviousData } =
    lunch.status === "released"
      ? await supabase.rpc("previous_guests", { p_membership: ctx.membership.id })
      : { data: [] };
  const myPreviousGuests = ((myPreviousData ?? []) as GuestOption[]).map((g) => ({
    id: g.id,
    full_name: g.full_name,
  }));

  const restaurantList = restaurantListText(
    { ...lunch, venueName: lunch.venues?.name ?? null },
    restaurantRows(confirmed.map((s) => ({ ...s, guests: guestMap.get(s.id) })))
  );

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 text-foreground">{lunch.title}</h1>
            <StatusBadge status={lunch.status} />
          </div>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CalendarDaysIcon className="size-4 shrink-0" />
              {fmtDate(lunch.lunch_date)}
              <ClockIcon className="ml-1 size-4 shrink-0" />
              {fmtTime(lunch.start_time)}
            </p>
            {lunch.venues ? (
              <p className="flex items-center gap-2">
                <MapPinIcon className="size-4 shrink-0" />
                {lunch.venues.name}
                {lunch.venues.address ? ` · ${lunch.venues.address}` : ""}
              </p>
            ) : null}
            {lunch.status === "released" && windowCopy ? (
              <p className="flex items-start gap-2">
                <LockIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  {windowCopy.title}.
                  {windowCopy.detail ? ` ${windowCopy.detail}` : ""}
                </span>
              </p>
            ) : lunch.signup_cutoff_at && lunch.status === "released" ? (
              <p className="flex items-center gap-2">
                <LockIcon className="size-4 shrink-0" />
                The list {cutoffPassed ? "closed on" : "closes at"}{" "}
                {fmtDateTime(lunch.signup_cutoff_at, ctx.club.timezone)}
              </p>
            ) : null}
            {lunch.status === "released" &&
            (lunch.signup_opens_at ||
              lunch.members_open_at ||
              lunch.guests_open_at) ? (
              <p className="text-xs text-muted-foreground">
                {[
                  lunch.signup_opens_at
                    ? `Committee ${fmtDateTime(lunch.signup_opens_at, ctx.club.timezone)}`
                    : null,
                  lunch.members_open_at
                    ? `Members ${fmtDateTime(lunch.members_open_at, ctx.club.timezone)}`
                    : null,
                  lunch.guests_open_at
                    ? `Guests ${fmtDateTime(lunch.guests_open_at, ctx.club.timezone)}`
                    : null,
                  lunch.signup_cutoff_at
                    ? `Cutoff ${fmtDateTime(lunch.signup_cutoff_at, ctx.club.timezone)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          {lunch.notes ? (
            <p className="max-w-prose text-sm whitespace-pre-line text-foreground/90">
              {lunch.notes}
            </p>
          ) : null}
        </div>

        {lunch.status !== "draft" ? (
          <Card className="shrink-0 gap-3 p-5 md:w-72">
            <SeatMeter
              taken={taken}
              capacity={lunch.capacity}
              waitlisted={waitlisted.length}
            />
            {overCapacity ? (
              <p className="text-xs font-medium text-destructive">
                Over capacity — resolve before the lunch.
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* Member sign-up */}
      {lunch.status === "released" ? (
        <SignupCard
          slug={slug}
          lunchId={lunch.id}
          guestsAllowed={policy.allowed}
          maxGuests={policy.maxPerMember}
          guestsOpenAt={
            lunch.guests_open_at
              ? fmtDateTime(lunch.guests_open_at, ctx.club.timezone)
              : null
          }
          seatsLeft={seatsLeft}
          cutoffPassed={cutoffPassed}
          phase={phase}
          phaseTitle={windowCopy?.title ?? null}
          phaseDetail={windowCopy?.detail ?? null}
          isCommittee={ctx.isCommittee}
          isNextOpenLunch={isNextOpenLunch || ctx.isCommittee}
          nextOpenHref={
            nextOpen && nextOpen.id !== lunch.id
              ? `/c/${slug}/lunches/${nextOpen.id}`
              : null
          }
          nextOpenTitle={nextOpen?.title ?? null}
          mySignup={
            mySignup
              ? {
                  status: mySignup.status,
                  guest_count: mySignup.guest_count,
                  guestNames: guestText(mySignup),
                }
              : null
          }
          myGuests={mySignup ? guestsOf(mySignup.id) : []}
          previousGuests={myPreviousGuests}
        />
      ) : null}

      {/* Who's coming */}
      {lunch.status !== "draft" ? (
        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Confirmed ({confirmed.length}
                {confirmed.some((s) => s.guest_count > 0) &&
                  ` + ${confirmed.reduce((n, s) => n + s.guest_count, 0)} guests`}
                )
              </CardTitle>
            </CardHeader>
            <CardContent>
              {confirmed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The list is empty.
                </p>
              ) : (
                <ul className="space-y-1">
                  {confirmed.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-primary/10 text-xs text-primary">
                            {initials(s.memberships?.full_name ?? "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {s.memberships?.full_name ?? "Unknown"}
                          </p>
                          {s.guest_count > 0 || s.added_by_committee ? (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              {s.guest_count > 0 ? (
                                <Badge variant="secondary" className="h-4">
                                  +{s.guest_count} guest
                                  {s.guest_count > 1 ? "s" : ""}
                                  {guestText(s) ? ` · ${guestText(s)}` : ""}
                                </Badge>
                              ) : null}
                              {s.added_by_committee ? (
                                <Badge variant="outline" className="h-4">
                                  added by committee
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {ctx.isCommittee && lunch.status === "released" ? (
                        <div className="flex shrink-0 gap-1">
                          <EditGuestsDialog
                            slug={slug}
                            lunchId={lunch.id}
                            signupId={s.id}
                            memberName={s.memberships?.full_name ?? "member"}
                            guests={guestsOf(s.id)}
                            options={previousByMember[s.membership_id] ?? []}
                            maxPerMember={policy.maxPerMember}
                            checksSeats
                          />
                          <form
                            action={committeeRemoveSignupAction.bind(
                              null,
                              slug,
                              lunch.id,
                              s.id
                            )}
                          >
                            <ConfirmSubmit
                              confirmTitle="Remove attendee?"
                              confirmMessage={`Remove ${s.memberships?.full_name} from this lunch? If it's full, the waitlist is promoted.`}
                              variant="destructive"
                              size="sm"
                            >
                              Remove
                            </ConfirmSubmit>
                          </form>
                        </div>
                      ) : null}
                      {ctx.isCommittee && lunch.status === "completed" ? (
                        <div className="flex shrink-0 gap-1">
                          <EditGuestsDialog
                            slug={slug}
                            lunchId={lunch.id}
                            signupId={s.id}
                            memberName={s.memberships?.full_name ?? "member"}
                            guests={guestsOf(s.id)}
                            options={previousByMember[s.membership_id] ?? []}
                            maxPerMember={policy.maxPerMember}
                            checksSeats={false}
                          />
                          <form
                            action={markAttendanceAction.bind(
                              null,
                              slug,
                              lunch.id,
                              s.id,
                              true
                            )}
                          >
                            <Button
                              type="submit"
                              variant={
                                s.attended === true ? "default" : "outline"
                              }
                              size="sm"
                            >
                              Present
                            </Button>
                          </form>
                          <form
                            action={markAttendanceAction.bind(
                              null,
                              slug,
                              lunch.id,
                              s.id,
                              false
                            )}
                          >
                            <Button
                              type="submit"
                              variant={
                                s.attended === false ? "destructive" : "outline"
                              }
                              size="sm"
                            >
                              No-show
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Waitlist ({waitlisted.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {waitlisted.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one waiting. Seats remain.
                </p>
              ) : (
                <ol className="space-y-1">
                  {waitlisted.map((s, i) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="truncate text-sm">
                          {s.memberships?.full_name ?? "Unknown"}
                          {s.guest_count > 0 ? (
                            <span className="text-muted-foreground">
                              {" "}
                              +{s.guest_count}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {ctx.isCommittee ? (
                        <div className="flex shrink-0 gap-1">
                          {lunch.status === "released" ? (
                            <EditGuestsDialog
                              slug={slug}
                              lunchId={lunch.id}
                              signupId={s.id}
                              memberName={s.memberships?.full_name ?? "member"}
                              guests={guestsOf(s.id)}
                              options={previousByMember[s.membership_id] ?? []}
                              maxPerMember={policy.maxPerMember}
                              checksSeats={false}
                            />
                          ) : null}
                          <form
                            action={committeeRemoveSignupAction.bind(
                              null,
                              slug,
                              lunch.id,
                              s.id
                            )}
                          >
                            <ConfirmSubmit
                              confirmTitle="Remove from waitlist?"
                              confirmMessage={`Remove ${s.memberships?.full_name} from the waitlist?`}
                              variant="destructive"
                              size="sm"
                            >
                              Remove
                            </ConfirmSubmit>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Committee control room */}
      {ctx.isCommittee ? (
        <section className="space-y-6">
          <Separator />
          <h2 className="text-h2 text-foreground">Committee</h2>

          {/* Action toolbar */}
          <div className="flex flex-wrap gap-2">
            {lunch.status === "draft" ? (
              <form action={releaseLunchAction.bind(null, slug, lunch.id)}>
                <ConfirmSubmit
                  confirmTitle="Release to members?"
                  confirmMessage="Members will see this lunch next time they log in (no email is sent)."
                  confirmLabel="Release"
                >
                  Release to members
                </ConfirmSubmit>
              </form>
            ) : null}
            <Button
              variant="outline"
              render={<Link href={`/c/${slug}/lunches/${lunch.id}/edit`} />}
            >
              <PencilIcon />
              Edit details
            </Button>
            {lunch.status === "released" ? (
              <form action={completeLunchAction.bind(null, slug, lunch.id)}>
                <ConfirmSubmit
                  confirmTitle="Mark completed?"
                  confirmMessage="You can then record attendance for this lunch."
                  confirmLabel="Mark completed"
                  variant="outline"
                >
                  Mark completed
                </ConfirmSubmit>
              </form>
            ) : null}
            {lunch.status === "draft" || lunch.status === "released" ? (
              <form action={cancelLunchAction.bind(null, slug, lunch.id)}>
                <ConfirmSubmit
                  confirmTitle="Cancel this lunch?"
                  confirmMessage="Everyone signed up or waitlisted will be emailed."
                  confirmLabel="Cancel lunch"
                  variant="destructive"
                >
                  Cancel lunch
                </ConfirmSubmit>
              </form>
            ) : null}
            {lunch.status === "draft" ? (
              <form action={deleteDraftLunchAction.bind(null, slug, lunch.id)}>
                <ConfirmSubmit
                  confirmTitle="Delete draft?"
                  confirmMessage="This permanently deletes the draft lunch."
                  confirmLabel="Delete draft"
                  variant="destructive"
                >
                  Delete draft
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>

          {/* Capacity & cutoff */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Capacity</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={setCapacityAction.bind(null, slug, lunch.id)}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="capacity">
                      Seats booked at the restaurant
                    </Label>
                    <Input
                      id="capacity"
                      name="capacity"
                      type="number"
                      min={0}
                      defaultValue={lunch.capacity}
                    />
                  </div>
                  <Button type="submit" variant="outline">
                    Update
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">
                  Raising it auto-promotes the waitlist (with emails). Lowering
                  it never bumps confirmed attendees — resolve overages by hand.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sign-up cutoff</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={setCutoffAction.bind(null, slug, lunch.id)}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="cutoffAt">
                      {cutoffPassed ? "Locked — move it to reopen" : "Locks at"}
                    </Label>
                    <Input
                      id="cutoffAt"
                      name="cutoffAt"
                      type="datetime-local"
                      defaultValue={toDatetimeLocalValue(
                        lunch.signup_cutoff_at,
                        ctx.club.timezone
                      )}
                    />
                  </div>
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">
                  Clear it to leave sign-ups open until the lunch. Times are
                  in {ctx.club.timezone}.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Manually add a member */}
          {(lunch.status === "draft" || lunch.status === "released") &&
          addable.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Manually add a member</CardTitle>
              </CardHeader>
              <CardContent>
                <CommitteeAddForm
                  slug={slug}
                  lunchId={lunch.id}
                  members={addable.map((m) => ({
                    id: m.id,
                    label: m.full_name || m.email,
                  }))}
                  previousGuests={previousByMember}
                />
              </CardContent>
            </Card>
          ) : null}

          {/* Restaurant list */}
          <Card>
            <CardHeader>
              <CardTitle>Restaurant list and dietary notes</CardTitle>
              {confirmed.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <CopyButton
                    text={restaurantList}
                    label="Copy for the restaurant"
                  />
                  <a
                    href={`/c/${slug}/lunches/${lunch.id}/restaurant-list`}
                    download
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <DownloadIcon />
                    Download PDF
                  </a>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {confirmed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No confirmed attendees yet.
                </p>
              ) : (
                <pre className="overflow-x-auto rounded-xl border border-border bg-muted p-4 font-mono text-xs whitespace-pre-wrap text-foreground/90">
                  {restaurantList}
                </pre>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
