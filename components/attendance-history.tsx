import Link from "next/link";
import { fmtDateShort } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";

export interface AttendanceItem {
  id: string;
  date: string;
  title: string;
  status: string;
  attended: boolean | null;
  /** E.g. "guest of John Smith", for lunches someone came to as a guest. */
  note?: string;
  /** Link for the lunch title. */
  href?: string;
}

/** Attendance timeline: member detail, guest detail and the profile screen. */
export function AttendanceHistory({
  items,
  title = "Attendance",
}: {
  items: AttendanceItem[];
  title?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No luncheons recorded.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-border pl-3"
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmtDateShort(h.date)}
                </span>
                {h.href ? (
                  <Link
                    href={h.href}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {h.title}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{h.title}</span>
                )}
                {h.note ? (
                  <Badge variant="outline">{h.note}</Badge>
                ) : null}
                <StatusBadge status={h.status} />
                {h.attended === true ? (
                  <Badge tone="success" dot>
                    attended
                  </Badge>
                ) : null}
                {h.attended === false ? (
                  <Badge tone="danger" dot>
                    no-show
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
