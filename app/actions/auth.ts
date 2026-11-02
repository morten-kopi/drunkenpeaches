"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage, ilikeExact } from "@/lib/action-helpers";
import { activateInvitedMemberships, safeNext } from "@/lib/auth";
import { sendPasswordResetEmail, sendSignInCodeEmail } from "@/lib/email";

export type FormState = { error?: string; success?: boolean };
export type SendCodeState = FormState & { sent?: boolean; email?: string };

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** One sign-in email per address per minute. The sign-in form counts down the same. */
const RESEND_AFTER_MS = 60_000;

function readEmail(formData: FormData) {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

/**
 * Where to go once signed in. A member who was invited and has just joined
 * sees the welcome page first, unless the link was for somewhere specific.
 */
function afterSignIn(next: string, joined: number) {
  return joined && next === "/" ? "/auth/set-password" : next;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password." };
  redirect(safeNext(String(formData.get("next") ?? "")));
}

/**
 * Emails a sign-in code and a sign-in link to a member. Always reports that
 * the code is on its way, so the form can't be used to find out who is a
 * member.
 */
export async function sendSignInCodeAction(
  _prev: SendCodeState,
  formData: FormData
): Promise<SendCodeState> {
  const email = readEmail(formData);
  if (!email.includes("@")) return { error: "Enter a valid email" };

  try {
    await emailSignInCode(email, safeNext(String(formData.get("next") ?? "")));
  } catch (e) {
    console.error("[auth] sign-in code failed", e);
  }
  return { sent: true, email };
}

async function emailSignInCode(email: string, next: string) {
  const admin = createAdminClient();

  // Members only: for an email Supabase doesn't know, generateLink would
  // create a new account.
  const { data: memberships, error } = await admin
    .from("memberships")
    .select("user_id, clubs(name)")
    .ilike("email", ilikeExact(email))
    .in("status", ["active", "invited"])
    .not("user_id", "is", null)
    .limit(1);
  if (error) throw error;
  const membership = memberships?.[0];
  if (!membership) return;

  const { data: found, error: userErr } = await admin.auth.admin.getUserById(
    membership.user_id
  );
  if (userErr || !found.user) throw userErr ?? new Error("No account for membership");
  const user = found.user;
  if (user.email?.toLowerCase() !== email) {
    console.error(`[auth] ${email} is on the roster but its account has another email; no code sent`);
    return;
  }
  // Supabase stamps recovery_sent_at whenever it issues a sign-in or reset link.
  const lastSent = Date.parse(user.recovery_sent_at ?? "");
  if (Date.now() - lastSent < RESEND_AFTER_MS) return;

  const { data, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !data) throw linkErr ?? new Error("Could not create a sign-in link");

  const club = membership.clubs as unknown as { name: string } | null;
  await sendSignInCodeEmail({
    to: email,
    code: data.properties.email_otp,
    link: `${appUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`,
    clubName: club?.name,
  });
}

/** Signs in with the code from the sign-in email. */
export async function verifySignInCodeAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = readEmail(formData);
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(code)) return { error: "Enter the code from the email." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error?.status === 429)
    return { error: "Too many tries. Wait a few minutes and try again." };
  if (error || !data.user)
    return {
      error: "That code didn't work. Use the code from the newest email, or send a new one.",
    };

  const joined = await activateInvitedMemberships(data.user.id, email);
  redirect(afterSignIn(safeNext(String(formData.get("next") ?? "")), joined));
}

/**
 * Finishes an emailed link (invite, sign-in or password reset). The link
 * opens a page with a button that calls this, rather than signing in the
 * moment it's opened: mail filters open links to scan them, which would use
 * up a one-time link before the member clicks it.
 */
export async function confirmLinkAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const next = safeNext(String(formData.get("next") ?? ""));

  let user: User | null = null;
  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) user = data.user;
  }
  if (!user) {
    if (type === "invite")
      return {
        error:
          "This invitation link has expired or was already used. Enter your email on the sign-in page and we'll send you a code.",
      };
    if (type === "recovery")
      return { error: "This reset link has expired or was already used. Ask for a new one." };
    return {
      error: "This sign-in link has expired or was already used. Ask for a new code on the sign-in page.",
    };
  }

  const joined = user.email ? await activateInvitedMemberships(user.id, user.email) : 0;
  redirect(afterSignIn(next, joined));
}

/**
 * Sends a password-reset link via Resend. Always reports success so the form
 * can't be used to probe which emails have accounts.
 */
export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = readEmail(formData);
  if (!email.includes("@")) return { error: "Enter a valid email" };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (!error && data) {
      const resetLink = `${appUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent("/auth/reset-password")}`;
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
    return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  try {
    await clearTemporaryPassword(user);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/");
}

/** A signed-in member sets or changes their password from their profile. */
export async function setPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters" };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You are not signed in" };

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    await clearTemporaryPassword(user);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { success: true };
}

/**
 * Imported members start on a temporary password, flagged in app_metadata.
 * The flag is cleared once they choose their own, so it shows who is still
 * on the one they were given. Nothing forces the change: they can keep it,
 * or sign in with emailed codes instead.
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
 * Invited member finishing onboarding: checks their profile on every
 * membership linked to their account, and sets a password if they want one.
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

  if (password && password.length < 8)
    return { error: "Password must be at least 8 characters" };
  if (!firstName || !lastName) return { error: "Your name is required" };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return { error: "Your session has expired. Open the invite link again." };

    if (password) {
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) return { error: pwErr.message };
      await clearTemporaryPassword(user);
    }

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
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/");
}
