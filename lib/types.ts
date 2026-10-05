export type MemberRole = "member" | "committee";
export type MembershipStatus =
  | "invited"
  | "active"
  | "resigned"
  | "lapsed"
  | "removed";
/**
 * The venue_status enum still holds the old pipeline values (candidate,
 * tasting, rejected); migration 00006 moved every venue to one of these two.
 */
export type VenueStatus = "approved" | "archived";
export type LunchStatus = "draft" | "released" | "completed" | "cancelled";
export type SignupStatus = "confirmed" | "waitlisted" | "cancelled";

export interface Club {
  id: string;
  name: string;
  slug: string;
  signup_cutoff_days: number;
  /** Days after signup_opens_at before all members may sign up. */
  committee_priority_days: number;
  /** Days after members_open_at before guests may be added. */
  members_only_days: number;
  /** Days after guests_open_at until the existing signup cutoff. */
  guests_phase_days: number;
  /** IANA zone that lunch dates, start times and windows are read in. */
  timezone: string;
  created_at: string;
}

export interface Membership {
  id: string;
  club_id: string;
  user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  /** Derived in Postgres from first_name and last_name; read-only. */
  full_name: string;
  phone: string | null;
  dietary_notes: string | null;
  /** Free-text club office, e.g. President. Separate from role. */
  function: string | null;
  /** Committee notes on the membership. */
  comments: string | null;
  role: MemberRole;
  status: MembershipStatus;
  joined_on: string;
  created_at: string;
}

export interface Venue {
  id: string;
  club_id: string;
  name: string;
  address: string | null;
  contact: string | null;
  default_capacity: number | null;
  notes: string | null;
  status: VenueStatus;
  created_at: string;
}

export interface Lunch {
  id: string;
  club_id: string;
  venue_id: string | null;
  title: string;
  lunch_date: string;
  start_time: string;
  capacity: number;
  status: LunchStatus;
  signup_opens_at: string | null;
  members_open_at: string | null;
  guests_open_at: string | null;
  signup_cutoff_at: string | null;
  /** Decided per lunch. Null only on a lunch saved before that rule; read as no. */
  guests_allowed: boolean | null;
  max_guests_per_member: number | null;
  notes: string | null;
  released_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface Signup {
  id: string;
  club_id: string;
  lunch_id: string;
  membership_id: string;
  status: SignupStatus;
  guest_count: number;
  guest_names: string | null;
  added_by_committee: boolean;
  attended: boolean | null;
  created_at: string;
  cancelled_at: string | null;
}

/** Row returned by waitlist-promoting SQL functions. */
export interface PromotedMember {
  membership_id: string;
  email: string;
  full_name: string;
}

/** Guest policy for a lunch. Each lunch decides; there is no club default. */
export function guestPolicy(
  lunch: Pick<Lunch, "guests_allowed" | "max_guests_per_member">
) {
  const allowed = lunch.guests_allowed === true;
  return {
    allowed,
    maxPerMember: allowed ? (lunch.max_guests_per_member ?? 0) : 0,
  };
}

export function seatsTaken(signups: Pick<Signup, "status" | "guest_count">[]) {
  return signups
    .filter((s) => s.status === "confirmed")
    .reduce((sum, s) => sum + 1 + s.guest_count, 0);
}
