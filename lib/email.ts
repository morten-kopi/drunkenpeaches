import { Resend } from "resend";
import { fmtDateShort } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contentFor,
  emailDef,
  emailHtml,
  guestsSentence,
  plural,
  renderBody,
  renderHeading,
  renderSubject,
  type EmailContent,
  type EmailKey,
} from "@/lib/email-templates";

// All notification emails. If RESEND_API_KEY isn't configured the app still
// works: emails are logged and skipped (handy in dev/preview). The wording of
// every club email comes from lib/email-templates.ts, or from the club's own
// edit of it in Settings.

const FROM = () => process.env.EMAIL_FROM ?? "Drunken Peaches <onboarding@resend.dev>";
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export type EmailClub = { id: string; name: string };

/** The lunch fields emails mention. */
export type EmailLunch = {
  id: string;
  clubSlug: string;
  title: string;
  lunchDate: string;
  startTime: string;
  venueName: string | null;
  venueAddress?: string | null;
};

export type Recipient = { email: string; name: string };

/** A moment shown two ways: "Thu 15 Oct 2026" and "Thu 15 Oct 2026, 12:15". */
export type Moment = { day: string; at: string };

/** False when Resend refused the email. Skipped without RESEND_API_KEY counts as sent. */
async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return true;
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: FROM(), to, subject, html });
    if (error) {
      console.error(`[email failed] to=${to} subject="${subject}"`, error);
      return false;
    }
    return true;
  } catch (err) {
    // Email failures must never break the member-facing flow.
    console.error(`[email failed] to=${to} subject="${subject}"`, err);
    return false;
  }
}

/**
 * One email per recipient, sent in batches (Resend takes up to 100 per call).
 * False when Resend accepted none of them, so the caller can try again later.
 * Without RESEND_API_KEY nothing is sent and it counts as done.
 */
async function sendEach<R extends Recipient>(
  recipients: R[],
  message: (r: R) => { subject: string; html: string }
): Promise<boolean> {
  if (!recipients.length) return true;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    for (const r of recipients) {
      console.log(`[email skipped — no RESEND_API_KEY] to=${r.email} subject="${message(r).subject}"`);
    }
    return true;
  }
  const resend = new Resend(apiKey);
  let delivered = false;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100).map((r) => ({ to: r.email, ...message(r) }));
    try {
      const { error } = await resend.batch.send(chunk.map((m) => ({ from: FROM(), ...m })));
      if (error) console.error(`[email batch failed] subject="${chunk[0].subject}"`, error);
      else delivered = true;
    } catch (err) {
      console.error(`[email batch failed] subject="${chunk[0].subject}"`, err);
    }
  }
  return delivered;
}

// ---------- the club's wording ------------------------------------------------

// A burst of emails (say a lunch change to forty members) reads the wording once.
const recent = new Map<string, { at: number; content: Promise<EmailContent> }>();

function wording(clubId: string, key: EmailKey): Promise<EmailContent> {
  const id = `${clubId}:${key}`;
  const hit = recent.get(id);
  if (hit && Date.now() - hit.at < 5000) return hit.content;
  const def = emailDef(key)!;
  const content = (async () => {
    try {
      const { data, error } = await createAdminClient()
        .from("email_templates")
        .select("subject, heading, body")
        .eq("club_id", clubId)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return contentFor(def, data);
    } catch (err) {
      // The default wording beats no email at all.
      console.error(`[email] using the default ${key} wording`, err);
      return contentFor(def, null);
    }
  })();
  recent.set(id, { at: Date.now(), content });
  return content;
}

