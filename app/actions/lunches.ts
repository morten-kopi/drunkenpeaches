"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  requireCommittee,
  requireMember,
  errorMessage,
} from "@/lib/action-helpers";
import {
  sendSignupConfirmed,
  sendWaitlisted,
  sendPromoted,
  sendLunchCancelled,
  sendLunchChanged,
} from "@/lib/email";
import {
  fillMissingPhaseTimestamps,
  findNextOpenLunch,
  fromDatetimeLocalValue,
  guestEditBlockReason,
  memberSignupBlockReason,
  validatePhaseOrder,
} from "@/lib/signup-phases";
import { todayInZone } from "@/lib/format";
import type { Club, Lunch, PromotedMember } from "@/lib/types";

// ---------- helpers ----------------------------------------------------------

type Ctx = Awaited<ReturnType<typeof requireMember>>;

async function getLunchForEmail(ctx: Ctx, lunchId: string) {
  const { data } = await ctx.supabase
    .from("lunches")
    .select("*, venues(name)")
    .eq("id", lunchId)
    .single();
  const lunch = data as (Lunch & { venues: { name: string } | null }) | null;
  return lunch;
}

async function notifyPromoted(
  ctx: Ctx,
  lunchId: string,
  promoted: PromotedMember[] | null
) {
  if (!promoted?.length) return;
  const lunch = await getLunchForEmail(ctx, lunchId);
  if (!lunch) return;
  await Promise.all(
    promoted.map((p) =>
      sendPromoted({
        to: p.email,
        name: p.full_name,
        clubName: ctx.club.name,
        lunchTitle: lunch.title,
        lunchDate: lunch.lunch_date,
        venueName: lunch.venues?.name,
      })
    )
  );
}

function lunchPath(slug: string, id?: string) {
  return id ? `/c/${slug}/lunches/${id}` : `/c/${slug}/lunches`;
}

// ---------- committee: lunch lifecycle ---------------------------------------

const lunchSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  venueId: z.string().uuid().optional().or(z.literal("")),
  lunchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}/, "Pick a time"),
  capacity: z.coerce.number().int().min(0, "Capacity must be 0 or more"),
  signupOpensAt: z.string().optional(),
  membersOpenAt: z.string().optional(),
  guestsOpenAt: z.string().optional(),
  cutoffAt: z.string().optional(),
  guestsMode: z.enum(["yes", "no"], {
    message: "Decide whether guests are allowed",
  }),
  maxGuests: z.coerce
    .number()
    .int()
    .min(1, "Allow at least 1 guest per member")
    .max(10, "At most 10 guests per member")
    .optional(),
  notes: z.string().max(2000).optional(),
});

function parseOptionalIso(
  raw: string | undefined,
  label: string,
  timeZone: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, value: null };
  const iso = fromDatetimeLocalValue(s, timeZone);
  if (!iso) return { ok: false, error: `Invalid ${label}` };
  return { ok: true, value: iso };
}

