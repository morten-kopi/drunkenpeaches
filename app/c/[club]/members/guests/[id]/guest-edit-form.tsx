"use client";

import { useActionState } from "react";
import { updateGuestAction } from "@/app/actions/guests";
import type { FormState } from "@/app/actions/auth";
import type { Guest } from "@/lib/types";
import { useSuccessToast } from "@/lib/use-success-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

export function GuestEditForm({ slug, guest }: { slug: string; guest: Guest }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateGuestAction.bind(null, slug, guest.id),
    {}
  );
  useSuccessToast(pending, state.error, "Guest saved");

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" defaultValue={guest.first_name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" defaultValue={guest.last_name} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={guest.email} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="dietary">Dietary notes</Label>
          <Input id="dietary" name="dietary" defaultValue={guest.dietary_notes ?? ""} />
        </div>
      </div>
      <FormError message={state.error} />
      <Button type="submit" loading={pending}>
        Save
      </Button>
    </form>
  );
}
