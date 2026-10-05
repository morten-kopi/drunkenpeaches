import { format, parseISO } from "date-fns";
import { tz } from "@date-fns/tz";

export function fmtDate(date: string) {
  return format(parseISO(date), "EEEE d MMMM yyyy");
}

export function fmtDateShort(date: string) {
  return format(parseISO(date), "EEE d MMM yyyy");
}

export function fmtTime(time: string) {
  return time.slice(0, 5);
}

/** A timestamp shown on the club's clock, whatever zone the code runs in. */
export function fmtDateTime(iso: string, timeZone: string) {
  return format(new Date(iso), "EEE d MMM yyyy, HH:mm", { in: tz(timeZone) });
}

/** Calendar date (YYYY-MM-DD) of an instant in the club's zone. */
export function dateInZone(instant: string | Date, timeZone: string) {
  return format(new Date(instant), "yyyy-MM-dd", { in: tz(timeZone) });
}

/** Today's date (YYYY-MM-DD) in the club's zone. */
export function todayInZone(timeZone: string, now: Date = new Date()) {
  return dateInZone(now, timeZone);
}

/** Canonical spelling of an IANA zone name, or null if it isn't one. */
export function canonicalTimeZone(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

/** Up to two uppercase initials from a name, for avatar fallbacks. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
