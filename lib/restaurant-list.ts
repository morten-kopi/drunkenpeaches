import { fmtDate, fmtTime } from "@/lib/format";
import { guestNames } from "@/lib/guests";
import type { Guest, Lunch, Membership, Signup } from "@/lib/types";

type GuestFields = Pick<Guest, "full_name" | "dietary_notes">;

/** A confirmed sign-up with the member and guest fields the restaurant needs. */
export type RestaurantSignup = Pick<Signup, "guest_count"> & {
  memberships: Pick<Membership, "full_name" | "dietary_notes"> | null;
  guests?: GuestFields[];
};

export type RestaurantLunch = Pick<
  Lunch,
  "title" | "lunch_date" | "start_time"
> & {
  venueName: string | null;
};

export type RestaurantRow = {
  name: string;
  guests: number;
  guestNames: string | null;
  dietary: string | null;
  /** Guests of this member who have dietary notes. */
  guestDietary: { name: string; notes: string }[];
};

/** Confirmed members in sign-up order. */
export function restaurantRows(confirmed: RestaurantSignup[]): RestaurantRow[] {
  return confirmed.map((s) => ({
    name: s.memberships?.full_name || "Unknown",
    guests: s.guest_count,
    guestNames: guestNames(s.guests),
    dietary: s.memberships?.dietary_notes?.trim() || null,
    guestDietary: (s.guests ?? [])
      .filter((g) => g.dietary_notes?.trim())
      .map((g) => ({ name: g.full_name, notes: g.dietary_notes!.trim() })),
  }));
}

/** The member's notes and their guests' notes, in one line for the PDF. */
export function dietaryLine(row: RestaurantRow) {
  return [row.dietary, ...row.guestDietary.map((g) => `${g.name}: ${g.notes}`)]
    .filter(Boolean)
    .join("; ");
}

/** Seats needed: each member plus their guests. */
export function headcount(rows: RestaurantRow[]) {
  return rows.reduce((n, r) => n + 1 + r.guests, 0);
}

/** "+1 guest (Jane Doe)", or "" without guests. */
export function guestLabel(row: RestaurantRow) {
  if (row.guests === 0) return "";
  const noun = row.guests > 1 ? "guests" : "guest";
  return `+${row.guests} ${noun}${row.guestNames ? ` (${row.guestNames})` : ""}`;
}

/** "Friday 30 October 2026 at 12:15, OSO" */
export function lunchWhenWhere(lunch: RestaurantLunch) {
  const when = `${fmtDate(lunch.lunch_date)} at ${fmtTime(lunch.start_time)}`;
  return lunch.venueName ? `${when}, ${lunch.venueName}` : when;
}

/** Plain text to paste into an email or message to the restaurant. */
export function restaurantListText(
  lunch: RestaurantLunch,
  rows: RestaurantRow[]
) {
  const dietary = rows.flatMap((r) => [
    ...(r.dietary ? [`- ${r.name}: ${r.dietary}`] : []),
    ...r.guestDietary.map((g) => `- ${g.name} (guest of ${r.name}): ${g.notes}`),
  ]);
  return [
    lunch.title,
    lunchWhenWhere(lunch),
    `Final headcount: ${headcount(rows)}`,
    "",
    ...rows.map((r) => [r.name, guestLabel(r)].filter(Boolean).join(" ")),
    ...(dietary.length ? ["", "Dietary:", ...dietary] : []),
  ].join("\n");
}
