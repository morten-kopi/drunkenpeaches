import { addDays, format } from "date-fns";
import { TZDate, tz } from "@date-fns/tz";
import { dateInZone, fmtDateShort, fmtDateTime, todayInZone } from "@/lib/format";
import { guestPolicy, type Club, type Lunch } from "@/lib/types";

/** Club-level default durations used to compute per-lunch phase timestamps. */
export type PhaseDurations = Pick<
  Club,
  | "committee_priority_days"
  | "members_only_days"
  | "guests_phase_days"
  | "signup_cutoff_days"
  | "timezone"
>;

export type PhaseTimestamps = {
  signup_opens_at: string;
  members_open_at: string;
  guests_open_at: string;
  signup_cutoff_at: string;
};

export type LunchPhaseFields = Pick<
  Lunch,
  | "id"
  | "status"
  | "lunch_date"
  | "start_time"
  | "signup_opens_at"
  | "members_open_at"
  | "guests_open_at"
  | "signup_cutoff_at"
>;

/**
 * Released-lunch signup phase. Legacy rows with null timestamps are treated as
 * already open to members (and guests follow guestPolicy) until cutoff. The
 * "guests" phase is about the guest date only; the lunch still has to allow guests.
 */
export type SignupPhase =
  | "draft"
  | "cancelled"
  | "completed"
  | "not_open"
  | "committee"
  | "members"
  | "guests"
  | "closed";

/** Lunch start as an instant. Date and time are wall-clock in the club's zone. */
export function lunchStartAt(
  lunchDate: string,
  startTime: string,
  timeZone: string
): Date {
  const [y, m, d] = lunchDate.split("-").map(Number);
  const [hh, mm] = (startTime || "12:30").split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, timeZone).getTime());
}

/** Add calendar days on the club's clock, keeping local time across DST changes. */
export function addClubDays(
  date: Date | string,
  days: number,
  timeZone: string
): Date {
  return new Date(addDays(new Date(date), days, { in: tz(timeZone) }).getTime());
}

/** "YYYY-MM-DDTHH:mm" on the club's clock, for datetime-local inputs. */
export function toDatetimeLocalValue(
  iso: string | null | undefined,
  timeZone: string
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm", { in: tz(timeZone) });
}

/** Read a datetime-local value on the club's clock, not the browser's or server's. */
export function fromDatetimeLocalValue(
  raw: string,
  timeZone: string
): string | null {
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, hh, mm] = match.map(Number);
  const instant = new TZDate(y, mo - 1, d, hh, mm, timeZone).getTime();
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

/**
 * Compute the four absolute timestamps.
 *
 * - From lunch date: count backwards from cutoff (lunch start − cutoff days)
 *   by guests → members → committee windows to get signup_opens_at.
 * - From a chosen opens time: count forwards (committee days → members days)
 *   for members_open_at / guests_open_at; cutoff still follows lunch date
 *   unless an explicit cutoff is passed.
 */
export function computePhaseTimestamps(opts: {
  lunchDate: string;
  startTime: string;
  club: PhaseDurations;
  signupOpensAt?: string | null;
  cutoffAt?: string | null;
}): PhaseTimestamps {
  const timeZone = opts.club.timezone ?? "UTC";
  const start = lunchStartAt(opts.lunchDate, opts.startTime, timeZone);
  const committeeDays = opts.club.committee_priority_days ?? 2;
  const membersDays = opts.club.members_only_days ?? 14;
  const guestsDays = opts.club.guests_phase_days ?? 14;
  const cutoffDays = opts.club.signup_cutoff_days ?? 2;
  const cutoff = opts.cutoffAt
    ? new Date(opts.cutoffAt)
    : addClubDays(start, -cutoffDays, timeZone);

  if (opts.signupOpensAt) {
    const opens = new Date(opts.signupOpensAt);
    const members = addClubDays(opens, committeeDays, timeZone);
    const guests = addClubDays(members, membersDays, timeZone);
    return {
      signup_opens_at: opens.toISOString(),
      members_open_at: members.toISOString(),
      guests_open_at: guests.toISOString(),
      signup_cutoff_at: cutoff.toISOString(),
    };
  }

  const guests = addClubDays(cutoff, -guestsDays, timeZone);
  const members = addClubDays(guests, -membersDays, timeZone);
  const opens = addClubDays(members, -committeeDays, timeZone);
  return {
    signup_opens_at: opens.toISOString(),
    members_open_at: members.toISOString(),
    guests_open_at: guests.toISOString(),
    signup_cutoff_at: cutoff.toISOString(),
  };
}

