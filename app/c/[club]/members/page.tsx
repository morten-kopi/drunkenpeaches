import Link from "next/link";
import type { Metadata } from "next";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/format";
import type { Membership } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/page-header";
import { DataList, type DataListColumn } from "@/components/data-list";
import { StatusBadge } from "@/components/status-badge";
import { ErrorBanner } from "@/components/error-banner";
import { InviteForm } from "./invite-form";
import { MembersTabs } from "./members-tabs";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  const supabase = await createClient();

  const { data } = await supabase
    .from("memberships")
    .select("*")
    .eq("club_id", ctx.club.id)
    .order("full_name");
  const all = (data ?? []) as Membership[];

  const visible = ctx.isCommittee
    ? all
    : all.filter((m) => m.status === "active");
  const activeCount = all.filter((m) => m.status === "active").length;

  const columns: DataListColumn<Membership>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {initials(m.full_name || m.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium">{m.full_name || "—"}</p>
            {m.function ? (
              <p className="text-xs text-muted-foreground">{m.function}</p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (m) => <span className="text-muted-foreground">{m.email}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (m) => (
        <span className="text-muted-foreground">{m.phone ?? "—"}</span>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (m) => <span className="capitalize">{m.role}</span>,
    },
    ...(ctx.isCommittee
      ? [
          {
            key: "status",
            header: "Status",
            cell: (m: Membership) => <StatusBadge status={m.status} />,
          },
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            headerClassName: "text-right",
            className: "text-right",
            primary: true,
            cell: (m: Membership) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/c/${slug}/members/${m.id}`} />}
                >
                  Edit
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <PageHeader
        title="Members"
        description={`${activeCount} active member${activeCount === 1 ? "" : "s"}`}
      />

      {ctx.isCommittee ? <MembersTabs slug={slug} active="members" /> : null}

      {ctx.isCommittee ? <InviteForm slug={slug} /> : null}

      <DataList columns={columns} rows={visible} rowKey={(m) => m.id} />

      {ctx.isCommittee ? (
        <p className="text-xs text-muted-foreground">
          Members are never deleted. Mark them resigned, lapsed or removed and
          their attendance history stays.
        </p>
      ) : null}
    </div>
  );
}
