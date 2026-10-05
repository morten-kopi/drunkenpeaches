import Link from "next/link";
import { CalendarDaysIcon, MapPinIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { SeatMeter } from "@/components/seat-meter";

export interface LunchCardProps {
  href: string;
  title: string;
  status: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  venueName?: string | null;
  taken?: number;
  capacity?: number | null;
  waitlisted?: number;
  mySignupStatus?: string | null;
  phaseLabel?: string | null;
  className?: string;
}

/** Notice-board lunch card — dashboard and the lunches list. */
export function LunchCard({
  href,
  title,
  status,
  date,
  venueName,
  taken,
  capacity,
  waitlisted = 0,
  mySignupStatus,
  phaseLabel,
  className,
}: LunchCardProps) {
  return (
    <Link href={href} className={cn("block h-full", className)}>
      <Card hover className="club-notice h-full gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-[1.05rem] leading-snug text-foreground">
            {title}
          </h3>
          <StatusBadge status={status} />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarDaysIcon className="size-3.5 shrink-0" />
            {fmtDateShort(date)}
          </p>
          {venueName ? (
            <p className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5 shrink-0" />
              {venueName}
            </p>
          ) : null}
        </div>
        {capacity != null ? (
          <SeatMeter
            taken={taken ?? 0}
            capacity={capacity}
            waitlisted={waitlisted}
            size="sm"
          />
        ) : null}
        {phaseLabel ? (
          <p className="text-xs text-muted-foreground">{phaseLabel}</p>
        ) : null}
        {mySignupStatus ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Your place: <StatusBadge status={mySignupStatus} />
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
