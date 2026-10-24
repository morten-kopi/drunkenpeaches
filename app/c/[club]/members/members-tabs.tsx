import Link from "next/link";
import { cn } from "@/lib/utils";

/** Committee: switch between the member book and the guests. */
export function MembersTabs({
  slug,
  active,
}: {
  slug: string;
  active: "members" | "guests";
}) {
  const tabs = [
    { key: "members", label: "Members", href: `/c/${slug}/members` },
    { key: "guests", label: "Guests", href: `/c/${slug}/members/guests` },
  ] as const;
  return (
    <nav aria-label="Members and guests" className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
