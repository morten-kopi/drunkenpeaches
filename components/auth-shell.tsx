import * as React from "react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark, BrandWordmark } from "@/components/brand-mark";

interface AuthShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Links / helper copy under the form. */
  footer?: React.ReactNode;
}

/**
 * Auth layout: a quiet form column on paper, oxblood panel on large screens.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-dvh flex-1">
      <div className="flex flex-1 flex-col px-5 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Drunken Peaches home">
            <BrandWordmark size="sm" />
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <p className="club-kicker">Drunken Peaches</p>
            <h1 className="text-h1 mt-3 text-foreground">{title}</h1>
            {description ? (
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
            <div className="mt-8">{children}</div>
            {footer ? (
              <div className="mt-6 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="relative hidden w-[40%] max-w-xl flex-col justify-between overflow-hidden bg-primary px-12 py-14 text-primary-foreground lg:flex">
        <BrandMark size="lg" />
        <blockquote className="relative max-w-sm">
          <p className="font-heading text-[2rem] leading-[1.15] font-medium text-balance">
            A society of friends, a serious cellar, and a standing reservation.
          </p>
          <footer className="mt-6 text-sm leading-relaxed text-primary-foreground/70">
            The list, the venues, the wine — kept so the committee may return
            to the table.
          </footer>
        </blockquote>
        <p className="relative text-xs tracking-wide text-primary-foreground/55">
          Each club is its own private chapter.
        </p>
      </aside>
    </main>
  );
}