function parseLunchForm(formData: FormData, club: Club) {
  const parsed = lunchSchema.safeParse({
    title: formData.get("title"),
    venueId: String(formData.get("venueId") ?? ""),
    lunchDate: formData.get("lunchDate"),
    startTime: formData.get("startTime") || "12:30",
    capacity: formData.get("capacity"),
    signupOpensAt: String(formData.get("signupOpensAt") ?? ""),
    membersOpenAt: String(formData.get("membersOpenAt") ?? ""),
    guestsOpenAt: String(formData.get("guestsOpenAt") ?? ""),
    cutoffAt: String(formData.get("cutoffAt") ?? ""),
    guestsMode: formData.get("guestsMode") || undefined,
    maxGuests: formData.get("maxGuests") || undefined,
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const d = parsed.data;

  const opens = parseOptionalIso(d.signupOpensAt, "sign-up open time", club.timezone);
  if (!opens.ok) return { error: opens.error };
  const members = parseOptionalIso(d.membersOpenAt, "members-open time", club.timezone);
  if (!members.ok) return { error: members.error };
  const guests = parseOptionalIso(d.guestsOpenAt, "guests-open time", club.timezone);
  if (!guests.ok) return { error: guests.error };
  const cutoff = parseOptionalIso(d.cutoffAt, "sign-up cutoff", club.timezone);
  if (!cutoff.ok) return { error: cutoff.error };

  const phases = fillMissingPhaseTimestamps(
    {
      lunch_date: d.lunchDate,
      start_time: d.startTime,
      signup_opens_at: opens.value,
      members_open_at: members.value,
      guests_open_at: guests.value,
      signup_cutoff_at: cutoff.value,
    },
    club
  );
  const orderError = validatePhaseOrder(phases);
  if (orderError) return { error: orderError } as const;

  const guestsAllowed = d.guestsMode === "yes";
  if (guestsAllowed && d.maxGuests == null) {
    return { error: "Set the maximum guests per member" } as const;
  }

  return {
    row: {
      title: d.title,
      venue_id: d.venueId || null,
      lunch_date: d.lunchDate,
      start_time: d.startTime,
      capacity: d.capacity,
      signup_opens_at: phases.signup_opens_at,
      members_open_at: phases.members_open_at,
      guests_open_at: phases.guests_open_at,
      signup_cutoff_at: phases.signup_cutoff_at,
      guests_allowed: guestsAllowed,
      max_guests_per_member: guestsAllowed ? d.maxGuests : 0,
      notes: d.notes || null,
    },
  } as const;
}

async function loadUpcomingReleased(ctx: Ctx) {
  const today = todayInZone(ctx.club.timezone);
  const { data } = await ctx.supabase
    .from("lunches")
    .select("*")
    .eq("club_id", ctx.club.id)
    .eq("status", "released")
    .gte("lunch_date", today)
    .order("lunch_date")
    .order("start_time");
  return (data ?? []) as Lunch[];
}

export type FormState = { error?: string };

export async function createLunchAction(
  slug: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  let id: string;
  try {
    const ctx = await requireCommittee(slug);
    const parsed = parseLunchForm(formData, ctx.club);
    if ("error" in parsed) return parsed;
    const { data, error } = await ctx.supabase
      .from("lunches")
      .insert({ ...parsed.row, club_id: ctx.club.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    id = data.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(lunchPath(slug));
  redirect(lunchPath(slug, id));
}

export async function updateLunchAction(
  slug: string,
  lunchId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const ctx = await requireCommittee(slug);
    const parsed = parseLunchForm(formData, ctx.club);
    if ("error" in parsed) return parsed;

    const before = await getLunchForEmail(ctx, lunchId);
    if (!before) return { error: "Lunch not found" };

    // Capacity is changed via its own control (waitlist promotion) — not here.
    const { capacity: _capacity, ...row } = parsed.row;
    const { error } = await ctx.supabase
      .from("lunches")
      .update(row)
      .eq("id", lunchId);
    if (error) return { error: error.message };

    // Notify attendees if a released lunch materially changed.
    if (before.status === "released") {
      const changes: string[] = [];
      if (before.lunch_date !== row.lunch_date)
        changes.push(`New date: ${row.lunch_date}`);
      if (before.start_time.slice(0, 5) !== row.start_time.slice(0, 5))
        changes.push(`New time: ${row.start_time}`);
      if ((before.venue_id ?? null) !== row.venue_id) changes.push("New venue");
      if (changes.length) {
        const { data: affected } = await ctx.supabase
          .from("signups")
          .select("memberships(email, full_name)")
          .eq("lunch_id", lunchId)
          .in("status", ["confirmed", "waitlisted"]);
        await Promise.all(
          (affected ?? []).map((s) => {
            const m = s.memberships as unknown as {
              email: string;
              full_name: string;
            } | null;
            if (!m) return Promise.resolve();
            return sendLunchChanged({
              to: m.email,
              name: m.full_name,
              clubName: ctx.club.name,
              lunchTitle: row.title,
              lunchDate: row.lunch_date,
              changeSummary: changes.join("<br/>"),
            });
          })
        );
      }
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(lunchPath(slug, lunchId));
  redirect(lunchPath(slug, lunchId));
}

/** Release a draft to members. Computes the cutoff from club default if unset. */
export async function releaseLunchAction(slug: string, lunchId: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { data: lunch } = await ctx.supabase
      .from("lunches")
      .select("*")
      .eq("id", lunchId)
      .single();
    if (!lunch) throw new Error("Lunch not found");
    if (lunch.status !== "draft") throw new Error("Only drafts can be released");

    const phases = fillMissingPhaseTimestamps(lunch as Lunch, ctx.club);

    const { error } = await ctx.supabase
      .from("lunches")
      .update({
        status: "released",
        released_at: new Date().toISOString(),
        signup_opens_at: phases.signup_opens_at,
        members_open_at: phases.members_open_at,
        guests_open_at: phases.guests_open_at,
        signup_cutoff_at: phases.signup_cutoff_at,
      })
      .eq("id", lunchId);
    if (error) throw new Error(error.message);
    // Note: releasing does NOT email members in v1 — they see it on login.
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

export async function completeLunchAction(slug: string, lunchId: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { error } = await ctx.supabase
      .from("lunches")
      .update({ status: "completed" })
      .eq("id", lunchId)
      .eq("status", "released");
    if (error) throw new Error(error.message);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

/** Cancel the whole lunch — everyone signed-up or waitlisted is notified. */
export async function cancelLunchAction(slug: string, lunchId: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const lunch = await getLunchForEmail(ctx, lunchId);
    if (!lunch) throw new Error("Lunch not found");

    const { data: affected, error } = await ctx.supabase.rpc("cancel_lunch", {
      p_lunch: lunchId,
    });
    if (error) throw new Error(error.message);

    await Promise.all(
      ((affected ?? []) as PromotedMember[]).map((p) =>
        sendLunchCancelled({
          to: p.email,
          name: p.full_name,
          clubName: ctx.club.name,
          lunchTitle: lunch.title,
          lunchDate: lunch.lunch_date,
        })
      )
    );
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

export async function deleteDraftLunchAction(slug: string, lunchId: string) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { error } = await ctx.supabase
      .from("lunches")
      .delete()
      .eq("id", lunchId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug));
  if (err) redirect(`${lunchPath(slug)}?error=${encodeURIComponent(err)}`);
  redirect(lunchPath(slug));
}

/** Change capacity (the real-world booking changed). Raise → auto-promote. */
export async function setCapacityAction(
  slug: string,
  lunchId: string,
  formData: FormData
) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const capacity = Number(formData.get("capacity"));
    if (!Number.isInteger(capacity) || capacity < 0)
      throw new Error("Capacity must be a whole number ≥ 0");
    const { data: promoted, error } = await ctx.supabase.rpc(
      "set_lunch_capacity",
      { p_lunch: lunchId, p_capacity: capacity }
    );
    if (error) throw new Error(error.message);
    await notifyPromoted(ctx, lunchId, promoted as PromotedMember[]);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

/** Committee override: clear or move the cutoff so sign-ups reopen. */
export async function setCutoffAction(
  slug: string,
  lunchId: string,
  formData: FormData
) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const raw = String(formData.get("cutoffAt") ?? "").trim();
    const cutoff = raw ? fromDatetimeLocalValue(raw, ctx.club.timezone) : null;
    if (raw && !cutoff) throw new Error("Invalid sign-up cutoff");
    const { error } = await ctx.supabase
      .from("lunches")
      .update({ signup_cutoff_at: cutoff })
      .eq("id", lunchId);
    if (error) throw new Error(error.message);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

// ---------- member: sign-ups --------------------------------------------------

export async function signUpAction(
  slug: string,
  lunchId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const ctx = await requireMember(slug);
    const guestCount = Number(formData.get("guestCount") ?? 0) || 0;
    const guestNames = String(formData.get("guestNames") ?? "").trim() || null;

    const upcoming = await loadUpcomingReleased(ctx);
    const lunchRow =
      upcoming.find((l) => l.id === lunchId) ??
      ((
        await ctx.supabase.from("lunches").select("*").eq("id", lunchId).single()
      ).data as Lunch | null);
    if (!lunchRow) return { error: "Lunch not found" };
    const nextOpen = findNextOpenLunch(upcoming, ctx.club.timezone);
    const blocked = memberSignupBlockReason({
      lunch: lunchRow,
      club: ctx.club,
      isCommittee: ctx.membership.role === "committee",
      nextOpenLunchId: nextOpen?.id ?? null,
      guestCount,
    });
    if (blocked) return { error: blocked };

    const { data: signup, error } = await ctx.supabase.rpc(
      "sign_up_for_lunch",
      {
        p_lunch: lunchId,
        p_guest_count: guestCount,
        p_guest_names: guestNames,
      }
    );
    if (error) return { error: error.message };

    const lunch = await getLunchForEmail(ctx, lunchId);
    if (lunch && ctx.user.email) {
      const base = {
        to: ctx.user.email,
        name: ctx.membership.full_name,
        clubName: ctx.club.name,
        lunchTitle: lunch.title,
        lunchDate: lunch.lunch_date,
      };
      if (signup.status === "confirmed") {
        await sendSignupConfirmed({
          ...base,
          venueName: lunch.venues?.name,
          guestCount,
        });
      } else {
        await sendWaitlisted(base);
      }
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(lunchPath(slug, lunchId));
  return {};
}

export async function updateMyGuestsAction(
  slug: string,
  lunchId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    const ctx = await requireMember(slug);
    const nextGuestCount = Number(formData.get("guestCount") ?? 0) || 0;
    const { data: lunchRow } = await ctx.supabase
      .from("lunches")
      .select("*")
      .eq("id", lunchId)
      .single();
    if (!lunchRow) return { error: "Lunch not found" };
    const { data: existing } = await ctx.supabase
      .from("signups")
      .select("guest_count")
      .eq("lunch_id", lunchId)
      .eq("membership_id", ctx.membership.id)
      .in("status", ["confirmed", "waitlisted"])
      .maybeSingle();
    const blocked = guestEditBlockReason({
      lunch: lunchRow as Lunch,
      club: ctx.club,
      currentGuestCount: existing?.guest_count ?? 0,
      nextGuestCount,
    });
    if (blocked) return { error: blocked };

    const { error } = await ctx.supabase.rpc("update_my_guests", {
      p_lunch: lunchId,
      p_guest_count: nextGuestCount,
      p_guest_names: String(formData.get("guestNames") ?? "").trim() || null,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(lunchPath(slug, lunchId));
  return {};
}

export async function cancelMySignupAction(
  slug: string,
  lunchId: string,
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  try {
    const ctx = await requireMember(slug);
    const { data: promoted, error } = await ctx.supabase.rpc(
      "cancel_my_signup",
      { p_lunch: lunchId }
    );
    if (error) return { error: error.message };
    await notifyPromoted(ctx, lunchId, promoted as PromotedMember[]);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(lunchPath(slug, lunchId));
  return {};
}

// ---------- committee: manual overrides ----------------------------------------

/** Someone phoned the secretary — committee adds them by hand. */
export async function committeeAddSignupAction(
  slug: string,
  lunchId: string,
  formData: FormData
) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const membershipId = String(formData.get("membershipId") ?? "");
    if (!membershipId) throw new Error("Pick a member");
    const { data: signup, error } = await ctx.supabase.rpc(
      "committee_add_signup",
      {
        p_lunch: lunchId,
        p_membership: membershipId,
        p_guest_count: Number(formData.get("guestCount") ?? 0) || 0,
        p_force: formData.get("force") === "on",
      }
    );
    if (error) throw new Error(error.message);

    const lunch = await getLunchForEmail(ctx, lunchId);
    const { data: m } = await ctx.supabase
      .from("memberships")
      .select("email, full_name")
      .eq("id", membershipId)
      .single();
    if (lunch && m && lunch.status === "released") {
      const base = {
        to: m.email,
        name: m.full_name,
        clubName: ctx.club.name,
        lunchTitle: lunch.title,
        lunchDate: lunch.lunch_date,
      };
      if (signup.status === "confirmed") {
        await sendSignupConfirmed({
          ...base,
          venueName: lunch.venues?.name,
          guestCount: signup.guest_count,
        });
      } else {
        await sendWaitlisted(base);
      }
    }
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

export async function committeeRemoveSignupAction(
  slug: string,
  lunchId: string,
  signupId: string
) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { data: promoted, error } = await ctx.supabase.rpc(
      "committee_remove_signup",
      { p_signup: signupId }
    );
    if (error) throw new Error(error.message);
    await notifyPromoted(ctx, lunchId, promoted as PromotedMember[]);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}

export async function markAttendanceAction(
  slug: string,
  lunchId: string,
  signupId: string,
  attended: boolean
) {
  let err: string | null = null;
  try {
    const ctx = await requireCommittee(slug);
    const { error } = await ctx.supabase.rpc("mark_attendance", {
      p_signup: signupId,
      p_attended: attended,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    err = errorMessage(e);
  }
  revalidatePath(lunchPath(slug, lunchId));
  if (err) redirect(`${lunchPath(slug, lunchId)}?error=${encodeURIComponent(err)}`);
}