function compose(
  content: EmailContent,
  values: Record<string, string>,
  clubName: string,
  button?: { label: string; url: string; showLink?: boolean }
) {
  return {
    subject: renderSubject(content.subject, values),
    html: emailHtml({
      heading: renderHeading(content.heading, values),
      body: renderBody(content.body, values),
      clubName,
      button,
    }),
  };
}

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Placeholder values every lunch email shares. */
function lunchValues(club: EmailClub, lunch: EmailLunch, name: string) {
  const venue = lunch.venueName || "a venue to be announced";
  return {
    name: name || "member",
    club: club.name,
    lunch: lunch.title,
    date: fmtDate(lunch.lunchDate),
    date_short: fmtDateShort(lunch.lunchDate),
    time: lunch.startTime.slice(0, 5),
    venue,
    venue_address: [venue, lunch.venueAddress].filter(Boolean).join(", "),
  };
}

function lunchButton(lunch: EmailLunch) {
  return {
    label: "Open the luncheon",
    url: `${APP_URL()}/c/${lunch.clubSlug}/lunches/${lunch.id}`,
  };
}

// ---------- account emails (fixed wording, no club) ----------------------------

export async function sendPasswordResetEmail(opts: { to: string; resetLink: string }) {
  await send(
    opts.to,
    "Reset your password",
    emailHtml({
      heading: "Reset your password",
      body: `<p>Click below to choose a new password:</p>
       <p style="margin: 24px 0;">
         <a href="${opts.resetLink}" style="background: #1c1917; color: #fafaf9; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset password</a>
       </p>
       <p style="font-size: 13px; color: #78716c;">If you didn't ask for this, you can ignore this email.</p>`,
    })
  );
}

// ---------- club emails --------------------------------------------------------

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  club: EmailClub;
  inviteLink: string;
}) {
  const m = compose(
    await wording(opts.club.id, "invite"),
    { name: opts.name || "member", club: opts.club.name },
    opts.club.name,
    { label: "Accept invitation", url: opts.inviteLink, showLink: true }
  );
  await send(opts.to, m.subject, m.html);
}

export async function sendSignupConfirmed(opts: {
  to: string;
  name: string;
  club: EmailClub;
  lunch: EmailLunch;
  guestCount: number;
  guestNames?: string | null;
}) {
  const m = compose(
    await wording(opts.club.id, "signup_confirmed"),
    {
      ...lunchValues(opts.club, opts.lunch, opts.name),
      guests: guestsSentence(opts.guestCount, opts.guestNames ?? null),
    },
    opts.club.name
  );
  await send(opts.to, m.subject, m.html);
}

export async function sendWaitlisted(opts: {
  to: string;
  name: string;
  club: EmailClub;
  lunch: EmailLunch;
}) {
  const m = compose(
    await wording(opts.club.id, "waitlisted"),
    lunchValues(opts.club, opts.lunch, opts.name),
    opts.club.name
  );
  await send(opts.to, m.subject, m.html);
}

export async function sendPromoted(opts: {
  to: string;
  name: string;
  club: EmailClub;
  lunch: EmailLunch;
}) {
  const m = compose(
    await wording(opts.club.id, "promoted"),
    lunchValues(opts.club, opts.lunch, opts.name),
    opts.club.name
  );
  await send(opts.to, m.subject, m.html);
}

/** To a guest once their seat is confirmed. False when Resend refused it. */
export async function sendGuestConfirmed(opts: {
  to: string;
  name: string;
  host: string;
  club: EmailClub;
  lunch: EmailLunch;
}) {
  const m = compose(
    await wording(opts.club.id, "guest_confirmed"),
    { ...lunchValues(opts.club, opts.lunch, opts.name), name: opts.name, host: opts.host },
    opts.club.name
  );
  return send(opts.to, m.subject, m.html);
}

export async function sendLunchCancelled(opts: {
  to: string;
  name: string;
  club: EmailClub;
  lunch: EmailLunch;
}) {
  const m = compose(
    await wording(opts.club.id, "lunch_cancelled"),
    lunchValues(opts.club, opts.lunch, opts.name),
    opts.club.name
  );
  await send(opts.to, m.subject, m.html);
}

