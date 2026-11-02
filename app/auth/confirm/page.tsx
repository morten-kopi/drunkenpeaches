import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Continue" };

const COPY = {
  invite: {
    title: "Accept your invitation",
    description: "Continue to join the club and check your details.",
    button: "Continue",
  },
  recovery: {
    title: "Reset your password",
    description: "Continue to choose a new password.",
    button: "Continue",
  },
  signIn: {
    title: "Sign in",
    description: "One more step to finish signing in.",
    button: "Sign in",
  },
};

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Where invite, sign-in and reset emails link to. Opening the page does not
 * use the link; the button does (see confirmLinkAction).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const type = first(params.type);
  const next = first(params.next);
  const copy =
    type === "invite" ? COPY.invite : type === "recovery" ? COPY.recovery : COPY.signIn;

  return (
    <AuthShell title={copy.title} description={copy.description}>
      <ConfirmForm tokenHash={tokenHash} type={type} next={next} button={copy.button} />
    </AuthShell>
  );
}
