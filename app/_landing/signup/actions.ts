"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/action-helpers";
import { canonicalTimeZone, slugify } from "@/lib/format";
import type { FormState } from "@/app/actions/auth";

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
