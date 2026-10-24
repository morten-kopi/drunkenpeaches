import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { EMAILS } from "@/lib/email-templates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Every automatic email: when it goes, to whom, and whether it was edited. */
export function EmailsCard({ slug, edited }: { slug: string; edited: Set<string> }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Emails</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          The emails the app sends by itself. Open one to change its wording.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border border-t border-border">
          {EMAILS.map((e) => (
            <li key={e.key}>
              <Link
                href={`/c/${slug}/settings/emails/${e.key}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {e.name}
                    {edited.has(e.key) ? <Badge variant="secondary">Edited</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.when}. To {e.to.toLowerCase()}.
                  </p>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
