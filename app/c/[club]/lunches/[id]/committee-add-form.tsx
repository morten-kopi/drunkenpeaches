"use client";

import { useActionState, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { committeeAddSignupAction, type FormState } from "@/app/actions/lunches";
import type { GuestOption } from "@/lib/types";
import { useSuccessToast } from "@/lib/use-success-toast";
import { GuestPicker } from "@/components/guest-picker";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMITTEE_MAX_GUESTS } from "./edit-guests-dialog";

/** Committee: put a member, and any guests, on the list by hand. */
export function CommitteeAddForm({
  slug,
  lunchId,
  members,
  previousGuests,
}: {
  slug: string;
  lunchId: string;
  members: { id: string; label: string }[];
  /** Guests each member has brought before, keyed by membership id. */
  previousGuests: Record<string, GuestOption[]>;
}) {
  const [memberId, setMemberId] = useState<string | null>(null);
  // Bumped after each add so the picker starts empty again.
  const [round, setRound] = useState(0);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    committeeAddSignupAction.bind(null, slug, lunchId),
    {}
  );
  useSuccessToast(pending, state.error, "Added to the list", () => {
    setMemberId(null);
    setRound((r) => r + 1);
  });

  const items = members.map((m) => ({ value: m.id, label: m.label }));

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="membershipId">Member</Label>
        <Select
          name="membershipId"
          required
          items={items}
          value={memberId}
          onValueChange={(v) => setMemberId(v ? String(v) : null)}
        >
          <SelectTrigger id="membershipId" className="w-full">
            <SelectValue placeholder="Pick a member…" />
          </SelectTrigger>
          <SelectContent>
            {items.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {memberId ? (
        <GuestPicker
          key={`${memberId}-${round}`}
          max={COMMITTEE_MAX_GUESTS}
          options={previousGuests[memberId] ?? []}
        />
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="force" />
        Seat even if full (override)
      </label>
      <FormError message={state.error} />
      <Button type="submit" variant="outline" loading={pending}>
        <UserPlusIcon />
        Add
      </Button>
      <p className="text-xs text-muted-foreground">
        Ignores the cutoff and the guest rules. Without the override, they join
        the waitlist when the lunch is full.
      </p>
    </form>
  );
}
