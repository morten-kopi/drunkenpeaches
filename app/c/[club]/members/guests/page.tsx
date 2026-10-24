import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { initials, todayInZone } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { attended, guestAppearances } from "@/lib/guest-history";
import type { Guest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/page-header";
import { DataList, type DataListColumn } from "@/components/data-list";
import { EmptyState } from "@/components/empty-state";
import { MembersTabs } from "../members-tabs";

export const metadata: Metadata = { title: "Guests" };

type Row = Guest & { lunches: number };

export default async function GuestsPage({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club: slug } = await params;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();
  const supabase = await createClient();

  // Guests who became members are on the Members tab now.
  const guests = await fetchAll<Guest>((from, to) =>
    supabase
      .from("guests")
      .select("*")
      .eq("club_id", ctx.club.id)
      .is("membership_id", null)
      .order("last_name")
      .order("first_name")
      .order("id")
      .range(from, to)
  );
  const today = todayInZone(ctx.club.timezone);
  const counts = new Map<string, number>();
  for (const a of await guestAppearances(supabase, ctx.club.id)) {
    if (attended(a, today)) counts.set(a.guest_id, (counts.get(a.guest_id) ?? 0) + 1);
  }
  const rows: Row[] = guests.map((g) => ({ ...g, lunches: counts.get(g.id) ?? 0 }));

  const columns: DataListColumn<Row>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      cell: (g) => (
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {initials(g.full_name)}
            </AvatarFallback>
          </Avatar>
          <Link
            href={`/c/${slug}/members/guests/${g.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {g.full_name}
          </Link>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (g) => <span className="text-muted-foreground">{g.email}</span>,
    },
    {
      key: "lunches",
      header: "Lunches attended",
      className: "tabular-nums",
      cell: (g) => g.lunches,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      className: "text-right",
      primary: true,
      cell: (g) => (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/c/${slug}/members/guests/${g.id}`} />}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="The book"
        title="Guests"
        description={`${rows.length} guest${rows.length === 1 ? "" : "s"} brought by members`}
      />
      <MembersTabs slug={slug} active="guests" />
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(g) => g.id}
        empty={
          <EmptyState
            icon={UsersIcon}
            title="No guests yet"
            description="Guests appear here when a member brings them to a lunch."
          />
        }
      />
      <p className="text-xs text-muted-foreground">
        A guest is added when a member brings them to a lunch. Open a guest to
        correct their details or make them a member; the lunches they came to
        as a guest stay in their history.
      </p>
    </div>
  );
}
