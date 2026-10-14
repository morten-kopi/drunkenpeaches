import { Resend } from "resend";
import { fmtDateShort } from "@/lib/format";

// All v1 notification emails. If RESEND_API_KEY isn't configured the app
// still works — emails are logged and skipped (handy in dev/preview).

const FROM = () => process.env.EMAIL_FROM ?? "Drunken Peaches <onboarding@resend.dev>";
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function send(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: FROM(), to, subject, html });
  } catch (err) {
    // Email failures must never break the member-facing flow.
    console.error(`[email failed] to=${to} subject="${subject}"`, err);
  }
}

// clubName signs the email; omit it for account emails not tied to a club.
function layout(title: string, body: string, clubName?: string) {
  const signature = clubName
    ? `<hr style="border: none; border-top: 1px solid #e7e5e4; margin: 32px 0 16px;" />
    <p style="font-size: 12px; color: #a8a29e;">The secretary, ${clubName}.</p>`
    : "";
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #292524;">
    <h2 style="font-weight: 600; margin-bottom: 16px;">${title}</h2>
    ${body}
    ${signature}
  </div>`;
}

function fmtDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function sendInviteEmail(opts: {
  to: string;
  clubName: string;
  inviteLink: string;
}) {
  await send(
    opts.to,
    `An invitation to ${opts.clubName}`,
    layout(
      `You are invited to ${opts.clubName}`,
      `<p>The committee has proposed you for membership of <strong>${opts.clubName}</strong>.</p>
       <p>Please set a password and complete your particulars:</p>
       <p style="margin: 24px 0;">
         <a href="${opts.inviteLink}" style="background: #1c1917; color: #fafaf9; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Accept invitation</a>
       </p>
       <p style="font-size: 13px; color: #78716c;">If the button doesn't work, paste this link into your browser:<br/>${opts.inviteLink}</p>`,
      opts.clubName
    )
  );
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetLink: string;
}) {
  await send(
    opts.to,
    "Reset your password",
    layout(
      "Reset your password",
      `<p>Click below to choose a new password:</p>
       <p style="margin: 24px 0;">
         <a href="${opts.resetLink}" style="background: #1c1917; color: #fafaf9; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset password</a>
       </p>
       <p style="font-size: 13px; color: #78716c;">If you didn't ask for this, you can ignore this email.</p>`
    )
  );
}

export async function sendSignupConfirmed(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
  venueName?: string | null;
  guestCount: number;
}) {
  const guests =
    opts.guestCount > 0
      ? `<p>Party size: you + ${opts.guestCount} guest${opts.guestCount > 1 ? "s" : ""}.</p>`
      : "";
  await send(
    opts.to,
    `Your place is confirmed: ${opts.lunchTitle}`,
    layout(
      "Your name is on the list",
      `<p>Dear ${opts.name || "member"},</p>
       <p>Your place for <strong>${opts.lunchTitle}</strong> on <strong>${fmtDate(opts.lunchDate)}</strong>${opts.venueName ? ` at ${opts.venueName}` : ""} is confirmed.</p>
       ${guests}`,
      opts.clubName
    )
  );
}

export async function sendWaitlisted(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
}) {
  await send(
    opts.to,
    `You are on the waitlist: ${opts.lunchTitle}`,
    layout(
      "You are on the waitlist",
      `<p>Dear ${opts.name || "member"},</p>
       <p><strong>${opts.lunchTitle}</strong> on <strong>${fmtDate(opts.lunchDate)}</strong> is presently full. Your name has been added to the waitlist.</p>
       <p>Should a place become free, it will be offered to you and you will be written to at once.</p>`,
      opts.clubName
    )
  );
}

