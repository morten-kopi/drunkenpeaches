import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/format";
import { appearanceItems, guestAppearances } from "@/lib/guest-history";
import type { Guest } from "@/lib/types";
import { upgradeGuestAction } from "@/app/actions/guests";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceHistory } from "@/components/attendance-history";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ErrorBanner } from "@/components/error-banner";
import { GuestEditForm } from "./guest-edit-form";

export const metadata: Metadata = { title: "Guest" };

export default async function GuestDetailPage({
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
  const { data } = await supabase
    .from("guests")
    .select("*")
    .eq("id", id)
    .eq("club_id", ctx.club.id)
    .maybeSingle();
  const guest = data as Guest | null;
  if (!guest) notFound();
  // A guest who became a member lives on their member page.
  if (guest.membership_id) redirect(`/c/${slug}/members/${guest.membership_id}`);

  const lunches = appearanceItems(
    await guestAppearances(supabase, ctx.club.id, [guest.id]),
    slug
  ).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />
      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/10 text-primary">
            {initials(guest.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 text-foreground">{guest.full_name}</h1>
            <Badge variant="secondary">Guest</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{guest.email}</p>
        </div>
      </div>

      <GuestEditForm slug={slug} guest={guest} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Make {guest.first_name} a member</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Adds {guest.first_name} to the member list with today as the joining
            date and sends the invite email to {guest.email}. The lunches below
            stay in their history.
          </p>
        </CardHeader>
        <CardContent>
          <form action={upgradeGuestAction.bind(null, slug, guest.id)}>
            <ConfirmSubmit
              confirmTitle={`Make ${guest.full_name} a member?`}
              confirmMessage={`The invite email goes to ${guest.email} right away.`}
              confirmLabel="Make member and send invite"
            >
              Make member and send invite
            </ConfirmSubmit>
          </form>
        </CardContent>
      </Card>

      <AttendanceHistory title="Lunches as a guest" items={lunches} />
    </div>
  );
}
