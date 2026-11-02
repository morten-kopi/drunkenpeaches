import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a reset link."
      footer={
        <p>
          <Link
            href="/"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
