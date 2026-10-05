"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCommittee, requireMember, errorMessage } from "@/lib/action-helpers";
import { sendInviteEmail } from "@/lib/email";
import type { FormState } from "./auth";

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  role: z.enum(["member", "committee"]),
});

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Committee adds a person by email; the system sends an invite via Resend. */
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
    const { email, firstName, lastName, role } = parsed.data;

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("memberships")
      .select("id, status")
      .eq("club_id", club.id)
      .eq("email", email)
      .maybeSingle();
    if (existing && existing.status !== "removed")
      return { error: "That email is already on the roster" };

    // New user → Supabase invite link (sent via Resend, not Supabase email).
    // Existing user (e.g. member of another chapter) → activate immediately.
    let inviteLink: string | null = null;
    let userId: string | null = null;
    let status: "invited" | "active" = "invited";

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({ type: "invite", email });

    if (!linkErr && linkData) {
      userId = linkData.user.id;
      inviteLink = `${appUrl()}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=invite&next=${encodeURIComponent("/auth/set-password")}`;
    } else if (
      linkErr?.code === "email_exists" ||
      linkErr?.message.toLowerCase().includes("already")
    ) {
      const { data: page } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const found = page?.users.find(
        (u) => u.email?.toLowerCase() === email
      );
      if (!found) return { error: "Could not resolve the existing account" };
      userId = found.id;
      status = "active";
      inviteLink = `${appUrl()}/login`;
    } else {
      return { error: linkErr?.message ?? "Could not create the invite" };
    }

    const row = {
      club_id: club.id,
      user_id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      status,
    };
    const { error: memErr } = existing
      ? await admin.from("memberships").update(row).eq("id", existing.id)
      : await admin.from("memberships").insert(row);
    if (memErr) return { error: memErr.message };

    await sendInviteEmail({ to: email, clubName: club.name, inviteLink });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/c/${slug}/members`);
  return {};
}

/** Re-send the invite email to someone who hasn't accepted yet. */
export async function resendInviteAction(slug: string, membershipId: string) {
  let err: string | null = null;
  try {
    const { club } = await requireCommittee(slug);
    const admin = createAdminClient();
    const { data: m } = await admin
      .from("memberships")
      .select("email, status")
      .eq("id", membershipId)
      .eq("club_id", club.id)
      .single();
    if (!m || m.status !== "invited") throw new Error("No pending invite for that member");

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({ type: "invite", email: m.email });
    // "invite" links can only be generated once per user; fall back to magiclink.
    const props = linkErr
      ? (await admin.auth.admin.generateLink({ type: "magiclink", email: m.email })).data
          ?.properties
      : linkData.properties;
    if (!props) throw new Error("Could not generate an invite link");

    const inviteLink = `${appUrl()}/auth/confirm?token_hash=${props.hashed_token}&type=${linkErr ? "magiclink" : "invite"}&next=${encodeURIComponent("/auth/set-password")}`;
    await sendInviteEmail({ to: m.email, clubName: club.name, inviteLink });
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(`/c/${slug}/members`);
  if (err) redirect(`/c/${slug}/members?error=${encodeURIComponent(err)}`);
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
      return { error: "You can't demote yourself — ask another committee member" };

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
