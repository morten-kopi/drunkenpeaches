import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPinIcon, PhoneIcon, Trash2Icon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDateShort } from "@/lib/format";
import type { Venue } from "@/lib/types";
import { deleteVenueAction, restoreVenueAction } from "@/app/actions/venues";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { VenueForm } from "../venue-form";

export const metadata: Metadata = { title: "Venue" };

export default async function VenueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug, id } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const [{ data: venueData }, { data: lunchData }] = await Promise.all([
    supabase
      .from("venues")
      .select("*")
      .eq("id", id)
      .eq("club_id", ctx.club.id)
      .single(),
    supabase
      .from("lunches")
      .select("id, title, lunch_date, status")
      .eq("venue_id", id)
      .order("lunch_date", { ascending: false }),
  ]);
  if (!venueData) notFound();
  const venue = venueData as Venue;
  const archived = venue.status === "archived";
  const lunches = (lunchData ?? []) as {
    id: string;
    title: string;
    lunch_date: string;
    status: string;
  }[];

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 text-foreground">{venue.name}</h1>
            {archived ? <StatusBadge status="archived" /> : null}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            {venue.address ? (
              <p className="flex items-center gap-2">
                <MapPinIcon className="size-4 shrink-0" />
                {venue.address}
              </p>
            ) : null}
            {venue.contact ? (
              <p className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0" />
                {venue.contact}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {archived ? (
            <form action={restoreVenueAction.bind(null, slug, venue.id)}>
              <Button type="submit" variant="outline">
                Restore venue
              </Button>
            </form>
          ) : (
            <Button
              render={
                <Link href={`/c/${slug}/lunches/new?venue=${venue.id}`} />
              }
            >
              Book a lunch here
            </Button>
          )}
        </div>
      </div>

      {/* Details */}
      <section className="space-y-3">
        <h2 className="text-h2 text-foreground">Details</h2>
        <VenueForm slug={slug} venue={venue} />
      </section>

      {/* Lunches at this venue */}
      {lunches.length > 0 ? (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-h2 text-foreground">Lunches at this venue</h2>
            <ul className="space-y-2">
              {lunches.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground tabular-nums">
                    {fmtDateShort(l.lunch_date)}
                  </span>
                  <Link
                    href={`/c/${slug}/lunches/${l.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {l.title}
                  </Link>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* An archived venue with lunches is already as retired as it gets. */}
      {archived && lunches.length > 0 ? null : (
        <>
          <Separator />
          <form action={deleteVenueAction.bind(null, slug, venue.id)}>
            <ConfirmSubmit
              confirmTitle={lunches.length > 0 ? "Archive venue?" : "Delete venue?"}
              confirmMessage={
                lunches.length > 0
                  ? `${venue.name} has lunch history, so it will be archived instead of deleted.`
                  : `This permanently deletes ${venue.name}.`
              }
              confirmLabel={lunches.length > 0 ? "Archive venue" : "Delete venue"}
              variant="destructive"
            >
              <Trash2Icon />
              {lunches.length > 0 ? "Archive venue" : "Delete venue"}
            </ConfirmSubmit>
          </form>
        </>
      )}
    </div>
  );
}
