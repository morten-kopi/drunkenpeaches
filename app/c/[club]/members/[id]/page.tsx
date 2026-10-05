import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/format";
import type { Membership } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import {
  AttendanceHistory,
  type AttendanceItem,
} from "@/components/attendance-history";
import { MemberEditForm } from "./member-edit-form";

export const metadata: Metadata = { title: "Edit member" };

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ club: string; id: string }>;
}) {
  const { club: slug, id } = await params;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  const supabase = await createClient();
  const { data: memberData } = await supabase
    .from("memberships")
    .select("*")
    .eq("id", id)
    .eq("club_id", ctx.club.id)
    .single();
  if (!memberData) notFound();
  const member = memberData as Membership;

  const { data: history } = await supabase
    .from("signups")
    .select(
      "id, status, attended, guest_count, lunches(id, title, lunch_date, status)"
    )
    .eq("membership_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const attendance: AttendanceItem[] = (history ?? [])
    .map((h) => ({
      raw: h,
      lunch: h.lunches as unknown as {
        id: string;
        title: string;
        lunch_date: string;
        status: string;
      } | null,
    }))
    .filter((h) => h.lunch && h.raw.status !== "cancelled")
    .map((h) => ({
      id: h.raw.id,
      date: h.lunch!.lunch_date,
      title: h.lunch!.title,
      status: h.raw.status,
      attended: h.raw.attended,
    }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/10 text-primary">
            {initials(member.full_name || member.email)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 text-foreground">
              {member.full_name || member.email}
            </h1>
            <StatusBadge status={member.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Member since {member.joined_on.slice(0, 4)}</span>
            {member.function ? <span>{member.function}</span> : null}
            <Badge variant="secondary" className="capitalize">
              {member.role}
            </Badge>
          </div>
        </div>
      </div>

      <MemberEditForm
        slug={slug}
        member={member}
        isSelf={member.id === ctx.membership.id}
      />

      <AttendanceHistory items={attendance} />
    </div>
  );
}
