import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email on your membership. If an account exists, a reset link will be sent."
      footer={
        <p>
          <Link
            href="/"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Return to the entrance
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
