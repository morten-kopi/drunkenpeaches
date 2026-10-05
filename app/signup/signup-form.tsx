"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClubAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createClubAction,
    {}
  );
  // The creator's browser zone becomes the club's default time zone.
  const timezoneRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <input ref={timezoneRef} type="hidden" name="timezone" defaultValue="UTC" />
      <div className="space-y-2">
        <Label htmlFor="clubName">Chapter name</Label>
        <Input
          id="clubName"
          name="clubName"
          placeholder="Beefsteaks & Burgundy — Singapore"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" loading={pending}>
        {pending ? "Establishing…" : "Establish chapter"}
      </Button>
    </form>
  );
}
