import { fmtDate, fmtTime } from "@/lib/format";
import type { Lunch, Membership, Signup } from "@/lib/types";

/** A confirmed sign-up with the member fields the restaurant needs. */
export type RestaurantSignup = Pick<Signup, "guest_count" | "guest_names"> & {
  memberships: Pick<Membership, "full_name" | "dietary_notes"> | null;
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
};

/** Confirmed members in sign-up order. */
export function restaurantRows(confirmed: RestaurantSignup[]): RestaurantRow[] {
  return confirmed.map((s) => ({
    name: s.memberships?.full_name || "Unknown",
    guests: s.guest_count,
    guestNames: s.guest_names?.trim() || null,
    dietary: s.memberships?.dietary_notes?.trim() || null,
  }));
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
  const dietary = rows.filter((r) => r.dietary);
  return [
    lunch.title,
    lunchWhenWhere(lunch),
    `Final headcount: ${headcount(rows)}`,
    "",
    ...rows.map((r) => [r.name, guestLabel(r)].filter(Boolean).join(" ")),
    ...(dietary.length
      ? ["", "Dietary:", ...dietary.map((r) => `- ${r.name}: ${r.dietary}`)]
      : []),
  ].join("\n");
}