/** Fill any missing lunch timestamps from club defaults (and a chosen opens/cutoff). */
export function fillMissingPhaseTimestamps(
  lunch: Pick<Lunch, "lunch_date" | "start_time"> &
    Partial<
      Pick<
        Lunch,
        | "signup_opens_at"
        | "members_open_at"
        | "guests_open_at"
        | "signup_cutoff_at"
      >
    >,
  club: PhaseDurations
): PhaseTimestamps {
  const computed = computePhaseTimestamps({
    lunchDate: lunch.lunch_date,
    startTime: lunch.start_time,
    club,
    signupOpensAt: lunch.signup_opens_at,
    cutoffAt: lunch.signup_cutoff_at,
  });
  return {
    signup_opens_at: lunch.signup_opens_at ?? computed.signup_opens_at,
    members_open_at: lunch.members_open_at ?? computed.members_open_at,
    guests_open_at: lunch.guests_open_at ?? computed.guests_open_at,
    signup_cutoff_at: lunch.signup_cutoff_at ?? computed.signup_cutoff_at,
  };
}

export function resolveSignupPhase(
  lunch: Pick<
    Lunch,
    | "status"
    | "signup_opens_at"
    | "members_open_at"
    | "guests_open_at"
    | "signup_cutoff_at"
  >,
  now: Date = new Date()
): SignupPhase {
  if (lunch.status === "draft") return "draft";
  if (lunch.status === "cancelled") return "cancelled";
  if (lunch.status === "completed") return "completed";

  const t = now.getTime();
  const cutoff = lunch.signup_cutoff_at
    ? new Date(lunch.signup_cutoff_at).getTime()
    : null;
  if (cutoff != null && t >= cutoff) return "closed";

  const opens = lunch.signup_opens_at
    ? new Date(lunch.signup_opens_at).getTime()
    : null;
  if (opens != null && t < opens) return "not_open";

  const membersOpen = lunch.members_open_at
    ? new Date(lunch.members_open_at).getTime()
    : null;
  if (membersOpen != null && t < membersOpen) return "committee";

  const guestsOpen = lunch.guests_open_at
    ? new Date(lunch.guests_open_at).getTime()
    : null;
  if (guestsOpen != null && t < guestsOpen) return "members";

  return "guests";
}

export function isUpcomingLunch(
  lunch: Pick<Lunch, "lunch_date">,
  timeZone: string,
  now: Date = new Date()
): boolean {
  return lunch.lunch_date >= todayInZone(timeZone, now);
}

/** Opened for signup and not yet at cutoff (committee-priority counts as open). */
export function isInOpenSignupWindow(
  lunch: Pick<
    Lunch,
    | "status"
    | "signup_opens_at"
    | "members_open_at"
    | "guests_open_at"
    | "signup_cutoff_at"
  >,
  now: Date = new Date()
): boolean {
  if (lunch.status !== "released") return false;
  const phase = resolveSignupPhase(lunch, now);
  return phase === "committee" || phase === "members" || phase === "guests";
}

export function compareLunchStart(
  a: Pick<Lunch, "lunch_date" | "start_time">,
  b: Pick<Lunch, "lunch_date" | "start_time">
): number {
  const byDate = a.lunch_date.localeCompare(b.lunch_date);
  if (byDate !== 0) return byDate;
  return a.start_time.localeCompare(b.start_time);
}

