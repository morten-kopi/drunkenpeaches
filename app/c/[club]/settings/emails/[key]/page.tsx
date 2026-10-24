import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { contentFor, emailDef, type EmailContent } from "@/lib/email-templates";
import { resetEmailTemplateAction } from "@/app/actions/emails";
import { PageHeader } from "@/components/page-header";
import { ErrorBanner } from "@/components/error-banner";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EmailEditor } from "./email-editor";

export const metadata: Metadata = { title: "Edit email" };

export default async function EmailEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string; key: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { club: slug, key } = await params;
  const { error } = await searchParams;
  const ctx = await getClubContext(slug);
  if (!ctx.isCommittee) notFound();
  const def = emailDef(key);
  if (!def) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("email_templates")
    .select("subject, heading, body, updated_at, memberships(full_name)")
    .eq("club_id", ctx.club.id)
    .eq("key", key)
    .maybeSingle();
  const saved = data as
    | (EmailContent & { updated_at: string; memberships: { full_name: string } | null })
    | null;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <Link
        href={`/c/${slug}/settings`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Settings
      </Link>
      <PageHeader
        kicker="Email"
        title={def.name}
        description={`${def.when}. Goes to: ${def.to.toLowerCase()}.`}
      >
        {saved ? (
          <form action={resetEmailTemplateAction.bind(null, slug, def.key)}>
            <ConfirmSubmit
              variant="outline"
              size="sm"
              confirmTitle="Go back to the default wording?"
              confirmMessage="Your edits to this email are discarded."
              confirmLabel="Use default"
            >
              Use default wording
            </ConfirmSubmit>
          </form>
        ) : null}
      </PageHeader>
      <p className="text-xs text-muted-foreground">
        {saved
          ? `Edited ${fmtDateTime(saved.updated_at, ctx.club.timezone)}${saved.memberships ? ` by ${saved.memberships.full_name}` : ""}.`
          : "Default wording."}
      </p>
      {/* Remounts after a save or reset, so the fields show what is stored. */}
      <EmailEditor
        key={saved?.updated_at ?? "default"}
        slug={slug}
        emailKey={def.key}
        clubName={ctx.club.name}
        initial={contentFor(def, saved)}
      />
    </div>
  );
}
