"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import {
  createVenueAction,
  updateVenueAction,
  type VenueFormState,
} from "@/app/actions/venues";
import type { Venue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import { useSuccessToast } from "@/lib/use-success-toast";

export function VenueForm({
  slug,
  venue,
  onSuccess,
}: {
  slug: string;
  venue?: Venue;
  /** Called once after a successful save, with the new venue on create. */
  onSuccess?: (created?: VenueFormState["venue"]) => void;
}) {
  const action = venue
    ? updateVenueAction.bind(null, slug, venue.id)
    : createVenueAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<VenueFormState, FormData>(
    action,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  // Unique ids: this form also opens inside the lunch form's page.
  const uid = useId();

  useSuccessToast(pending, state.error, venue ? "Venue saved" : "Venue added");

  useEffect(() => {
    if (pending) {
      submitted.current = true;
      return;
    }
    if (!submitted.current) return;
    submitted.current = false;
    if (state.error) return;
    if (!venue) formRef.current?.reset();
    onSuccess?.(state.venue);
  }, [pending, state, venue, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${uid}-name`}>Restaurant name</Label>
        <Input
          id={`${uid}-name`}
          name="name"
          defaultValue={venue?.name ?? ""}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-address`}>Address</Label>
        <Input
          id={`${uid}-address`}
          name="address"
          defaultValue={venue?.address ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${uid}-contact`}>Contact (name / phone)</Label>
          <Input
            id={`${uid}-contact`}
            name="contact"
            defaultValue={venue?.contact ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${uid}-capacity`}>Private room capacity</Label>
          <Input
            id={`${uid}-capacity`}
            name="defaultCapacity"
            type="number"
            min={1}
            defaultValue={venue?.default_capacity ?? ""}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-notes`}>Notes</Label>
        <Textarea
          id={`${uid}-notes`}
          name="notes"
          rows={3}
          defaultValue={venue?.notes ?? ""}
          placeholder="Add venue notes…"
        />
      </div>
      <FormError message={state.error} />
      <Button type="submit" loading={pending}>
        {venue ? "Save venue" : "Add venue"}
      </Button>
    </form>
  );
}