/** Soonest upcoming released lunch that has opened and not yet hit cutoff. */
export function findNextOpenLunch<T extends LunchPhaseFields>(
  lunches: T[],
  timeZone: string,
  now: Date = new Date()
): T | null {
  return (
    lunches
      .filter(
        (l) =>
          l.status === "released" &&
          isUpcomingLunch(l, timeZone, now) &&
          isInOpenSignupWindow(l, now)
      )
      .sort(compareLunchStart)[0] ?? null
  );
}

/** The lunch allows guests and its guest date has passed. Applies to committee too. */
export function guestsAllowedNow(lunch: Lunch, now: Date = new Date()): boolean {
  if (!guestPolicy(lunch).allowed) return false;
  return resolveSignupPhase(lunch, now) === "guests";
}

function guestsNotYetReason(lunch: Lunch, timeZone: string): string {
  return lunch.guests_open_at
    ? `Guests may be added from ${fmtDateTime(lunch.guests_open_at, timeZone)}`
    : "Guests may not be added yet";
}

export function validatePhaseOrder(ts: {
  signup_opens_at?: string | null;
  members_open_at?: string | null;
  guests_open_at?: string | null;
  signup_cutoff_at?: string | null;
}): string | null {
  const opens = ts.signup_opens_at ? new Date(ts.signup_opens_at).getTime() : null;
  const members = ts.members_open_at
    ? new Date(ts.members_open_at).getTime()
    : null;
  const guests = ts.guests_open_at ? new Date(ts.guests_open_at).getTime() : null;
  const cutoff = ts.signup_cutoff_at
    ? new Date(ts.signup_cutoff_at).getTime()
    : null;

  if (opens != null && members != null && opens > members) {
    return "Members open must be on or after sign-ups open";
  }
  if (members != null && guests != null && members > guests) {
    return "Guests open must be on or after members open";
  }
  if (guests != null && cutoff != null && guests > cutoff) {
    return "The cutoff must be on or after guests open";
  }
  if (opens != null && cutoff != null && opens > cutoff) {
    return "The cutoff must be on or after sign-ups open";
  }
  return null;
}

export function memberSignupBlockReason(opts: {
  lunch: Lunch;
  club: Club;
  isCommittee: boolean;
  nextOpenLunchId: string | null;
  guestCount?: number;
  now?: Date;
}): string | null {
  const now = opts.now ?? new Date();
  const phase = resolveSignupPhase(opts.lunch, now);
  const guestCount = opts.guestCount ?? 0;

  if (phase === "draft") return "Sign-ups are not open for this lunch";
  if (phase === "cancelled" || phase === "completed") {
    return "This lunch is no longer open";
  }
  if (phase === "closed") {
    return "The sign-up cutoff for this lunch has passed";
  }

  // Committee may add their own names early, but not guests.
  if (!opts.isCommittee) {
    if (phase === "not_open") {
      return opts.lunch.signup_opens_at
        ? `Sign-ups open ${fmtDateTime(opts.lunch.signup_opens_at, opts.club.timezone)}`
        : "Sign-ups are not yet open for this lunch";
    }

    if (opts.nextOpenLunchId && opts.lunch.id !== opts.nextOpenLunchId) {
      return "You may only add your name to the next luncheon that is currently open";
    }

    if (phase === "committee") {
      return opts.lunch.members_open_at
        ? `Committee priority until ${fmtDateTime(opts.lunch.members_open_at, opts.club.timezone)}`
        : "Committee priority is in effect";
    }
  }

  if (guestCount > 0) {
    if (!guestPolicy(opts.lunch).allowed) {
      return "Guests are not allowed for this lunch";
    }
    if (phase !== "guests") {
      return guestsNotYetReason(opts.lunch, opts.club.timezone);
    }
  }

  return null;
}