export async function sendPromoted(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
  venueName?: string | null;
}) {
  await send(
    opts.to,
    `A place has become available: ${opts.lunchTitle}`,
    layout(
      "A place has become available",
      `<p>Dear ${opts.name || "member"},</p>
       <p>A place has become free. You are now <strong>confirmed</strong> for <strong>${opts.lunchTitle}</strong> on <strong>${fmtDate(opts.lunchDate)}</strong>${opts.venueName ? ` at ${opts.venueName}` : ""}.</p>
       <p>If you are no longer able to attend, please withdraw your name so the next member may take the seat.</p>`,
      opts.clubName
    )
  );
}

// ---------- scheduled reminders (sent by /api/cron/reminders) ----------------

export type Recipient = { email: string; name: string };

/** A moment shown two ways: "Thu 15 Oct 2026" and "Thu 15 Oct 2026, 12:15". */
export type Moment = { day: string; at: string };

export type ReminderLunch = {
  id: string;
  clubSlug: string;
  title: string;
  lunchDate: string;
  startTime: string;
  venueName: string | null;
  venueAddress?: string | null;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function lunchButton(lunch: ReminderLunch) {
  const url = `${APP_URL()}/c/${lunch.clubSlug}/lunches/${lunch.id}`;
  return `<p style="margin: 24px 0;">
         <a href="${url}" style="background: #1c1917; color: #fafaf9; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Open the luncheon</a>
       </p>`;
}

function lunchWhen(lunch: ReminderLunch) {
  const venue = [lunch.venueName, lunch.venueAddress].filter(Boolean).map((v) => esc(v!));
  return `<strong>${fmtDate(lunch.lunchDate)}</strong> at ${lunch.startTime.slice(0, 5)}${
    venue.length ? `, at ${venue.join(", ")}` : ""
  }`;
}

/** One email per recipient, sent in batches (Resend takes up to 100 per call). */
async function sendEach<R extends Recipient>(
  recipients: R[],
  subject: string,
  html: (r: R) => string
) {
  if (!recipients.length) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    for (const r of recipients) {
      console.log(`[email skipped — no RESEND_API_KEY] to=${r.email} subject="${subject}"`);
    }
    return;
  }
  const resend = new Resend(apiKey);
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(
        chunk.map((r) => ({ from: FROM(), to: r.email, subject, html: html(r) }))
      );
      if (error) console.error(`[email batch failed] subject="${subject}"`, error);
    } catch (err) {
      console.error(`[email batch failed] subject="${subject}"`, err);
    }
  }
}

/** The day before committee registration opens. Committee only. */
export async function sendCommitteeOpensReminder(opts: {
  recipients: Recipient[];
  clubName: string;
  lunch: ReminderLunch;
  opens: Moment;
  membersOpen: Moment | null;
}) {
  const title = esc(opts.lunch.title);
  await sendEach(
    opts.recipients,
    `${opts.lunch.title}: committee registration opens ${opts.opens.day}`,
    (r) =>
      layout(
        "Committee registration",
        `<p>Dear ${esc(r.name) || "member"},</p>
       <p>Committee registration for <strong>${title}</strong> opens on <strong>${opts.opens.at}</strong>.${
         opts.membersOpen ? ` Member registration follows on ${opts.membersOpen.at}.` : ""
       }</p>
       <p>The luncheon is on ${lunchWhen(opts.lunch)}.</p>
       ${lunchButton(opts.lunch)}`,
        opts.clubName
      )
  );
}

/** The day before member registration opens. Every active member. */
export async function sendMembersOpenReminder(opts: {
  recipients: Recipient[];
  clubName: string;
  lunch: ReminderLunch;
  opens: Moment;
  /** Null when the lunch takes no guests. */
  guests: { maxPerMember: number; opens: Moment | null } | null;
}) {
  const title = esc(opts.lunch.title);
  const guests = !opts.guests
    ? "No guests at this luncheon."
    : opts.guests.opens
      ? `Guest registration opens ${opts.guests.opens.at}, provided there is space.`
      : `Each member may bring up to ${plural(opts.guests.maxPerMember, "guest")}, provided there is space.`;
  await sendEach(
    opts.recipients,
    `${opts.lunch.title}: registration opens ${opts.opens.day}`,
    (r) =>
      layout(
        "Member registration",
        `<p>Dear ${esc(r.name) || "member"},</p>
       <p>Member registration for <strong>${title}</strong> opens on <strong>${opts.opens.at}</strong>. Places are first come, first served.</p>
       <p>The luncheon is on ${lunchWhen(opts.lunch)}. ${guests}</p>
       ${lunchButton(opts.lunch)}`,
        opts.clubName
      )
  );
}

