import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("first_name, last_name, phone, dietary_notes, clubs(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const clubName =
    (membership?.clubs as unknown as { name: string } | null)?.name ??
    "your club";

  return (
    <AuthShell
      title={`Welcome to ${clubName}`}
      description="Choose a password and complete your particulars for the book."
    >
      <SetPasswordForm
        defaults={{
          firstName: membership?.first_name ?? "",
          lastName: membership?.last_name ?? "",
          phone: membership?.phone ?? "",
          dietary: membership?.dietary_notes ?? "",
        }}
      />
    </AuthShell>
  );
}
