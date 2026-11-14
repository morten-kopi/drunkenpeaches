import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMembersOpenNow, type EmailLunch, type Moment } from "@/lib/email";
import { dateInZone, fmtDateShort, fmtDateTime } from "@/lib/format";
import { guestPolicy, type Lunch } from "@/lib/types";

export const dynamic = "force-dynamic";

type LunchRow = Lunch & {
  clubs: { name: string; slug: string; timezone: string } | null;
  venues: { name: string; address: string | null } | null;
};

type MemberRow = { id: string; email: string; first_name: string; full_name: string };

/** A late email is no longer a starting signal; after this it is dropped. */
const GRACE_MS = 60 * 60 * 1000;

/**
 * The "sign-ups now open" email, sent when a released lunch's member
 * registration opens (members_open_at), once, marked by
 * members_open_now_sent_at. Goes to every active member without a
 * confirmed or waitlisted seat, so the committee members who signed up in
 * their own window are left out.
 *
 * Called every minute by a pg_cron job in the database (migration 00011),
 * which only calls when a lunch is due. Each lunch found is marked even when
 * it is skipped, so the job stops calling. Skipped: sign-ups already closed,
 * or the lunch released after member sign-ups opened (no email on release).
 * An email Resend refuses outright is unmarked and retried within the hour.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data, error } = await admin
    .from("lunches")
    .select("*, clubs(name, slug, timezone), venues(name, address)")
    .eq("status", "released")
    .is("members_open_now_sent_at", null)
    .lte("members_open_at", now.toISOString())
    .gt("members_open_at", new Date(now.getTime() - GRACE_MS).toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const lunch of (data ?? []) as LunchRow[]) {
    if (!lunch.clubs || !lunch.members_open_at) continue;
    const club = lunch.clubs;
    const opensAt = lunch.members_open_at;

    // Mark first, then send, so overlapping runs never send twice.
    const { data: claimed } = await admin
      .from("lunches")
      .update({ members_open_now_sent_at: now.toISOString() })
      .eq("id", lunch.id)
      .is("members_open_now_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const closed =
      lunch.signup_cutoff_at != null && new Date(lunch.signup_cutoff_at) <= now;
    const releasedAfter =
      lunch.released_at != null && new Date(lunch.released_at) > new Date(opensAt);
    if (closed || releasedAfter) {
      skipped.push(lunch.id);
      continue;
    }

    const [{ data: members }, { data: signups }] = await Promise.all([
      admin
        .from("memberships")
        .select("id, email, first_name, full_name")
        .eq("club_id", lunch.club_id)
        .eq("status", "active"),
      admin
        .from("signups")
        .select("membership_id")
        .eq("lunch_id", lunch.id)
        .in("status", ["confirmed", "waitlisted"]),
    ]);
    const signedUp = new Set((signups ?? []).map((s) => s.membership_id as string));
    const recipients = ((members ?? []) as MemberRow[])
      .filter((m) => !signedUp.has(m.id))
      .map((m) => ({ email: m.email, name: m.first_name || m.full_name }));

    const timeZone = club.timezone;
    const moment = (iso: string): Moment => ({
      day: fmtDateShort(dateInZone(iso, timeZone)),
      at: fmtDateTime(iso, timeZone),
    });
    const later = (a: string | null, b: string | null) =>
      a != null && b != null && new Date(a) > new Date(b);
    const info: EmailLunch = {
      id: lunch.id,
      clubSlug: club.slug,
      title: lunch.title,
      lunchDate: lunch.lunch_date,
      startTime: lunch.start_time,
      venueName: lunch.venues?.name ?? null,
      venueAddress: lunch.venues?.address ?? null,
    };
    const policy = guestPolicy(lunch);

    const delivered = await sendMembersOpenNow({
      recipients,
      club: { id: lunch.club_id, name: club.name },
      lunch: info,
      opens: moment(opensAt),
      guests: policy.allowed
        ? {
            maxPerMember: policy.maxPerMember,
            opens: later(lunch.guests_open_at, opensAt) ? moment(lunch.guests_open_at!) : null,
          }
        : null,
    });
    if (delivered) {
      sent.push(lunch.id);
    } else {
      // Resend took none of them: unmark, so the next run tries again.
      failed.push(lunch.id);
      await admin.from("lunches").update({ members_open_now_sent_at: null }).eq("id", lunch.id);
    }
  }

  return NextResponse.json({ lunches: data?.length ?? 0, sent, skipped, failed });
}
