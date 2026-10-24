"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCommittee, errorMessage } from "@/lib/action-helpers";
import { emailDef, unknownPlaceholders } from "@/lib/email-templates";
import type { FormState } from "./auth";

const LIMITS = { subject: 200, heading: 200, body: 5000 };

/**
 * Committee saves their wording for one email. Wording identical to the
 * default is not stored, so the email keeps following the defaults.
 */
export async function saveEmailTemplateAction(
  slug: string,
  key: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const ctx = await requireCommittee(slug);
    const def = emailDef(key);
    if (!def) return { error: "Unknown email" };

    const text = {
      subject: String(formData.get("subject") ?? "").trim(),
      heading: String(formData.get("heading") ?? "").trim(),
      body: String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim(),
    };
    if (!text.subject) return { error: "The subject can't be empty" };
    if (!text.body) return { error: "The body can't be empty" };
    for (const field of ["subject", "heading", "body"] as const) {
      if (text[field].length > LIMITS[field]) {
        return { error: `The ${field} is too long (at most ${LIMITS[field]} characters)` };
      }
      const unknown = unknownPlaceholders(def, text[field]);
      if (unknown.length) {
        return {
          error: `This email doesn't know ${unknown.map((u) => `{${u}}`).join(", ")}. Use the placeholders listed beside the editor.`,
        };
      }
    }

    const isDefault =
      text.subject === def.subject && text.heading === def.heading && text.body === def.body;
    const { error } = isDefault
      ? await ctx.supabase
          .from("email_templates")
          .delete()
          .eq("club_id", ctx.club.id)
          .eq("key", key)
      : await ctx.supabase.from("email_templates").upsert({
          club_id: ctx.club.id,
          key,
          ...text,
          updated_at: new Date().toISOString(),
          updated_by: ctx.membership.id,
        });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/c/${slug}/settings`);
  revalidatePath(`/c/${slug}/settings/emails/${key}`);
  return { success: true };
}

/** Committee goes back to the default wording for one email. */
export async function resetEmailTemplateAction(slug: string, key: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { error } = await ctx.supabase
      .from("email_templates")
      .delete()
      .eq("club_id", ctx.club.id)
      .eq("key", key);
    if (error) throw new Error(error.message);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(`/c/${slug}/settings`);
  revalidatePath(`/c/${slug}/settings/emails/${key}`);
  redirect(
    `/c/${slug}/settings/emails/${key}${err ? `?error=${encodeURIComponent(err)}` : ""}`
  );
}
