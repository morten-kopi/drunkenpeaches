"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  CalendarDaysIcon,
  HomeIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  UtensilsIcon,
  EllipsisIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

interface AppNavProps {
  clubSlug: string;
  clubName: string;
  memberName: string;
  isCommittee: boolean;
}

export function AppNav({
  clubSlug,
  clubName,
  memberName,
  isCommittee,
}: AppNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const signoutRef = useRef<HTMLFormElement>(null);
  const base = `/c/${clubSlug}`;

  const primary = [
    { href: `${base}/dashboard`, label: "Home", icon: HomeIcon },
    { href: `${base}/lunches`, label: "Lunches", icon: CalendarDaysIcon },
    { href: `${base}/members`, label: "Members", icon: UsersIcon },
  ];

  const moreLinks = [
    ...(isCommittee
      ? [{ href: `${base}/venues`, label: "Venues", icon: UtensilsIcon }]
      : []),
    ...(isCommittee
      ? [{ href: `${base}/settings`, label: "Settings", icon: SettingsIcon }]
      : []),
    { href: `${base}/profile`, label: "My particulars", icon: UserIcon },
  ];

  const desktopLinks = [
    ...primary,
    ...moreLinks.filter((l) => l.href !== `${base}/profile`),
  ];

  const isActive = (href: string) => pathname.startsWith(href);
  const moreActive = moreLinks.some((l) => isActive(l.href));

  const roleLabel = isCommittee ? "Committee" : "Member";

  const submitSignout = () => signoutRef.current?.requestSubmit();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-6">
          <Link
            href={`${base}/dashboard`}
            className="flex min-w-0 items-center gap-2.5"
          >
            <BrandMark size="sm" />
            <span className="font-heading truncate text-base tracking-tight text-foreground md:text-lg">
              {clubName}
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Club">
            {desktopLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-2 text-sm transition-colors duration-(--duration-micro)",
                  isActive(l.href)
                    ? "font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-1 md:flex">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="gap-2 pl-1.5" />
                }
              >
                <Avatar size="sm">
                  <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                    {initials(memberName)}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-32 truncate">
                  {memberName || "Account"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{memberName}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href={`${base}/profile`} />}>
                  <UserIcon />
                  My particulars
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={submitSignout}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Club"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      >
        <ul className="grid h-16 grid-cols-4">
          {primary.map((l) => {
            const active = isActive(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex h-full min-h-11 flex-col items-center justify-center gap-1 text-[0.6875rem] tracking-wide",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <l.icon className="size-5" strokeWidth={active ? 2.1 : 1.6} />
                  {l.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-label="More"
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(
                "flex h-full min-h-11 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] tracking-wide",
                moreOpen || moreActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {moreOpen ? (
                <XIcon className="size-5" strokeWidth={2.1} />
              ) : (
                <EllipsisIcon
                  className="size-5"
                  strokeWidth={moreActive ? 2.1 : 1.6}
                />
              )}
              More
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-foreground/25"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-16 space-y-1 border-t border-border bg-background px-4 pb-3 pt-3 shadow-lifted">
            <p className="club-kicker px-1 pb-2">{roleLabel}</p>
            {moreLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 items-center gap-3 px-1 text-[0.95rem]",
                  isActive(l.href)
                    ? "font-medium text-primary"
                    : "text-foreground"
                )}
              >
                <l.icon className="size-4 text-muted-foreground" />
                {l.label}
              </Link>
            ))}
            <div className="flex min-h-12 items-center justify-between px-1">
              <span className="text-[0.95rem]">Appearance</span>
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={submitSignout}
              className="flex min-h-12 w-full items-center gap-3 px-1 text-[0.95rem] text-destructive"
            >
              <LogOutIcon className="size-4" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <form ref={signoutRef} action="/auth/signout" method="post" hidden>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </>
  );
}
