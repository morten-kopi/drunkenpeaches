"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/action-helpers";
import { sendPasswordResetEmail } from "@/lib/email";
import { canonicalTimeZone, slugify } from "@/lib/format";

export type FormState = { error?: string; success?: boolean };

const signupSchema = z.object({
  clubName: z.string().min(2, "Club name is too short").max(80),
  firstName: z.string().trim().min(1, "Your first name is required").max(80),
  lastName: z.string().trim().min(1, "Your last name is required").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Self-serve club signup: creates the auth user, the club (tenant) and the
 * first committee membership, then signs the creator in.
 */
export async function createClubAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  let slug: string;
  try {
    const parsed = signupSchema.safeParse({
      clubName: formData.get("clubName"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success)
      return { error: parsed.error.issues[0].message };
    const { clubName, firstName, lastName, email, password } = parsed.data;

    const admin = createAdminClient();

    // 1. Create the auth user.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr) {
      if (
        createErr.message.toLowerCase().includes("already") ||
        createErr.code === "email_exists"
      ) {
        return {
          error:
            "An account with this email already exists. Log in first, then create the club from there — or use a different email.",
        };
      }
      return { error: createErr.message };
    }
    const userId = created.user.id;

    // 2. Unique slug.
    slug = slugify(clubName) || "club";
    const { data: clashes } = await admin
      .from("clubs")
      .select("slug")
      .like("slug", `${slug}%`);
    if (clashes?.some((c) => c.slug === slug)) {
      let n = 2;
      while (clashes.some((c) => c.slug === `${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }

    // 3. Club + first committee membership.
    const { data: club, error: clubErr } = await admin
      .from("clubs")
      .insert({
        name: clubName,
        slug,
        timezone:
          canonicalTimeZone(String(formData.get("timezone") ?? "")) ?? "UTC",
      })
      .select()
      .single();
    if (clubErr) {
      await admin.auth.admin.deleteUser(userId);
      return { error: clubErr.message };
    }

    const { error: memErr } = await admin.from("memberships").insert({
      club_id: club.id,
      user_id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role: "committee",
      status: "active",
    });
    if (memErr) return { error: memErr.message };

    // 4. Sign them in (sets session cookies).
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) return { error: signInErr.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/c/${slug}/dashboard`);
}

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "") || "/";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password" };
  redirect(next);
}

/**
 * Sends a password-reset link via Resend. Always reports success so the form
 * can't be used to probe which emails have accounts.
 */
export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter a valid email" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (!error && data) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const resetLink = `${appUrl}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/auth/reset-password")}`;
      await sendPasswordResetEmail({ to: email, resetLink });
    }
  } catch (e) {
    console.error("password reset failed", e);
  }
  return { success: true };
}

/** Signed-in user (via a recovery link) chooses a new password. */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { error: "Your reset link has expired — request a new one" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  try {
    await clearTemporaryPassword(user);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/");
}

/**
 * Imported members start on a temporary password and are held on the
 * set-password page (see lib/supabase/middleware.ts) until they choose one.
 */
async function clearTemporaryPassword(user: User) {
  if (!user.app_metadata?.must_change_password) return;
  const { error } = await createAdminClient().auth.admin.updateUserById(
    user.id,
    { app_metadata: { must_change_password: false } }
  );
  if (error) throw error;
}

/**
 * Invited or imported member finishing onboarding: sets their password and
 * completes their profile on every membership linked to their account.
 */
export async function completeProfileAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const dietary = String(formData.get("dietary") ?? "").trim() || null;

  if (password.length < 8)
    return { error: "Password must be at least 8 characters" };
  if (!firstName || !lastName) return { error: "Your name is required" };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return { error: "Your session has expired — open the invite link again" };

    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) return { error: pwErr.message };

    const admin = createAdminClient();
    const { error: profErr } = await admin
      .from("memberships")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        dietary_notes: dietary,
      })
      .eq("user_id", user.id);
    if (profErr) return { error: profErr.message };

    await clearTemporaryPassword(user);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/");
}
