"use client";

import { useActionState } from "react";
import { updateMyProfileAction } from "@/app/actions/members";
import type { FormState } from "@/app/actions/auth";
import type { Membership } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import { useSuccessToast } from "@/lib/use-success-toast";

export function ProfileForm({
  slug,
  membership,
}: {
  slug: string;
  membership: Membership;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateMyProfileAction.bind(null, slug),
    {}
  );

  useSuccessToast(pending, state.error, "Profile saved");

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={membership.first_name}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={membership.last_name}
            autoComplete="family-name"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <div className="flex h-9 items-center rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground">
          {membership.email}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={membership.phone ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dietary">Dietary preferences</Label>
        <Textarea
          id="dietary"
          name="dietary"
          rows={3}
          defaultValue={membership.dietary_notes ?? ""}
          placeholder="e.g. no shellfish; vegetarian"
        />
        <p className="text-xs text-muted-foreground">
          The committee shares these with the restaurant before each lunch.
        </p>
      </div>
      <FormError message={state.error} />
      <Button type="submit" loading={pending}>
        Save profile
      </Button>
    </form>
  );
}
