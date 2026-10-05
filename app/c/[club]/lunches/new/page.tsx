import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { LunchForm } from "../lunch-form";
import { PageHeader } from "@/components/page-header";
import type { Venue } from "@/lib/types";

export const metadata: Metadata = { title: "New lunch" };

export default async function NewLunchPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ venue?: string }>;
}) {
  const { club: slug } = await params;
  const { venue: initialVenueId } = await searchParams;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, default_capacity")
    .eq("club_id", ctx.club.id)
    .neq("status", "archived")
    .order("name");

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Committee"
        title="Arrange a lunch"
        description="Book the restaurant first. Capacity is taken from that booking."
      />
      <LunchForm
        slug={slug}
        club={ctx.club}
        venues={(venues ?? []) as Pick<Venue, "id" | "name" | "default_capacity">[]}
        initialVenueId={initialVenueId}
      />
    </div>
  );
}
