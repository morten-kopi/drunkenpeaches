import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/**
 * Single source of truth: domain status → semantic tone. Drives the new
 * token-based `Badge` tones (theme-aware in light + dark) plus a leading dot so
 * color is never the only signal.
 */
const STATUS_TONE: Record<string, Tone> = {
  // lunches
  draft: "neutral",
  released: "success",
  completed: "info",
  cancelled: "danger",
  // signups
  confirmed: "success",
  waitlisted: "warning",
  // memberships
  invited: "warning",
  active: "success",
  resigned: "neutral",
  lapsed: "neutral",
  removed: "danger",
  // venues
  archived: "neutral",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone} dot className={cn("capitalize", className)}>
      {status.replace("_", "-")}
    </Badge>
  );
}
