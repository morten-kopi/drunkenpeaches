"use client";

import { CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Copies `text` to the clipboard and toasts. */
export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Couldn't copy. Select the text and copy it yourself.");
        }
      }}
    >
      <CopyIcon />
      {label}
    </Button>
  );
}
