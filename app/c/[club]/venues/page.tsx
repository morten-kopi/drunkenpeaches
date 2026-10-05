import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronDownIcon, MapPinIcon, UsersIcon, UtensilsIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import type { Venue } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorBanner } from "@/components/error-banner";
import { AddVenueDialog } from "./add-venue-dialog";

export const metadata: Metadata = { title: "Venues" };

export default async function VenuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("venues")
    .select("*")
    .eq("club_id", ctx.club.id)
    .order("name");
  const venues = (data ?? []) as Venue[];
  const active = venues.filter((v) => v.status !== "archived");
  const archived = venues.filter((v) => v.status === "archived");

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />
      <PageHeader
        kicker="Back of house"
        title="Venues"
        description="Restaurants on file for the club's luncheons."
      >
        <AddVenueDialog slug={slug} />
      </PageHeader>

      {active.length === 0 ? (
        <EmptyState
          icon={UtensilsIcon}
          title="No venues yet"
          description="Add a restaurant to book a lunch there."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((v) => (
            <Link
              key={v.id}
              href={`/c/${slug}/venues/${v.id}`}
              className="block"
            >
              <Card hover className="h-full gap-2 p-4">
                <p className="font-heading font-medium text-foreground">
                  {v.name}
                </p>
                {v.address ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPinIcon className="size-3.5 shrink-0" />
                    {v.address}
                  </p>
                ) : null}
                {v.default_capacity ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UsersIcon className="size-3.5 shrink-0" />
                    room for ~{v.default_capacity}
                  </p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {archived.length > 0 ? (
        <details className="group rounded-2xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground">
            Archived ({archived.length})
            <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-border p-4">
            {archived.map((v) => (
              <Link
                key={v.id}
                href={`/c/${slug}/venues/${v.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                {v.name}
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
