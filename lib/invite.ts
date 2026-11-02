import { createAdminClient } from "@/lib/supabase/admin";
import { ActionError, ilikeExact } from "@/lib/action-helpers";
import { todayInZone } from "@/lib/format";
import type { Club, MemberRole } from "@/lib/types";

/**
 * Put a person on the roster. No email goes out: the committee welcomes new
 * members personally. A new person gets an account and stays "invited" until
 * they first sign in with an emailed code, which makes them active. Someone
 * with an account already (a member of another chapter) is active at once.
 * Joined on is today on the club's clock. Any guest record with the same
 * email is linked, so the lunches they came to as a guest stay in their
 * history. Runs with the service-role key.
 */
export async function inviteToClub(
  club: Club,
  person: {
    email: string;
    firstName: string;
    lastName: string;
    role: MemberRole;
    dietaryNotes?: string | null;
  }
) {
  const email = person.email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("memberships")
    .select("id, status")
    .eq("club_id", club.id)
    .ilike("email", ilikeExact(email))
    .maybeSingle();
  if (existing && existing.status !== "removed")
    throw new ActionError("That email is already on the roster");

  // New user → generating an invite link creates their account (the link
  // itself is not sent). Existing user (e.g. member of another chapter) →
  // activate immediately.
  let userId: string;
  let status: "invited" | "active" = "invited";

  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({ type: "invite", email });

  if (!linkErr && linkData) {
    userId = linkData.user.id;
  } else if (
    linkErr?.code === "email_exists" ||
    linkErr?.message.toLowerCase().includes("already")
  ) {
    const { data: page } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const found = page?.users.find((u) => u.email?.toLowerCase() === email);
    if (!found) throw new ActionError("Could not resolve the existing account");
    userId = found.id;
    status = "active";
  } else {
    throw new ActionError(linkErr?.message ?? "Could not create the invite");
  }

  const row = {
    club_id: club.id,
    user_id: userId,
    email,
    first_name: person.firstName,
    last_name: person.lastName,
    role: person.role,
    status,
    joined_on: todayInZone(club.timezone),
    ...(person.dietaryNotes ? { dietary_notes: person.dietaryNotes } : {}),
  };
  const { data: saved, error: memErr } = existing
    ? await admin.from("memberships").update(row).eq("id", existing.id).select("id").single()
    : await admin.from("memberships").insert(row).select("id").single();
  if (memErr || !saved) throw new ActionError(memErr?.message ?? "Could not save the member");

  const { error: linkGuestErr } = await admin
    .from("guests")
    .update({ membership_id: saved.id, upgraded_at: new Date().toISOString() })
    .eq("club_id", club.id)
    .eq("email", email)
    .is("membership_id", null);
  if (linkGuestErr) console.error("[invite] could not link guest record", linkGuestErr);

  return { membershipId: saved.id as string };
}
