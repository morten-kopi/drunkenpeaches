import { notFound } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, slugify } from "@/lib/format";
import { restaurantRows, type RestaurantSignup } from "@/lib/restaurant-list";
import { restaurantListPdf } from "@/lib/restaurant-list-pdf";
import { guestsBySignup } from "@/lib/guests";
import type { Lunch, LunchGuest } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Committee only: the restaurant list as a PDF download. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ club: string; id: string }> }
) {
  const { club: slug, id } = await params;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();
  const supabase = await createClient();

  const { data: lunchData } = await supabase
    .from("lunches")
    .select("title, lunch_date, start_time, venues(name)")
    .eq("id", id)
    .eq("club_id", ctx.club.id)
    .single();
  if (!lunchData) notFound();
  const lunch = lunchData as unknown as Pick<
    Lunch,
    "title" | "lunch_date" | "start_time"
  > & { venues: { name: string } | null };

  const { data: signupData } = await supabase
    .from("signups")
    .select("id, guest_count, memberships(full_name, dietary_notes)")
    .eq("lunch_id", id)
    .eq("status", "confirmed")
    .order("created_at");
  const { data: guestData } = await supabase.rpc("lunch_guests", { p_lunch: id });
  const guests = guestsBySignup(guestData as LunchGuest[] | null);
  const rows = restaurantRows(
    ((signupData ?? []) as unknown as (RestaurantSignup & { id: string })[]).map((s) => ({
      ...s,
      guests: guests.get(s.id),
    }))
  );

  const pdf = await restaurantListPdf({
    clubName: ctx.club.name,
    lunch: { ...lunch, venueName: lunch.venues?.name ?? null },
    rows,
    generatedAt: fmtDateTime(new Date().toISOString(), ctx.club.timezone),
  });

  const filename = `${slugify(lunch.title) || "lunch"}-${lunch.lunch_date}-restaurant-list.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
