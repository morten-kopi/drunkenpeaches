import * as React from "react";

import { cn } from "@/lib/utils";

interface SeatMeterProps {
  taken: number;
  capacity: number;
  /** Number on the waitlist (shown as an overflow chip). */
  waitlisted?: number;
  /** Show the `taken / capacity seats` label row. */
  showLabel?: boolean;
  size?: "default" | "sm";
  className?: string;
}

/**
 * Capacity bar — `32 / 40 seats` with a burgundy fill, a waitlist overflow
 * chip, and a destructive fill when over capacity (committee force-seating).
 */
export function SeatMeter({
  taken,
  capacity,
  waitlisted = 0,
  showLabel = true,
  size = "default",
  className,
}: SeatMeterProps) {
  const over = capacity > 0 && taken > capacity;
  const pct =
    capacity > 0 ? Math.min(100, Math.round((taken / capacity) * 100)) : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      {showLabel ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm">
            <span
              className={cn(
                "font-heading text-base font-medium",
                over ? "text-destructive" : "text-foreground"
              )}
            >
              {taken}
            </span>{" "}
            <span className="text-muted-foreground">/ {capacity} places</span>
          </span>
          {waitlisted > 0 ? (
            <span className="text-xs font-medium text-warning">
              +{waitlisted} waitlisted
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={taken}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label={`${taken} of ${capacity} seats taken`}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-(--duration-default) ease-(--ease-out-quint)",
            over ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
