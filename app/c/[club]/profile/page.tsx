import type { Metadata } from "next";
import { getClubContext } from "@/lib/club-context";
import { initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AttendanceHistory,
  type AttendanceItem,
} from "@/components/attendance-history";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My particulars" };

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club: slug } = await params;
  const ctx = await getClubContext(slug);
  const supabase = await createClient();

  const { data: history } = await supabase
    .from("signups")
    .select("id, status, attended, lunches(id, title, lunch_date, status)")
    .eq("membership_id", ctx.membership.id)
    .order("created_at", { ascending: false })
    .limit(30);

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
            {initials(ctx.membership.full_name || ctx.membership.email)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1.5">
          <h1 className="text-h1 text-foreground">My particulars</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {ctx.club.name} · member since{" "}
              {ctx.membership.joined_on.slice(0, 4)}
            </span>
            {ctx.membership.function ? (
              <span>{ctx.membership.function}</span>
            ) : null}
            {ctx.membership.role === "committee" ? (
              <Badge variant="secondary">Committee</Badge>
            ) : null}
            {ctx.membership.wine_master ? (
              <Badge tone="info">Wine Master</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <ProfileForm slug={slug} membership={ctx.membership} />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">
              Light, dark, or match your system.
            </p>
          </div>
          <ThemeToggle />
        </CardContent>
      </Card>

      <AttendanceHistory items={attendance} />
    </div>
  );
}
