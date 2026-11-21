import Link from "next/link";
import { cn } from "@/lib/utils";

/** Switch between the venue list and the questionnaire rankings. */
export function VenuesTabs({
  slug,
  active,
}: {
  slug: string;
  active: "venues" | "rankings";
}) {
  const tabs = [
    { key: "venues", label: "Venues", href: `/c/${slug}/venues` },
    { key: "rankings", label: "Rankings", href: `/c/${slug}/venues/rankings` },
  ] as const;
  return (
    <nav aria-label="Venues and rankings" className="flex gap-1 border-b border-border">
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
