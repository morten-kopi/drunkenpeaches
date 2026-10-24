import { DownloadIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FILES = [
  { kind: "members", label: "Members" },
  { kind: "venues", label: "Venues" },
  { kind: "lunches", label: "Lunches" },
  { kind: "attendance", label: "Attendance" },
];

export function ExportCard({ slug }: { slug: string }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          CSV files that open in Excel or Google Sheets. Lunches has one row per
          lunch. Attendance has one row per person per lunch, with whether they
          came.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {FILES.map((f) => (
          <a
            key={f.kind}
            href={`/c/${slug}/settings/export/${f.kind}`}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <DownloadIcon />
            {f.label}
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
