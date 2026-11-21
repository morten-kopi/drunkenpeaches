import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendCommitteeOpensReminder,
  sendGuestsOpenReminder,
  sendLunchReminder,
  sendMembersOpenReminder,
  sendQuestionnaireRequest,
  type Moment,
  type Recipient,
  type EmailLunch,
} from "@/lib/email";
import { dateInZone, fmtDateShort, fmtDateTime, todayInZone } from "@/lib/format";
import { addClubDays, lunchStartAt } from "@/lib/signup-phases";
import { guestPolicy, seatsTaken, type Lunch, type Signup } from "@/lib/types";
import { guestNames } from "@/lib/guests";
import {
  QUESTIONNAIRE_EMAIL_DAYS,
  mayAnswer,
  questionnaireEmailWindow,
} from "@/lib/questionnaire";

export const dynamic = "force-dynamic";

type LunchRow = Lunch & {
  clubs: { name: string; slug: string; timezone: string } | null;
  venues: { name: string; address: string | null } | null;
};

type MemberRow = {
  email: string;
  first_name: string;
  full_name: string;
  role: string;
};

type ReminderColumn =
  | "committee_reminder_sent_at"
  | "members_reminder_sent_at"
  | "guests_reminder_sent_at"
  | "reminder_sent_at"
  | "questionnaire_email_sent_at";

const toRecipient = (m: Pick<MemberRow, "email" | "first_name" | "full_name">) => ({
  email: m.email,
  name: m.first_name || m.full_name,
});

const emailLunchOf = (lunch: LunchRow, clubSlug: string): EmailLunch => ({
  id: lunch.id,
  clubSlug,
  title: lunch.title,
  lunchDate: lunch.lunch_date,
  startTime: lunch.start_time,
  venueName: lunch.venues?.name ?? null,
  venueAddress: lunch.venues?.address ?? null,
});

