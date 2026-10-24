"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommittee, errorMessage, ilikeExact } from "@/lib/action-helpers";
import { inviteToClub } from "@/lib/invite";
import type { Guest } from "@/lib/types";
import type { FormState } from "./auth";

const guestSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  dietary: z.string().trim().max(500).optional(),
});

/** Committee corrects a guest's name, email or dietary notes. */
export async function updateGuestAction(
  slug: string,
  guestId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const { club, supabase } = await requireCommittee(slug);
    const parsed = guestSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      dietary: String(formData.get("dietary") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;

    const { data: member } = await supabase
      .from("memberships")
      .select("id")
      .eq("club_id", club.id)
      .ilike("email", ilikeExact(d.email))
      .in("status", ["active", "invited"])
      .maybeSingle();
    if (member) return { error: "That email belongs to a member" };

    const { error } = await supabase
      .from("guests")
      .update({
        first_name: d.firstName,
        last_name: d.lastName,
        email: d.email,
        dietary_notes: d.dietary || null,
      })
      .eq("id", guestId)
      .eq("club_id", club.id);
    if (error) {
      return {
        error: error.code === "23505" ? "Another guest already has that email" : error.message,
      };
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/c/${slug}/members/guests`);
  revalidatePath(`/c/${slug}/members/guests/${guestId}`);
  return { success: true };
}

/**
 * Committee makes a guest a member: their member account is created with
 * today as the joining date, the invite email goes out, and the guest
 * record links to the membership so their guest lunches stay in the history.
 */
export async function upgradeGuestAction(slug: string, guestId: string) {
  let err: string | null = null;
  let membershipId: string | null = null;
  try {
    const { club, supabase } = await requireCommittee(slug);
    const { data } = await supabase
      .from("guests")
      .select("*")
      .eq("id", guestId)
      .eq("club_id", club.id)
      .single();
    const guest = data as Guest | null;
    if (!guest) throw new Error("Guest not found");
    if (guest.membership_id) throw new Error(`${guest.full_name} is already a member`);

    ({ membershipId } = await inviteToClub(club, {
      email: guest.email,
      firstName: guest.first_name,
      lastName: guest.last_name,
      role: "member",
      dietaryNotes: guest.dietary_notes,
    }));
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(`/c/${slug}/members`);
  revalidatePath(`/c/${slug}/members/guests`);
  if (err || !membershipId) {
    redirect(
      `/c/${slug}/members/guests/${guestId}?error=${encodeURIComponent(err ?? "Could not make them a member")}`
    );
  }
  redirect(`/c/${slug}/members/${membershipId}`);
}
