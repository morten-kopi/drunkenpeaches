import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { FormError } from "@/components/form-error";
import { createClient } from "@/lib/supabase/server";
import { getMyClubs } from "@/lib/club-context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const clubs = await getMyClubs();
    if (clubs.length > 0) redirect(`/c/${clubs[0].slug}/dashboard`);
  }

  const { next, error } = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      description="See upcoming lunches and sign up."
      footer={
        <p>
          <Link
            href="/auth/forgot"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Forgot your password?
          </Link>
        </p>
      }
    >
      {error ? <FormError message={error} className="mb-4" /> : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
