import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Establish a chapter" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Establish a chapter"
      description="You will be the first committee member, and may invite others at once."
      footer={
        <p>
          Already a member?{" "}
          <Link
            href="/"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Members&apos; entrance
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