/**
 * Daily Vercel Cron (see vercel.json), cross-tenant with the service role.
 * Sends four reminders per released lunch, each on the day before (club
 * time) and each once, marked by its *_sent_at column:
 * - committee registration opens: committee only
 * - member registration opens: every active member
 * - guest registration opens: every active member, if the lunch takes
 *   guests and seats are free
 * - the lunch itself: everyone confirmed
 * and, the morning after a lunch with the questionnaire on, the questionnaire
 * to everyone who had a seat and hasn't answered yet.
 * A run that misses the day before still sends on the day, until the moment
 * itself has passed. A reminder Resend refuses outright is retried the same way.
 * The member reminder is the exception: it says "tomorrow", so it goes only on
 * the day before, and the "sign-ups now open" email (/api/cron/open) covers
 * the day itself.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // Two days back in UTC covers every zone's "today"; each lunch is checked
  // on its own club's clock below.
  const { data, error } = await admin
    .from("lunches")
    .select("*, clubs(name, slug, timezone), venues(name, address)")
    .eq("status", "released")
    .gte("lunch_date", dateInZone(addClubDays(now, -2, "UTC"), "UTC"));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const membersByClub = new Map<string, MemberRow[]>();
  async function activeMembers(clubId: string) {
    if (!membersByClub.has(clubId)) {
      const { data: rows } = await admin
        .from("memberships")
        .select("email, first_name, full_name, role")
        .eq("club_id", clubId)
        .eq("status", "active");
      membersByClub.set(clubId, (rows ?? []) as MemberRow[]);
    }
    return membersByClub.get(clubId)!;
  }

  const sent: string[] = [];
  const failed: string[] = [];

  // Mark first, then send, so overlapping runs never send twice.
  async function claimFor(lunch: LunchRow, column: ReminderColumn) {
    if (lunch[column]) return false;
    const { data: rows } = await admin
      .from("lunches")
      .update({ [column]: now.toISOString() })
      .eq("id", lunch.id)
      .is(column, null)
      .select("id");
    return !!rows?.length;
  }
  // Resend took none of them (e.g. no verified domain yet): try tomorrow.
  async function settleFor(lunch: LunchRow, column: ReminderColumn, delivered: boolean) {
    if (delivered) {
      sent.push(`${lunch.id}:${column}`);
      return;
    }
    failed.push(`${lunch.id}:${column}`);
    await admin.from("lunches").update({ [column]: null }).eq("id", lunch.id);
  }

  for (const lunch of (data ?? []) as LunchRow[]) {
    if (!lunch.clubs) continue;
    const club = lunch.clubs;
    const timeZone = club.timezone;
    const today = todayInZone(timeZone, now);

    const moment = (iso: string): Moment => ({
      day: fmtDateShort(dateInZone(iso, timeZone)),
      at: fmtDateTime(iso, timeZone),
    });
    // Due from the day before (club time) until the moment itself.
    const due = (iso: string | null): iso is string =>
      iso != null &&
      now < new Date(iso) &&
      today >= dateInZone(addClubDays(iso, -1, timeZone), timeZone);
    const dayBefore = (iso: string | null): iso is string =>
      due(iso) && today === dateInZone(addClubDays(iso, -1, timeZone), timeZone);
    const later = (a: string | null, b: string | null) =>
      a != null && b != null && new Date(a) > new Date(b);

    const claim = (column: ReminderColumn) => claimFor(lunch, column);
    const settle = (column: ReminderColumn, delivered: boolean) =>
      settleFor(lunch, column, delivered);

    const emailClub = { id: lunch.club_id, name: club.name };
    const info = emailLunchOf(lunch, club.slug);
    const policy = guestPolicy(lunch);

    // Skipped when the committee window is empty: the members email covers it.
    if (
      due(lunch.signup_opens_at) &&
      (lunch.members_open_at == null ||
        later(lunch.members_open_at, lunch.signup_opens_at)) &&
      (await claim("committee_reminder_sent_at"))
    ) {
      const members = await activeMembers(lunch.club_id);
      await settle("committee_reminder_sent_at", await sendCommitteeOpensReminder({
        recipients: members.filter((m) => m.role === "committee").map(toRecipient),
        club: emailClub,
        lunch: info,
        opens: moment(lunch.signup_opens_at),
        membersOpen: lunch.members_open_at ? moment(lunch.members_open_at) : null,
      }));
    }

    if (dayBefore(lunch.members_open_at) && (await claim("members_reminder_sent_at"))) {
      const members = await activeMembers(lunch.club_id);
      await settle("members_reminder_sent_at", await sendMembersOpenReminder({
        recipients: members.map(toRecipient),
        club: emailClub,
        lunch: info,
        opens: moment(lunch.members_open_at),
        guests: policy.allowed
          ? {
              maxPerMember: policy.maxPerMember,
              opens: later(lunch.guests_open_at, lunch.members_open_at)
                ? moment(lunch.guests_open_at!)
                : null,
            }
          : null,
      }));
    }

    // Only when guests come after members (else the members email covers it)
    // and before the cutoff. A full lunch is checked again on the next run.
    if (
      policy.allowed &&
      due(lunch.guests_open_at) &&
      later(lunch.guests_open_at, lunch.members_open_at) &&
      (lunch.signup_cutoff_at == null ||
        later(lunch.signup_cutoff_at, lunch.guests_open_at))
    ) {
      const { data: signups } = await admin
        .from("signups")
        .select("status, guest_count")
        .eq("lunch_id", lunch.id);
      const seatsLeft =
        lunch.capacity -
        seatsTaken((signups ?? []) as Pick<Signup, "status" | "guest_count">[]);
      if (seatsLeft > 0 && (await claim("guests_reminder_sent_at"))) {
        const members = await activeMembers(lunch.club_id);
        await settle("guests_reminder_sent_at", await sendGuestsOpenReminder({
          recipients: members.map(toRecipient),
          club: emailClub,
          lunch: info,
          opens: moment(lunch.guests_open_at),
          maxPerMember: policy.maxPerMember,
          seatsLeft,
        }));
      }
    }

    const startsAt = lunchStartAt(lunch.lunch_date, lunch.start_time, timeZone);
    if (due(startsAt.toISOString()) && (await claim("reminder_sent_at"))) {
      const { data: attendees } = await admin
        .from("signups")
        .select(
          "guest_count, memberships(email, first_name, full_name), signup_guests(guests(full_name))"
        )
        .eq("lunch_id", lunch.id)
        .eq("status", "confirmed");
      const recipients = (attendees ?? []).flatMap((a) => {
        const m = a.memberships as unknown as MemberRow | null;
        if (!m) return [];
        const guests = (
          a.signup_guests as unknown as { guests: { full_name: string } | null }[]
        ).flatMap((sg) => (sg.guests ? [sg.guests] : []));
        return [
          {
            ...toRecipient(m),
            guestCount: a.guest_count as number,
            guestNames: guestNames(guests),
          } satisfies Recipient & { guestCount: number; guestNames: string | null },
        ];
      });
      await settle(
        "reminder_sent_at",
        await sendLunchReminder({ recipients, club: emailClub, lunch: info })
      );
    }
  }

  // The questionnaire, the morning after the lunch, for up to a week if
  // Resend refuses it. The lunch may be marked completed by then.
  const { data: past, error: pastError } = await admin
    .from("lunches")
    .select("*, clubs(name, slug, timezone), venues(name, address)")
    .in("status", ["released", "completed"])
    .eq("questionnaire_enabled", true)
    .is("questionnaire_email_sent_at", null)
    .gte(
      "lunch_date",
      dateInZone(addClubDays(now, -(QUESTIONNAIRE_EMAIL_DAYS + 2), "UTC"), "UTC")
    )
    .lte("lunch_date", dateInZone(now, "UTC"));
  if (pastError) {
    return NextResponse.json({ error: pastError.message }, { status: 500 });
  }
  for (const lunch of (past ?? []) as LunchRow[]) {
    if (!lunch.clubs) continue;
    if (questionnaireEmailWindow(lunch, lunch.clubs.timezone, now) !== "due") continue;
    if (!(await claimFor(lunch, "questionnaire_email_sent_at"))) continue;

    const [{ data: seats }, { data: answered }] = await Promise.all([
      admin
        .from("signups")
        .select("status, attended, membership_id, memberships(email, first_name, full_name, status)")
        .eq("lunch_id", lunch.id)
        .eq("status", "confirmed"),
      admin.from("questionnaire_responses").select("membership_id").eq("lunch_id", lunch.id),
    ]);
    const done = new Set((answered ?? []).map((a) => a.membership_id as string));
    const recipients = (seats ?? []).flatMap((s) => {
      const m = s.memberships as unknown as (MemberRow & { status: string }) | null;
      if (!m || m.status !== "active" || !mayAnswer(s) || done.has(s.membership_id)) {
        return [];
      }
      return [toRecipient(m)];
    });
    await settleFor(
      lunch,
      "questionnaire_email_sent_at",
      await sendQuestionnaireRequest({
        recipients,
        club: { id: lunch.club_id, name: lunch.clubs.name },
        lunch: emailLunchOf(lunch, lunch.clubs.slug),
      })
    );
  }

  return NextResponse.json({
    lunches: (data?.length ?? 0) + (past?.length ?? 0),
    sent,
    failed,
  });
}
