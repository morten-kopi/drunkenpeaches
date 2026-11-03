"use client";

import { useActionState } from "react";
import { createSignInLinkAction, type SignInLinkState } from "@/app/actions/members";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/form-error";

/**
 * For a member whose sign-in email doesn't arrive (some company mail filters
 * hold it back): the committee creates the link and sends it themselves.
 */
export function SignInLink({
  slug,
  membershipId,
  name,
}: {
  slug: string;
  membershipId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<SignInLinkState, FormData>(
    createSignInLinkAction.bind(null, slug, membershipId),
    {}
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in link</CardTitle>
        <CardDescription>
          If {name}&apos;s sign-in email doesn&apos;t arrive, create a link here
          and send it to them yourself, for example on WhatsApp. Anyone with the
          link can sign in as {name}, so send it only to them. It works once,
          and stops working if they ask for a new code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.link ? (
          <div className="flex gap-2">
            <Input
              readOnly
              value={state.link}
              aria-label="Sign-in link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton text={state.link} className="h-9 shrink-0" />
          </div>
        ) : null}
        <FormError message={state.error} />
        <form action={formAction}>
          <Button type="submit" variant="outline" loading={pending}>
            {state.link ? "Create a new link" : "Create sign-in link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
