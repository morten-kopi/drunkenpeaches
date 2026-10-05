import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandWordmark } from "@/components/brand-mark";
import { createClient } from "@/lib/supabase/server";
import { getMyClubs } from "@/lib/club-context";

const NOTICES = [
  {
    kicker: "The list",
    title: "Fixed seats, in order of name",
    body: "Capacity is the restaurant booking. Members add their names first-come; the rest wait, and a place is offered the moment one is free.",
  },
  {
    kicker: "The committee",
    title: "The secretary’s desk",
    body: "Venues on file. Dietary notes for the house. Manual overrides when a member telephones.",
  },
  {
    kicker: "Guests",
    title: "Decided lunch by lunch",
    body: "The committee decides for each luncheon whether members may bring guests. Guest places open on a set date, after the membership has had first claim.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const clubs = await getMyClubs();
    if (clubs.length > 0) redirect(`/c/${clubs[0].slug}/dashboard`);
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <BrandWordmark size="sm" />
          <nav className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Members
            </Button>
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              Establish a chapter
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative">
        <div className="mx-auto max-w-2xl px-5 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
          <p className="club-kicker">Private dining clubs</p>
          <h1 className="text-display mt-4 text-balance text-foreground">
            The book is kept.
          </h1>
          <div className="club-rule mt-6 max-w-16" />
          <p className="mt-6 max-w-xl text-pretty text-[1.05rem] leading-relaxed text-muted-foreground sm:text-lg">
            Luncheons, the list and the venues, recorded for the committee and
            the table. Invitation only. Built for clubs such as Beefsteaks
            &amp; Burgundy.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Members&apos; entrance
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              Establish a chapter
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-2xl space-y-0 border-t border-border px-5 sm:px-6">
        {NOTICES.map((n) => (
          <article
            key={n.title}
            className="border-b border-border py-8 last:border-b-0"
          >
            <p className="club-kicker">{n.kicker}</p>
            <h2 className="font-heading mt-2 text-xl text-foreground sm:text-2xl">
              {n.title}
            </h2>
            <p className="mt-2 max-w-prose text-[0.95rem] leading-relaxed text-muted-foreground">
              {n.body}
            </p>
          </article>
        ))}
      </section>

      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-5 py-6 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Drunken Peaches</span>
          <span>Each club is a private, isolated chapter.</span>
        </div>
      </footer>
    </main>
  );
}
