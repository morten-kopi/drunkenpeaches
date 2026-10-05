"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommittee, errorMessage } from "@/lib/action-helpers";
import type { Venue } from "@/lib/types";
import type { FormState } from "./auth";

/** Create returns the new venue so the lunch form can select it. */
export type VenueFormState = FormState & {
  venue?: Pick<Venue, "id" | "name" | "default_capacity">;
};

const venueSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  address: z.string().max(300).optional(),
  contact: z.string().max(200).optional(),
  defaultCapacity: z.coerce.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
});

function venuesPath(slug: string, id?: string) {
  return id ? `/c/${slug}/venues/${id}` : `/c/${slug}/venues`;
}

export async function createVenueAction(
  slug: string,
  _prev: VenueFormState,
  formData: FormData
): Promise<VenueFormState> {
  let venue: VenueFormState["venue"];
  try {
    const ctx = await requireCommittee(slug);
    const parsed = venueSchema.safeParse({
      name: formData.get("name"),
      address: String(formData.get("address") ?? ""),
      contact: String(formData.get("contact") ?? ""),
      defaultCapacity: formData.get("defaultCapacity") || undefined,
      notes: String(formData.get("notes") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;
    const { data, error } = await ctx.supabase
      .from("venues")
      .insert({
        club_id: ctx.club.id,
        name: d.name,
        address: d.address || null,
        contact: d.contact || null,
        default_capacity: d.defaultCapacity ?? null,
        notes: d.notes || null,
        status: "approved",
      })
      .select("id, name, default_capacity")
      .single();
    if (error) return { error: error.message };
    venue = data;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(venuesPath(slug));
  return { venue };
}

export async function updateVenueAction(
  slug: string,
  venueId: string,
  _prev: VenueFormState,
  formData: FormData
): Promise<VenueFormState> {
  try {
    const ctx = await requireCommittee(slug);
    const parsed = venueSchema.safeParse({
      name: formData.get("name"),
      address: String(formData.get("address") ?? ""),
      contact: String(formData.get("contact") ?? ""),
      defaultCapacity: formData.get("defaultCapacity") || undefined,
      notes: String(formData.get("notes") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const d = parsed.data;
    const { error } = await ctx.supabase
      .from("venues")
      .update({
        name: d.name,
        address: d.address || null,
        contact: d.contact || null,
        default_capacity: d.defaultCapacity ?? null,
        notes: d.notes || null,
      })
      .eq("id", venueId);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(venuesPath(slug));
  revalidatePath(venuesPath(slug, venueId));
  return {};
}

/** Bring an archived venue back into the list. */
export async function restoreVenueAction(slug: string, venueId: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { error } = await ctx.supabase
      .from("venues")
      .update({ status: "approved" })
      .eq("id", venueId);
    if (error) throw new Error(error.message);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(venuesPath(slug));
  revalidatePath(venuesPath(slug, venueId));
  if (err) redirect(`${venuesPath(slug, venueId)}?error=${encodeURIComponent(err)}`);
}

export async function deleteVenueAction(slug: string, venueId: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    // Deleting would null lunches.venue_id and lose where past lunches were
    // held, so a venue with lunches is archived instead.
    const { count } = await ctx.supabase
      .from("lunches")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId);
    if (count && count > 0) {
      await ctx.supabase
        .from("venues")
        .update({ status: "archived" })
        .eq("id", venueId);
    } else {
      const { error } = await ctx.supabase
        .from("venues")
        .delete()
        .eq("id", venueId);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(venuesPath(slug));
  if (err) redirect(`${venuesPath(slug)}?error=${encodeURIComponent(err)}`);
  redirect(venuesPath(slug));
}
