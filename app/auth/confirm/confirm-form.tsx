"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmLinkAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";

export function ConfirmForm({
  tokenHash,
  type,
  next,
  button,
}: {
  tokenHash: string;
  type: string;
  next: string;
  button: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    confirmLinkAction,
    {}
  );

  if (state.error) {
    return (
      <div className="space-y-4">
        <FormError message={state.error} />
        <Link
          href={type === "recovery" ? "/auth/forgot" : "/"}
          className="text-sm text-foreground underline underline-offset-4 hover:text-primary"
        >
          {type === "recovery" ? "Ask for a new reset link" : "Go to sign in"}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" className="w-full" loading={pending}>
        {button}
      </Button>
    </form>
  );
}
