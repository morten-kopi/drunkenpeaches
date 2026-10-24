import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";
import { ExportCard } from "./export-card";
import { EmailsCard } from "./emails-card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club: slug } = await params;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();
  const supabase = await createClient();
  const { data: edited } = await supabase
    .from("email_templates")
    .select("key")
    .eq("club_id", ctx.club.id);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Committee"
        title="Club settings"
        description="Identity, the list windows, emails and exports for this chapter."
      />
      <SettingsForm slug={slug} club={ctx.club} />
      <EmailsCard slug={slug} edited={new Set((edited ?? []).map((e) => e.key as string))} />
      <ExportCard slug={slug} />
    </div>
  );
}
