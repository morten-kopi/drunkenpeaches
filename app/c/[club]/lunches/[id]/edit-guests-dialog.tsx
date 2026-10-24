"use client";

import { useActionState, useState } from "react";
import { committeeSetGuestsAction, type FormState } from "@/app/actions/lunches";
import type { GuestOption } from "@/lib/types";
import { useSuccessToast } from "@/lib/use-success-toast";
import { GuestPicker } from "@/components/guest-picker";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** The committee can seat up to this many guests with one member. */
export const COMMITTEE_MAX_GUESTS = 10;

/** Committee: change the guests on one member's signup. */
export function EditGuestsDialog({
  slug,
  lunchId,
  signupId,
  memberName,
  guests,
  options,
  maxPerMember,
  checksSeats,
}: {
  slug: string;
  lunchId: string;
  signupId: string;
  memberName: string;
  guests: GuestOption[];
  options: GuestOption[];
  /** The lunch's own limit, shown as guidance. */
  maxPerMember: number;
  /** True for a confirmed place on an open lunch, where seats still count. */
  checksSeats: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    committeeSetGuestsAction.bind(null, slug, lunchId, signupId),
    {}
  );
  useSuccessToast(pending, state.error, "Guests updated", () => setOpen(false));

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Guests
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Guests of {memberName}</DialogTitle>
            <DialogDescription>
              {maxPerMember > 0
                ? `This lunch allows ${maxPerMember} guest${maxPerMember === 1 ? "" : "s"} per member. As committee you can go past that, and the cutoff and guest date don't apply.`
                : "This lunch takes no guests. As committee you can add them anyway, and the cutoff and guest date don't apply."}
            </DialogDescription>
          </DialogHeader>
          {/* Remounts on open, so the picker starts from the saved guests. */}
          {open ? (
            <form action={formAction} className="space-y-4">
              <GuestPicker max={COMMITTEE_MAX_GUESTS} options={options} initial={guests} />
              {checksSeats ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="force" />
                  Seat even if full (override)
                </label>
              ) : null}
              <FormError message={state.error} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Save guests
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