/** The day before guests may be added, when seats are free. Every active member. */
export async function sendGuestsOpenReminder(opts: {
  recipients: Recipient[];
  clubName: string;
  lunch: ReminderLunch;
  opens: Moment;
  maxPerMember: number;
  seatsLeft: number;
}) {
  const title = esc(opts.lunch.title);
  await sendEach(
    opts.recipients,
    `${opts.lunch.title}: guest registration opens ${opts.opens.day}`,
    (r) =>
      layout(
        "Guest registration",
        `<p>Dear ${esc(r.name) || "member"},</p>
       <p>Guest registration for <strong>${title}</strong> opens on <strong>${opts.opens.at}</strong>. Each member may bring up to ${plural(opts.maxPerMember, "guest")}, provided there is space. ${plural(opts.seatsLeft, "seat")} ${opts.seatsLeft === 1 ? "is" : "are"} still free.</p>
       <p>If your name is already on the list, add your guests on the luncheon page. If not, you can add your name and your guests together.</p>
       <p>The luncheon is on ${lunchWhen(opts.lunch)}.</p>
       ${lunchButton(opts.lunch)}`,
        opts.clubName
      )
  );
}

/** The day before the lunch. Everyone with a confirmed place. */
export async function sendLunchReminder(opts: {
  recipients: (Recipient & { guestCount: number; guestNames: string | null })[];
  clubName: string;
  lunch: ReminderLunch;
}) {
  const title = esc(opts.lunch.title);
  await sendEach(
    opts.recipients,
    `Reminder: ${opts.lunch.title}, ${fmtDateShort(opts.lunch.lunchDate)} at ${opts.lunch.startTime.slice(0, 5)}`,
    (r) =>
      layout(
        "Lunch reminder",
        `<p>Dear ${esc(r.name) || "member"},</p>
       <p>A reminder that <strong>${title}</strong> is on ${lunchWhen(opts.lunch)}.</p>
       ${
         r.guestCount > 0
           ? `<p>You are bringing ${plural(r.guestCount, "guest")}${r.guestNames ? ` (${esc(r.guestNames)})` : ""}.</p>`
           : ""
       }
       <p>If you can no longer attend, please let the committee know as soon as possible.</p>
       ${lunchButton(opts.lunch)}`,
        opts.clubName
      )
  );
}

export async function sendLunchCancelled(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
}) {
  await send(
    opts.to,
    `Cancelled: ${opts.lunchTitle}`,
    layout(
      "Lunch cancelled",
      `<p>Dear ${opts.name || "member"},</p>
       <p>The committee has cancelled <strong>${opts.lunchTitle}</strong> on <strong>${fmtDate(opts.lunchDate)}</strong>.</p>`,
      opts.clubName
    )
  );
}

export async function sendLunchChanged(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
  changeSummary: string;
}) {
  await send(
    opts.to,
    `Updated: ${opts.lunchTitle}`,
    layout(
      "Lunch details changed",
      `<p>Dear ${opts.name || "member"},</p>
       <p>The particulars for <strong>${opts.lunchTitle}</strong> (${fmtDate(opts.lunchDate)}) have changed:</p>
       <p>${opts.changeSummary}</p>
       <p>Check the app for the latest details: <a href="${APP_URL()}">${APP_URL()}</a></p>`,
      opts.clubName
    )
  );
}
