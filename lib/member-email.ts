import { createAdminClient } from "@/lib/supabase/admin";
import { ActionError, ilikeExact } from "@/lib/action-helpers";
import type { Club } from "@/lib/types";

/**
 * Changes a member's email in both places it is kept: their account, which
 * they sign in with, and the roster, which club emails go to. The two have
 * to match, or sign-in codes stop going out. The account is set directly, so
 * Supabase sends no confirmation emails, and the member's password and
 * signed-in devices keep working. Every membership of the account is
 * updated, in any club, since they share the one login. Runs with the
 * service-role key.
 */
export async function changeMemberEmail(
  club: Club,
  member: { id: string; userId: string | null; email: string },
  newEmail: string
) {
  const email = newEmail.trim().toLowerCase();
  if (email === member.email.trim().toLowerCase()) return;
  const admin = createAdminClient();

  const { data: taken, error: takenErr } = await admin
    .from("memberships")
    .select("id")
    .eq("club_id", club.id)
    .ilike("email", ilikeExact(email))
    .neq("id", member.id)
    .limit(1);
  if (takenErr) throw new ActionError(takenErr.message);
  if (taken?.length) throw new ActionError("That email is already on the roster");

  // The account's address before the change, to put back if the roster
  // update fails.
  let previous: string | null = null;
  if (member.userId) {
    const { data: found, error } = await admin.auth.admin.getUserById(member.userId);
    if (error || !found.user) throw new ActionError("Could not find this member's account");
    if (found.user.email?.toLowerCase() !== email) {
      const { error: updateErr } = await admin.auth.admin.updateUserById(member.userId, {
        email,
        email_confirm: true,
      });
      if (updateErr) {
        if (updateErr.code === "email_exists" || /already/i.test(updateErr.message))
          throw new ActionError("Another account already uses that email");
        console.error("[auth] could not change an account's email", updateErr);
        throw new ActionError("Could not change the email. Try again.");
      }
      previous = found.user.email ?? null;
    }
  }

  const rows = admin.from("memberships").update({ email });
  const { error: rosterErr } = member.userId
    ? await rows.eq("user_id", member.userId)
    : await rows.eq("id", member.id);
  if (rosterErr) {
    if (member.userId && previous) {
      const { error: undoErr } = await admin.auth.admin.updateUserById(member.userId, {
        email: previous,
        email_confirm: true,
      });
      if (undoErr)
        console.error(
          `[auth] membership ${member.id}: account email changed but roster not; could not undo`,
          undoErr
        );
    }
    throw new ActionError(
      rosterErr.code === "23505" ? "That email is already on the roster" : rosterErr.message
    );
  }
}
