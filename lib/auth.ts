import { createAdminClient } from "@/lib/supabase/admin";
import { ilikeExact } from "@/lib/action-helpers";

/**
 * A path inside this app to go to after signing in. Anything else (a full
 * URL, "//host", "/\host") falls back to the home page, so a crafted link
 * can't send a member to another site.
 */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return "/";
  return next;
}

/**
 * Turns invited memberships for this email into active ones, linked to the
 * signed-in account. Runs after every email sign-in (invite link, sign-in
 * link or code), so an invited member who signs in with a code is let in
 * the same way as one who opens the invite. Returns how many it activated.
 */
export async function activateInvitedMemberships(userId: string, email: string) {
  const { data, error } = await createAdminClient()
    .from("memberships")
    .update({ user_id: userId, status: "active" })
    .ilike("email", ilikeExact(email))
    .eq("status", "invited")
    .select("id");
  if (error) {
    console.error("[auth] could not activate invited memberships", error);
    return 0;
  }
  return data?.length ?? 0;
}