export function guestEditBlockReason(opts: {
  lunch: Lunch;
  club: Club;
  currentGuestCount: number;
  nextGuestCount: number;
  now?: Date;
}): string | null {
  const now = opts.now ?? new Date();
  const phase = resolveSignupPhase(opts.lunch, now);

  if (phase === "closed") {
    return "The sign-up cutoff for this lunch has passed";
  }
  if (phase === "draft" || phase === "cancelled" || phase === "completed") {
    return "Sign-ups are not open for this lunch";
  }

  if (opts.nextGuestCount < 0) return "Invalid guest count";

  const policy = guestPolicy(opts.lunch);
  if (opts.nextGuestCount > 0 && !policy.allowed) {
    return "Guests are not allowed for this lunch";
  }
  if (opts.nextGuestCount > policy.maxPerMember) {
    return `At most ${policy.maxPerMember} guest(s) per member`;
  }

  if (
    opts.nextGuestCount > opts.currentGuestCount &&
    !guestsAllowedNow(opts.lunch, now)
  ) {
    return guestsNotYetReason(opts.lunch, opts.club.timezone);
  }

  return null;
}

/** Short label for list/dashboard cards. */
export function lunchCardPhaseLabel(
  lunch: Lunch,
  timeZone: string,
  opts?: { isNextOpen?: boolean }
): string | null {
  const phase = resolveSignupPhase(lunch);
  const guestsAllowed = guestPolicy(lunch).allowed;
  switch (phase) {
    case "not_open":
      return lunch.signup_opens_at
        ? `Opens ${fmtDateShort(dateInZone(lunch.signup_opens_at, timeZone))}`
        : "Sign-ups not yet open";
    case "committee":
      return lunch.members_open_at
        ? `Committee priority until ${fmtDateShort(dateInZone(lunch.members_open_at, timeZone))}`
        : "Committee priority";
    case "members":
      return opts?.isNextOpen
        ? "Open for members"
        : "Members may add their names";
    case "guests":
      if (opts?.isNextOpen) {
        return guestsAllowed ? "Open — guests welcome" : "Open for sign-up";
      }
      return guestsAllowed ? "Guests may be added" : "The list is open";
    case "closed":
      return "The list is closed";
    default:
      return null;
  }
}

export function signupWindowCopy(
  lunch: Lunch,
  phase: SignupPhase,
  timeZone: string
): {
  title: string;
  detail: string;
} | null {
  const guestsAllowed = guestPolicy(lunch).allowed;
  switch (phase) {
    case "not_open":
      return {
        title: "The list is not yet open",
        detail: lunch.signup_opens_at
          ? `Sign-ups open ${fmtDateTime(lunch.signup_opens_at, timeZone)}.`
          : "The committee has not opened sign-ups for this luncheon.",
      };
    case "committee":
      return {
        title: "Committee priority",
        detail: lunch.members_open_at
          ? `Committee members may add their names first. The list opens to the membership on ${fmtDateTime(lunch.members_open_at, timeZone)}.`
          : "Committee members may add their names first.",
      };
    case "members":
      return {
        title: "Open to members",
        detail: !guestsAllowed
          ? "You may add your name. No guests at this luncheon."
          : lunch.guests_open_at
            ? `You may add your name. Guests from ${fmtDateTime(lunch.guests_open_at, timeZone)}.`
            : "You may add your name. Guests are not yet permitted.",
      };
    case "guests":
      return {
        title: guestsAllowed ? "Open, guests permitted" : "Open to members",
        detail: lunch.signup_cutoff_at
          ? `The list closes ${fmtDateTime(lunch.signup_cutoff_at, timeZone)}.`
          : guestsAllowed
            ? "Add guests if the table allows it."
            : "You may add your name. No guests at this luncheon.",
      };
    case "closed":
      return {
        title: "The list is closed",
        detail: lunch.signup_cutoff_at
          ? `Closed ${fmtDateTime(lunch.signup_cutoff_at, timeZone)}.`
          : "Write to the committee if you still wish to attend.",
      };
    default:
      return null;
  }
}
