"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommittee, requireMember, errorMessage } from "@/lib/action-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { signInLinkUrl } from "@/lib/auth";
import { inviteToClub } from "@/lib/invite";
import type { FormState } from "./auth";

export type SignInLinkState = { error?: string; link?: string };

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  role: z.enum(["member", "committee"]),
});

/** Committee adds a person by email. No email goes out; they sign in with an emailed code. */
export async function inviteMemberAction(
  slug: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const { club } = await requireCommittee(slug);
    const parsed = inviteSchema.safeParse({
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      role: formData.get("role") ?? "member",
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    await inviteToClub(club, parsed.data);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/c/${slug}/members`);
  return {};
}

const editSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  phone: z.string().max(40).optional(),
  dietary: z.string().max(500).optional(),
  function: z.string().trim().max(80).optional(),
  comments: z.string().trim().max(2000).optional(),
  role: z.enum(["member", "committee"]),
  status: z.enum(["invited", "active", "resigned", "lapsed", "removed"]),
  joinedOn: z.string().optional(),
});

/** Committee edits a member's details, role, hats and status. */
export async function updateMemberAction(
  slug: string,
  membershipId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const { club, supabase, membership: me } = await requireCommittee(slug);
    const parsed = editSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: String(formData.get("phone") ?? ""),
      dietary: String(formData.get("dietary") ?? ""),
      function: String(formData.get("function") ?? ""),
      comments: String(formData.get("comments") ?? ""),
      role: formData.get("role"),
      status: formData.get("status"),
      joinedOn: String(formData.get("joinedOn") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;

    if (me.id === membershipId && d.role !== "committee")
      return { error: "You can't demote yourself. Ask another committee member." };

    // Members are never hard-deleted: status change only.
    const { error } = await supabase
      .from("memberships")
      .update({
        first_name: d.firstName,
        last_name: d.lastName,
        phone: d.phone || null,
        dietary_notes: d.dietary || null,
        function: d.function || null,
        comments: d.comments || null,
        role: d.role,
        status: d.status,
        ...(d.joinedOn ? { joined_on: d.joinedOn } : {}),
      })
      .eq("id", membershipId)
      .eq("club_id", club.id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/c/${slug}/members`);
  redirect(`/c/${slug}/members`);
}

/**
 * A one-time sign-in link for a member whose sign-in email doesn't arrive,
 * for the committee to send them another way. It is the same link as in the
 * sign-in email, and like a new code it replaces any code or link sent before.
 */
export async function createSignInLinkAction(
  slug: string,
  membershipId: string,
  _prev: SignInLinkState,
  _formData: FormData
): Promise<SignInLinkState> {
  try {
    const { club, supabase, membership: me } = await requireCommittee(slug);
    const { data: member, error } = await supabase
      .from("memberships")
      .select("user_id, status")
      .eq("id", membershipId)
      .eq("club_id", club.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!member?.user_id || !["active", "invited"].includes(member.status))
      return { error: "Only active and invited members can get a sign-in link." };

    const admin = createAdminClient();
    const { data: found, error: userErr } = await admin.auth.admin.getUserById(
      member.user_id
    );
    const email = found?.user?.email;
    if (userErr || !email) return { error: "This member has no account to sign in to." };

    // The account's own email: for any other address generateLink would
    // create a new account.
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !data) {
      console.error("[auth] could not create a sign-in link", linkErr);
      return { error: "Could not create a sign-in link. Try again." };
    }
    console.info(
      `[auth] committee membership ${me.id} created a sign-in link for membership ${membershipId}`
    );
    return { link: signInLinkUrl(data.properties.hashed_token, "/") };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Member edits their own profile (via SECURITY DEFINER function). */
export async function updateMyProfileAction(
  slug: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const { supabase, club } = await requireMember(slug);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    if (!firstName || !lastName) return { error: "Your name is required" };
    const { error } = await supabase.rpc("update_my_profile", {
      p_club: club.id,
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: String(formData.get("phone") ?? "").trim() || null,
      p_dietary_notes: String(formData.get("dietary") ?? "").trim() || null,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/c/${slug}/profile`);
  return { success: true };
}
