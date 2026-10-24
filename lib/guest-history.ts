import type { createClient } from "@/lib/supabase/server";
import type { AttendanceItem } from "@/components/attendance-history";
import { fetchAll } from "@/lib/fetch-all";
import type { LunchStatus, SignupStatus } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One time a guest was on a member's signup. */
export type GuestAppearance = {
  id: string;
  guest_id: string;
  signups: {
    status: SignupStatus;
    attended: boolean | null;
    memberships: { full_name: string } | null;
    lunches: { id: string; title: string; lunch_date: string; status: LunchStatus } | null;
  } | null;
};

/**
 * Every lunch the given guests were brought to, cancelled places left out.
 * Committee only: reads the guest tables directly.
 */
export async function guestAppearances(
  supabase: Supabase,
  clubId: string,
  guestIds?: string[]
): Promise<GuestAppearance[]> {
  if (guestIds && guestIds.length === 0) return [];
  const rows = await fetchAll<GuestAppearance>((from, to) => {
    let q = supabase
      .from("signup_guests")
      .select(
        "id, guest_id, signups(status, attended, memberships(full_name), lunches(id, title, lunch_date, status))"
      )
      .eq("club_id", clubId);
    if (guestIds) q = q.in("guest_id", guestIds);
    return q.order("id").range(from, to);
  });
  return rows.filter((r) => r.signups?.lunches && r.signups.status !== "cancelled");
}

/** A past lunch the guest came to: confirmed, held, and not marked a no-show. */
export function attended(a: GuestAppearance, today: string) {
  const s = a.signups!;
  return (
    s.status === "confirmed" &&
    s.lunches!.status !== "cancelled" &&
    s.lunches!.lunch_date < today &&
    s.attended !== false
  );
}

/** Appearances as timeline items, noting who brought the guest. */
export function appearanceItems(rows: GuestAppearance[], slug: string): AttendanceItem[] {
  return rows.map((r) => ({
    id: r.id,
    date: r.signups!.lunches!.lunch_date,
    title: r.signups!.lunches!.title,
    status: r.signups!.status,
    attended: r.signups!.attended,
    note: `guest of ${r.signups!.memberships?.full_name ?? "a member"}`,
    href: `/c/${slug}/lunches/${r.signups!.lunches!.id}`,
  }));
}
