export type MemberRole = "member" | "committee";
export type MembershipStatus =
  | "invited"
  | "active"
  | "resigned"
  | "lapsed"
  | "removed";
export type VenueStatus =
  | "candidate"
  | "tasting"
  | "approved"
  | "rejected"
  | "archived";
export type TastingOutcome = "pending" | "go" | "no_go";
export type LunchStatus = "draft" | "released" | "completed" | "cancelled";
export type SignupStatus = "confirmed" | "waitlisted" | "cancelled";
export type WineSource = "cellar" | "restaurant";
export type LunchCritiqueRole = "food_1" | "food_2" | "wine_1" | "wine_2";

export interface Club {
  id: string;
  name: string;
  slug: string;
  guests_allowed: boolean;
  max_guests_per_member: number;
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
  wine_master: boolean;
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

export interface Tasting {
  id: string;
  club_id: string;
  venue_id: string;
  tasting_date: string | null;
  feedback: string | null;
  outcome: TastingOutcome;
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

export interface Wine {
  id: string;
  club_id: string;
  name: string;
  vintage: string | null;
  source: WineSource;
  notes: string | null;
  created_at: string;
}

export interface LunchWine {
  id: string;
  club_id: string;
  lunch_id: string;
  wine_id: string;
  pairing_notes: string | null;
  created_at: string;
}

export interface LunchRole {
  id: string;
  club_id: string;
  lunch_id: string;
  role: LunchCritiqueRole;
  membership_id: string;
  assigned_by: string | null;
  assigned_at: string;
  notified_at: string | null;
}

/** Row returned by waitlist-promoting SQL functions. */
export interface PromotedMember {
  membership_id: string;
  email: string;
  full_name: string;
}

/** Effective guest policy for a lunch (lunch override falls back to club). */
export function guestPolicy(club: Club, lunch: Lunch) {
  return {
    allowed: lunch.guests_allowed ?? club.guests_allowed,
    maxPerMember: lunch.max_guests_per_member ?? club.max_guests_per_member,
  };
}

export function seatsTaken(signups: Pick<Signup, "status" | "guest_count">[]) {
  return signups
    .filter((s) => s.status === "confirmed")
    .reduce((sum, s) => sum + 1 + s.guest_count, 0);
}
