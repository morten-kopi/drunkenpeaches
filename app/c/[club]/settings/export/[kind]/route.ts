import { notFound } from "next/navigation";
import { getClubContext, type ClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { todayInZone, fmtTime } from "@/lib/format";
import { csvResponse, sheetDateTime, toCsv, type CsvCell } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";
import { attended, guestAppearances } from "@/lib/guest-history";
import type { Guest, Lunch, Membership, Signup, Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Export = { headers: string[]; rows: CsvCell[][] };

const EXPORTS: Record<string, (s: Supabase, ctx: ClubContext) => Promise<Export>> = {
  members: membersCsv,
  guests: guestsCsv,
  venues: venuesCsv,
  lunches: lunchesCsv,
  attendance: attendanceCsv,
};

/** Committee only: one of the club's lists as a CSV download. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ club: string; kind: string }> }
) {
  const { club: slug, kind } = await params;
  const build = EXPORTS[kind];
  if (!build) notFound();
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const { headers, rows } = await build(supabase, ctx);
  const date = todayInZone(ctx.club.timezone);
  return csvResponse(`${slug}-${kind}-${date}.csv`, toCsv(headers, rows));
}

async function membersCsv(supabase: Supabase, { club }: ClubContext): Promise<Export> {
  const members = await fetchAll<Membership>((from, to) =>
    supabase
      .from("memberships")
      .select("*")
      .eq("club_id", club.id)
      .order("last_name")
      .order("first_name")
      .order("id")
      .range(from, to)
  );
  return {
    headers: [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "Role",
      "Status",
      "Function",
      "Dietary notes",
      "Joined on",
      "Comments",
    ],
    rows: members.map((m) => [
      m.first_name,
      m.last_name,
      m.email,
      m.phone,
      m.role,
      m.status,
      m.function,
      m.dietary_notes,
      m.joined_on,
      m.comments,
    ]),
  };
}

async function guestsCsv(supabase: Supabase, { club }: ClubContext): Promise<Export> {
  const guests = await fetchAll<Guest>((from, to) =>
    supabase
      .from("guests")
      .select("*")
      .eq("club_id", club.id)
      .order("last_name")
      .order("first_name")
      .order("id")
      .range(from, to)
  );
  const today = todayInZone(club.timezone);
  const byGuest = new Map<string, { count: number; last: string | null; hosts: Set<string> }>();
  for (const a of await guestAppearances(supabase, club.id)) {
    const e = byGuest.get(a.guest_id) ?? { count: 0, last: null, hosts: new Set<string>() };
    if (a.signups?.memberships) e.hosts.add(a.signups.memberships.full_name);
    if (attended(a, today)) {
      e.count += 1;
      const date = a.signups!.lunches!.lunch_date;
      if (!e.last || date > e.last) e.last = date;
    }
    byGuest.set(a.guest_id, e);
  }
  return {
    headers: [
      "First name",
      "Last name",
      "Email",
      "Dietary notes",
      "Lunches attended",
      "Last lunch",
      "Brought by",
      "Became a member",
    ],
    rows: guests.map((g) => {
      const e = byGuest.get(g.id);
      return [
        g.first_name,
        g.last_name,
        g.email,
        g.dietary_notes,
        e?.count ?? 0,
        e?.last,
        [...(e?.hosts ?? [])].sort().join(", "),
        g.upgraded_at ? sheetDateTime(g.upgraded_at, club.timezone).slice(0, 10) : "",
      ];
    }),
  };
}

async function venuesCsv(supabase: Supabase, { club }: ClubContext): Promise<Export> {
  const venues = await fetchAll<Venue>((from, to) =>
    supabase
      .from("venues")
      .select("*")
      .eq("club_id", club.id)
      .order("name")
      .order("id")
      .range(from, to)
  );
  return {
    headers: ["Name", "Address", "Contact", "Room capacity", "Status", "Notes"],
    rows: venues.map((v) => [
      v.name,
      v.address,
      v.contact,
      v.default_capacity,
      v.status,
      v.notes,
    ]),
  };
}

type LunchRow = Lunch & {
  venues: { name: string } | null;
  signups: Pick<Signup, "status" | "guest_count">[];
};

async function lunchesCsv(supabase: Supabase, { club }: ClubContext): Promise<Export> {
  const lunches = await fetchAll<LunchRow>((from, to) =>
    supabase
      .from("lunches")
      .select("*, venues(name), signups(status, guest_count)")
      .eq("club_id", club.id)
      .order("lunch_date")
      .order("start_time")
      .order("id")
      .range(from, to)
  );
  const at = (iso: string | null) => sheetDateTime(iso, club.timezone);
  return {
    headers: [
      "Date",
      "Start",
      "Title",
      "Venue",
      "Status",
      "Capacity",
      "Confirmed members",
      "Confirmed guests",
      "Seats taken",
      "Waitlisted",
      "Guests allowed",
      "Max guests per member",
      "Committee opens",
      "Members open",
      "Guests open",
      "Cutoff",
      "Notes",
    ],
    rows: lunches.map((l) => {
      const confirmed = l.signups.filter((s) => s.status === "confirmed");
      const guests = confirmed.reduce((n, s) => n + s.guest_count, 0);
      return [
        l.lunch_date,
        fmtTime(l.start_time),
        l.title,
        l.venues?.name,
        l.status,
        l.capacity,
        confirmed.length,
        guests,
        confirmed.length + guests,
        l.signups.filter((s) => s.status === "waitlisted").length,
        l.guests_allowed === true,
        l.guests_allowed ? l.max_guests_per_member : null,
        at(l.signup_opens_at),
        at(l.members_open_at),
        at(l.guests_open_at),
        at(l.signup_cutoff_at),
        l.notes,
      ];
    }),
  };
}

type AttendanceRow = Pick<
  Signup,
  "id" | "status" | "guest_count" | "attended" | "added_by_committee" | "created_at"
> & {
  lunches: Pick<Lunch, "lunch_date" | "start_time" | "title" | "status"> & {
    venues: { name: string } | null;
  };
  memberships: Pick<Membership, "first_name" | "last_name" | "full_name" | "email"> | null;
  signup_guests: { guests: Pick<Guest, "first_name" | "last_name" | "email"> | null }[];
};

/**
 * One row per person per lunch, members and guests, cancelled places left
 * out. A guest's place and attendance are their host's.
 */
async function attendanceCsv(supabase: Supabase, { club }: ClubContext): Promise<Export> {
  const signups = await fetchAll<AttendanceRow>((from, to) =>
    supabase
      .from("signups")
      .select(
        "id, status, guest_count, attended, added_by_committee, created_at, lunches(lunch_date, start_time, title, status, venues(name)), memberships(first_name, last_name, full_name, email), signup_guests(guests(first_name, last_name, email))"
      )
      .eq("club_id", club.id)
      .neq("status", "cancelled")
      .order("created_at")
      .order("id")
      .range(from, to)
  );
  signups.sort(
    (a, b) =>
      a.lunches.lunch_date.localeCompare(b.lunches.lunch_date) ||
      a.lunches.start_time.localeCompare(b.lunches.start_time) ||
      a.created_at.localeCompare(b.created_at)
  );
  return {
    headers: [
      "Lunch date",
      "Lunch",
      "Venue",
      "First name",
      "Last name",
      "Email",
      "Type",
      "Brought by",
      "Place",
      "Guests",
      "Added by committee",
      "Attended",
    ],
    rows: signups.flatMap((s) => {
      const lunch = [s.lunches.lunch_date, s.lunches.title, s.lunches.venues?.name];
      const came = s.attended == null ? "" : s.attended;
      return [
        [
          ...lunch,
          s.memberships?.first_name,
          s.memberships?.last_name,
          s.memberships?.email,
          "Member",
          "",
          s.status,
          s.guest_count,
          s.added_by_committee,
          came,
        ],
        ...s.signup_guests.flatMap(({ guests: g }) =>
          g
            ? [[...lunch, g.first_name, g.last_name, g.email, "Guest", s.memberships?.full_name, s.status, "", "", came]]
            : []
        ),
      ];
    }),
  };
}
