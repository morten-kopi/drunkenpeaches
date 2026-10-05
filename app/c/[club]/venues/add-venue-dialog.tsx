"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import type { VenueFormState } from "@/app/actions/venues";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VenueForm } from "./venue-form";

type CreatedVenue = NonNullable<VenueFormState["venue"]>;

/**
 * Dialog wrapping the new-venue form. Uncontrolled it brings its own "Add
 * venue" button; the lunch form passes `open` to launch it from the venue picker.
 */
export function AddVenueDialog({
  slug,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  slug: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (venue: CreatedVenue) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : ownOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setOwnOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled ? null : (
        <DialogTrigger
          render={
            <Button variant="outline">
              <PlusIcon />
              Add venue
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a venue</DialogTitle>
          <DialogDescription>Only the name is required.</DialogDescription>
        </DialogHeader>
        <VenueForm
          slug={slug}
          onSuccess={(created) => {
            if (created) onCreated?.(created);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