export async function sendLunchChanged(opts: {
  to: string;
  name: string;
  club: EmailClub;
  lunch: EmailLunch;
  /** One line per change, e.g. "New date: Friday 4 December 2026". */
  changes: string[];
  /** Guests can't sign in, so they get no button. */
  forGuest?: boolean;
}) {
  const m = compose(
    await wording(opts.club.id, "lunch_changed"),
    { ...lunchValues(opts.club, opts.lunch, opts.name), changes: opts.changes.join("\n") },
    opts.club.name,
    opts.forGuest ? undefined : lunchButton(opts.lunch)
  );
  await send(opts.to, m.subject, m.html);
}

// ---------- scheduled reminders (sent by /api/cron/reminders) ----------------

/** The day before committee registration opens. Committee only. */
export async function sendCommitteeOpensReminder(opts: {
  recipients: Recipient[];
  club: EmailClub;
  lunch: EmailLunch;
  opens: Moment;
  membersOpen: Moment | null;
}) {
  const content = await wording(opts.club.id, "committee_opens");
  return sendEach(opts.recipients, (r) =>
    compose(
      content,
      {
        ...lunchValues(opts.club, opts.lunch, r.name),
        opens: opts.opens.at,
        opens_day: opts.opens.day,
        members_follow: opts.membersOpen
          ? `Member registration follows on ${opts.membersOpen.at}.`
          : "",
      },
      opts.club.name,
      lunchButton(opts.lunch)
    )
  );
}

/** The day before member registration opens. Every active member. */
export async function sendMembersOpenReminder(opts: {
  recipients: Recipient[];
  club: EmailClub;
  lunch: EmailLunch;
  opens: Moment;
  /** Null when the lunch takes no guests. */
  guests: { maxPerMember: number; opens: Moment | null } | null;
}) {
  const content = await wording(opts.club.id, "members_open");
  const guestRule = !opts.guests
    ? "No guests at this luncheon."
    : opts.guests.opens
      ? `Guest registration opens ${opts.guests.opens.at}, provided there is space.`
      : `Each member may bring up to ${plural(opts.guests.maxPerMember, "guest")}, provided there is space.`;
  return sendEach(opts.recipients, (r) =>
    compose(
      content,
      {
        ...lunchValues(opts.club, opts.lunch, r.name),
        opens: opts.opens.at,
        opens_day: opts.opens.day,
        guest_rule: guestRule,
      },
      opts.club.name,
      lunchButton(opts.lunch)
    )
  );
}

/** The day before guests may be added, when seats are free. Every active member. */
export async function sendGuestsOpenReminder(opts: {
  recipients: Recipient[];
  club: EmailClub;
  lunch: EmailLunch;
  opens: Moment;
  maxPerMember: number;
  seatsLeft: number;
}) {
  const content = await wording(opts.club.id, "guests_open");
  return sendEach(opts.recipients, (r) =>
    compose(
      content,
      {
        ...lunchValues(opts.club, opts.lunch, r.name),
        opens: opts.opens.at,
        opens_day: opts.opens.day,
        max_guests: plural(opts.maxPerMember, "guest"),
        seats_free: `${plural(opts.seatsLeft, "seat")} ${opts.seatsLeft === 1 ? "is" : "are"} still free`,
      },
      opts.club.name,
      lunchButton(opts.lunch)
    )
  );
}

/** The day before the lunch. Everyone with a confirmed place. */
export async function sendLunchReminder(opts: {
  recipients: (Recipient & { guestCount: number; guestNames: string | null })[];
  club: EmailClub;
  lunch: EmailLunch;
}) {
  const content = await wording(opts.club.id, "lunch_reminder");
  return sendEach(opts.recipients, (r) =>
    compose(
      content,
      {
        ...lunchValues(opts.club, opts.lunch, r.name),
        guests: guestsSentence(r.guestCount, r.guestNames),
      },
      opts.club.name,
      lunchButton(opts.lunch)
    )
  );
}
