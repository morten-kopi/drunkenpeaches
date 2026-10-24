import { createClient } from "@/lib/supabase/server";
import type { Club, Membership } from "@/lib/types";

export class ActionError extends Error {}

/** Auth context for server actions. Throws ActionError instead of redirecting. */
export async function requireMember(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ActionError("You are not signed in");

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!club) throw new ActionError("Club not found");

  const { data: membership } = await supabase
    .from("memberships")
    .select("*")
    .eq("club_id", club.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();
  if (!membership) throw new ActionError("You are not an active member of this club");

  return {
    supabase,
    user,
    club: club as Club,
    membership: membership as Membership,
  };
}

export async function requireCommittee(slug: string) {
  const ctx = await requireMember(slug);
  if (ctx.membership.role !== "committee")
    throw new ActionError("Committee only");
  return ctx;
}

export function errorMessage(e: unknown) {
  if (e instanceof Error) {
    // Don't swallow Next's control-flow errors (redirect/notFound).
    if ("digest" in e && typeof e.digest === "string" && e.digest.startsWith("NEXT_"))
      throw e;
    return e.message;
  }
  return "Something went wrong";
}

/**
 * A value for PostgREST's ilike that matches exactly, ignoring case: % and _
 * are literal. Some imported member emails have capitals.
 */
export function ilikeExact(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
