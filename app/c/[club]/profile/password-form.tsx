"use client";

import { useActionState } from "react";
import { setPasswordAction, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { useSuccessToast } from "@/lib/use-success-toast";

/** Optional: members can sign in with an emailed code instead. */
export function PasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setPasswordAction,
    {}
  );

  useSuccessToast(pending, state.error, "Password saved");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="max-w-sm space-y-4">
          <p className="text-sm text-muted-foreground">
            You can sign in with a code from your email, or with a password.
            Set one here if you&apos;d rather use a password.
          </p>
          {/* Lets password managers save the new password under this email. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <FormError message={state.error} />
          <Button type="submit" variant="outline" loading={pending}>
            Save password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
