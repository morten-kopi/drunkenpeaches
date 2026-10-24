import { z } from "zod";
import type { LunchGuest } from "@/lib/types";

/** One guest as the guest picker sends it: someone on file, or someone new. */
export type GuestEntry =
  | { id: string }
  | { first_name: string; last_name: string; email: string; dietary_notes?: string };

const newGuest = z.object({
  first_name: z.string().trim().min(1, "Each guest needs a first name").max(80),
  last_name: z.string().trim().min(1, "Each guest needs a last name").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email for each guest"),
  dietary_notes: z.string().trim().max(500).optional(),
});

const entries = z.array(z.union([z.object({ id: z.uuid() }), newGuest])).max(20);

/** The picker's hidden "guests" field. Missing means no guests. */
export function parseGuests(formData: FormData, field = "guests"): GuestEntry[] {
  const raw = formData.get(field);
  if (raw == null || raw === "") return [];
  let json: unknown;
  try {
    json = JSON.parse(String(raw));
  } catch {
    throw new Error("Invalid guest list");
  }
  const parsed = entries.safeParse(json);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return parsed.data;
}

/** lunch_guests() rows grouped by signup, in the order they were added. */
export function guestsBySignup(rows: LunchGuest[] | null) {
  const map = new Map<string, LunchGuest[]>();
  for (const g of rows ?? []) {
    map.set(g.signup_id, [...(map.get(g.signup_id) ?? []), g]);
  }
  return map;
}

/** "Jane Doe, Tom Lee", or null without guests. */
export function guestNames(guests: Pick<LunchGuest, "full_name">[] | undefined) {
  return guests?.length ? guests.map((g) => g.full_name).join(", ") : null;
}
