import { Resend } from "resend";

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

export async function sendLunchReminder(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
  startTime: string;
  venueName?: string | null;
}) {
  await send(
    opts.to,
    `Reminder: ${opts.lunchTitle} is coming up`,
    layout(
      "Lunch reminder",
      `<p>Dear ${opts.name || "member"},</p>
       <p>A reminder that <strong>${opts.lunchTitle}</strong> is on <strong>${fmtDate(opts.lunchDate)}</strong> at ${opts.startTime.slice(0, 5)}${opts.venueName ? `, at ${opts.venueName}` : ""}.</p>`,
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

export async function sendCritiqueRoleAssigned(opts: {
  to: string;
  name: string;
  clubName: string;
  lunchTitle: string;
  lunchDate: string;
  venueName?: string | null;
  roleLabel: string;
  duty: string;
  lunchUrl: string;
}) {
  const where = opts.venueName ? ` at ${opts.venueName}` : "";
  await send(
    opts.to,
    `You are ${opts.roleLabel} for ${opts.lunchTitle}`,
    layout(
      `You are ${opts.roleLabel}`,
      `<p>Dear ${opts.name || "member"},</p>
       <p>You have been assigned <strong>${opts.roleLabel}</strong> for <strong>${opts.lunchTitle}</strong> on <strong>${fmtDate(opts.lunchDate)}</strong>${where}.</p>
       <p>${opts.duty}</p>
       <p style="margin: 24px 0;">
         <a href="${opts.lunchUrl}" style="background: #1c1917; color: #fafaf9; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Open the luncheon</a>
       </p>
       <p style="font-size: 13px; color: #78716c;">If the button doesn't work, paste this link into your browser:<br/>${opts.lunchUrl}</p>`,
      opts.clubName
    )
  );
}
