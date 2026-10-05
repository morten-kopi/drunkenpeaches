import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Club, Membership } from "@/lib/types";

export interface ClubContext {
  user: { id: string; email: string | null };
  club: Club;
  membership: Membership;
  isCommittee: boolean;
}

/**
 * Resolves the signed-in user's context for a club slug. Redirects to /login
 * when signed out; 404s when the user isn't an active member of that club
 * (RLS would hide the club row anyway — this just makes it explicit).
 * Cached per request so layout + page can both call it.
 */
export const getClubContext = cache(
  async (slug: string): Promise<ClubContext> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: club } = await supabase
      .from("clubs")
      .select("*")
      .eq("slug", slug)
      .single();
    if (!club) notFound();

    const { data: membership } = await supabase
      .from("memberships")
      .select("*")
      .eq("club_id", club.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (!membership) notFound();

    return {
      user: { id: user.id, email: user.email ?? null },
      club: club as Club,
      membership: membership as Membership,
      isCommittee: membership.role === "committee",
    };
  }
);

/** First club the signed-in user belongs to, for post-login redirects. */
export async function getMyClubs() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("memberships")
    .select("club_id, role, clubs(id, name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  return (data ?? [])
    .map((m) => m.clubs as unknown as { id: string; name: string; slug: string })
    .filter(Boolean);
}
