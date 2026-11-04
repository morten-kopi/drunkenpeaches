"use client";

import { useActionState } from "react";
import { completeProfileAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

export function SetPasswordForm({
  defaults,
}: {
  defaults: { firstName: string; lastName: string; phone: string };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    completeProfileAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={defaults.firstName}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={defaults.lastName}
            autoComplete="family-name"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={defaults.phone}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password (optional)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters. Leave it empty to sign in with a code from
          your email.
        </p>
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" loading={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
