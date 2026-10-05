import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClubContext } from "@/lib/club-context";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ club: string }>;
}) {
  const { club: slug } = await params;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Committee"
        title="Club settings"
        description="Identity and the list windows for this chapter."
      />
      <SettingsForm slug={slug} club={ctx.club} />
    </div>
  );
}
