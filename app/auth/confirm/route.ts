import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lands invite (and recovery/magiclink) links: verifies the OTP, establishes
 * a session, links any pending memberships to the auth user, then forwards
 * to the `next` step (set-password for fresh invites).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error && data.user) {
      // Activate invited memberships for this email.
      if (data.user.email) {
        const admin = createAdminClient();
        await admin
          .from("memberships")
          .update({ user_id: data.user.id, status: "active" })
          .eq("email", data.user.email.toLowerCase())
          .eq("status", "invited");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/?error=${encodeURIComponent(
      "That link is invalid or has expired — ask the committee to re-send your invite."
    )}`
  );
}
