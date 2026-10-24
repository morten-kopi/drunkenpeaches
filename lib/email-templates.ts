// The club's automatic emails: what each says by default, when it goes out
// and to whom. The committee can rewrite the subject, heading and body of
// each one in Settings; edits are stored per club in email_templates, and an
// email nobody has edited follows the defaults here. The button, link and
// signature are added by the system and cannot be edited, so no edit can
// leave an invite without its link.
//
// Pure module: the settings page uses it in the browser for the preview.

export type EmailKey =
  | "invite"
  | "signup_confirmed"
  | "waitlisted"
  | "promoted"
  | "guest_confirmed"
  | "lunch_changed"
  | "lunch_cancelled"
  | "committee_opens"
  | "members_open"
  | "guests_open"
  | "lunch_reminder";

export type EmailContent = { subject: string; heading: string; body: string };

type Placeholder = { key: string; about: string; sample: string };

export type EmailDef = EmailContent & {
  key: EmailKey;
  name: string;
  when: string;
  to: string;
  /** Label of the button the system adds, if any. */
  button?: string;
  placeholders: Placeholder[];
};

const P = {
  name: { key: "name", about: "The recipient's name", sample: "John Smith" },
  firstName: { key: "name", about: "The recipient's first name", sample: "John" },
  club: { key: "club", about: "The club's name", sample: "Beefsteaks & Burgundy" },
  lunch: { key: "lunch", about: "The lunch's title", sample: "November Lunch" },
  date: { key: "date", about: "The lunch's date", sample: "Friday 27 November 2026" },
  time: { key: "time", about: "The start time", sample: "12:15" },
  venue: { key: "venue", about: "The restaurant", sample: "OSO" },
  venueAddress: {
    key: "venue_address",
    about: "The restaurant and its address",
    sample: "OSO, 46 Bukit Pasoh Road",
  },
  dateShort: { key: "date_short", about: "The lunch's date, short", sample: "Fri 27 Nov 2026" },
  opens: { key: "opens", about: "When registration opens", sample: "Mon 2 Nov 2026, 09:00" },
  opensDay: { key: "opens_day", about: "The day registration opens", sample: "Mon 2 Nov 2026" },
  guests: {
    key: "guests",
    about: "A sentence about their guests, or nothing when they bring none",
    sample: "You are bringing 1 guest (Jane Doe).",
  },
} satisfies Record<string, Placeholder>;

const lunchPlaceholders = (name: Placeholder) => [
  name,
  P.club,
  P.lunch,
  P.date,
  P.dateShort,
  P.time,
  P.venue,
  P.venueAddress,
];

/** In the order the settings page lists them. */
export const EMAILS: EmailDef[] = [
  {
    key: "invite",
    name: "Invitation",
    when: "When the committee adds a member, or makes a guest a member",
    to: "The new member",
    button: "Accept invitation",
    placeholders: [P.name, P.club],
    subject: "An invitation to {club}",
    heading: "You are invited to {club}",
    body: "The committee has proposed you for membership of **{club}**.\n\nPlease set a password and complete your particulars:",
  },
  {
    key: "signup_confirmed",
    name: "Place confirmed",
    when: "When a member adds their name and gets a seat, or the committee adds them",
    to: "The member",
    placeholders: [...lunchPlaceholders(P.name), P.guests],
    subject: "Your place is confirmed: {lunch}",
    heading: "Your name is on the list",
    body: "Dear {name},\n\nYour place for **{lunch}** on **{date}** at {venue} is confirmed.\n\n{guests}",
  },
  {
    key: "waitlisted",
    name: "Waitlisted",
    when: "When a member adds their name and the lunch is full",
    to: "The member",
    placeholders: lunchPlaceholders(P.name),
    subject: "You are on the waitlist: {lunch}",
    heading: "You are on the waitlist",
    body: "Dear {name},\n\n**{lunch}** on **{date}** is presently full. Your name has been added to the waitlist.\n\nShould a place become free, it will be offered to you and you will be written to at once.",
  },
  {
    key: "promoted",
    name: "Off the waitlist",
    when: "When a seat frees up and a waitlisted member gets it",
    to: "The member",
    placeholders: lunchPlaceholders(P.name),
    subject: "A place has become available: {lunch}",
    heading: "A place has become available",
    body: "Dear {name},\n\nA place has become free. You are now **confirmed** for **{lunch}** on **{date}** at {venue}.\n\nIf you are no longer able to attend, please withdraw your name so the next member may take the seat.",
  },
  {
    key: "guest_confirmed",
    name: "Guest confirmed",
    when: "When a guest's seat is confirmed, whether added by their host or the committee, or off the waitlist",
    to: "The guest",
    placeholders: [
      { key: "name", about: "The guest's name", sample: "Jane Doe" },
      { key: "host", about: "The member bringing them", sample: "John Smith" },
      P.club,
      P.lunch,
      P.date,
      P.dateShort,
      P.time,
      P.venue,
      P.venueAddress,
    ],
    subject: "You are on the list: {lunch}",
    heading: "You are on the list",
    body: "Dear {name},\n\n{host} has added you as their guest at **{lunch}** on **{date}** at {time}, at {venue_address}.\n\nIf you have dietary requirements or can no longer come, please let {host} know.",
  },
  {
    key: "lunch_changed",
    name: "Lunch changed",
    when: "When the committee changes the date, time or restaurant of a released lunch",
    to: "Members confirmed or waitlisted, and their confirmed guests",
    button: "Open the luncheon",
    placeholders: [
      ...lunchPlaceholders(P.name),
      { key: "changes", about: "What changed, one per line", sample: "New date: Friday 4 December 2026\nNew venue: Burgundian" },
    ],
    subject: "Updated: {lunch}",
    heading: "Lunch details changed",
    body: "Dear {name},\n\nThe particulars for **{lunch}** ({date}) have changed:\n\n{changes}",
  },
  {
    key: "lunch_cancelled",
    name: "Lunch cancelled",
    when: "When the committee cancels a lunch",
    to: "Members confirmed or waitlisted, and their confirmed guests",
    placeholders: lunchPlaceholders(P.name),
    subject: "Cancelled: {lunch}",
    heading: "Lunch cancelled",
    body: "Dear {name},\n\nThe committee has cancelled **{lunch}** on **{date}**.",
  },
  {
    key: "committee_opens",
    name: "Committee registration opens",
    when: "The day before committee registration opens",
    to: "The committee",
    button: "Open the luncheon",
    placeholders: [
      ...lunchPlaceholders(P.firstName),
      P.opens,
      P.opensDay,
      {
        key: "members_follow",
        about: "When members may register, or nothing without a committee window",
        sample: "Member registration follows on Wed 4 Nov 2026, 09:00.",
      },
    ],
    subject: "{lunch}: committee registration opens {opens_day}",
    heading: "Committee registration",
    body: "Dear {name},\n\nCommittee registration for **{lunch}** opens on **{opens}**. {members_follow}\n\nThe luncheon is on **{date}** at {time}, at {venue_address}.",
  },
  {
    key: "members_open",
    name: "Member registration opens",
    when: "The day before member registration opens",
    to: "Every active member",
    button: "Open the luncheon",
    placeholders: [
      ...lunchPlaceholders(P.firstName),
      P.opens,
      P.opensDay,
      {
        key: "guest_rule",
        about: "Whether and when guests may come",
        sample: "Guest registration opens Wed 18 Nov 2026, 09:00, provided there is space.",
      },
    ],
    subject: "{lunch}: registration opens {opens_day}",
    heading: "Member registration",
    body: "Dear {name},\n\nMember registration for **{lunch}** opens on **{opens}**. Places are first come, first served.\n\nThe luncheon is on **{date}** at {time}, at {venue_address}. {guest_rule}",
  },
  {
    key: "guests_open",
    name: "Guest registration opens",
    when: "The day before guests may be added, if the lunch takes guests and seats are free",
    to: "Every active member",
    button: "Open the luncheon",
    placeholders: [
      ...lunchPlaceholders(P.firstName),
      P.opens,
      P.opensDay,
      { key: "max_guests", about: "Guests allowed per member", sample: "1 guest" },
      { key: "seats_free", about: "Seats still free", sample: "6 seats are still free" },
    ],
    subject: "{lunch}: guest registration opens {opens_day}",
    heading: "Guest registration",
    body: "Dear {name},\n\nGuest registration for **{lunch}** opens on **{opens}**. Each member may bring up to {max_guests}, provided there is space. {seats_free}.\n\nIf your name is already on the list, add your guests on the luncheon page. If not, you can add your name and your guests together.\n\nThe luncheon is on **{date}** at {time}, at {venue_address}.",
  },
  {
    key: "lunch_reminder",
    name: "Lunch reminder",
    when: "The day before the lunch",
    to: "Everyone confirmed",
    button: "Open the luncheon",
    placeholders: [...lunchPlaceholders(P.firstName), P.guests],
    subject: "Reminder: {lunch}, {date_short} at {time}",
    heading: "Lunch reminder",
    body: "Dear {name},\n\nA reminder that **{lunch}** is on **{date}** at {time}, at {venue_address}.\n\n{guests}\n\nIf you can no longer attend, please let the committee know as soon as possible.",
  },
];

export function emailDef(key: string) {
  return EMAILS.find((e) => e.key === key) ?? null;
}

/** Every placeholder an email understands, with sample values. */
export function placeholdersOf(def: EmailDef) {
  return def.placeholders;
}

export function sampleValues(def: EmailDef): Record<string, string> {
  return Object.fromEntries(placeholdersOf(def).map((p) => [p.key, p.sample]));
}

const TOKEN = /\{([a-z_]+)\}/g;

/**
 * Anything in braces the email doesn't know, typos included: {Name},
 * { name } and {venue address} would otherwise go out as written.
 */
export function unknownPlaceholders(def: EmailDef, text: string) {
  const known = new Set(placeholdersOf(def).map((p) => p.key));
  const found = [...text.matchAll(/\{([^{}\n]*)\}/g)].map((m) => m[1]);
  return [...new Set(found)].filter((k) => !known.has(k));
}

function fill(text: string, values: Record<string, string>) {
  return text.replace(TOKEN, (whole, key: string) => values[key] ?? whole);
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped HTML for a line of text; **words** become bold. */
function inline(text: string) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Plain-text subject: placeholders filled, bold markers dropped. */
export function renderSubject(subject: string, values: Record<string, string>) {
  return fill(subject, values).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

/** The heading as HTML. */
export function renderHeading(heading: string, values: Record<string, string>) {
  return inline(fill(heading, values).trim());
}

/**
 * The body as HTML paragraphs. A blank line starts a paragraph, a single
 * line break stays a line break, and a paragraph left empty (say {guests}
 * for someone bringing none) is dropped.
 */
export function renderBody(body: string, values: Record<string, string>) {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => fill(p, values).trim())
    .filter(Boolean)
    .map((p) => `<p style="margin: 0 0 16px;">${p.split("\n").map(inline).join("<br/>")}</p>`)
    .join("\n");
}

/** A stored edit, or the default where there is none. */
export function contentFor(def: EmailDef, saved?: Partial<EmailContent> | null): EmailContent {
  return {
    subject: saved?.subject || def.subject,
    heading: saved?.heading ?? def.heading,
    body: saved?.body || def.body,
  };
}

/**
 * The whole email as HTML: heading, body, the system's button (with the link
 * written out when asked) and the club's signature.
 */
export function emailHtml(opts: {
  heading: string;
  body: string;
  clubName?: string;
  button?: { label: string; url: string; showLink?: boolean };
}) {
  const button = opts.button
    ? `<p style="margin: 24px 0;">
         <a href="${esc(opts.button.url)}" style="background: #1c1917; color: #fafaf9; padding: 12px 24px; text-decoration: none; border-radius: 6px;">${esc(opts.button.label)}</a>
       </p>${
         opts.button.showLink
           ? `\n       <p style="font-size: 13px; color: #78716c;">If the button doesn't work, paste this link into your browser:<br/>${esc(opts.button.url)}</p>`
           : ""
       }`
    : "";
  const signature = opts.clubName
    ? `<hr style="border: none; border-top: 1px solid #e7e5e4; margin: 32px 0 16px;" />
    <p style="font-size: 12px; color: #a8a29e;">The secretary, ${esc(opts.clubName)}.</p>`
    : "";
  const heading = opts.heading
    ? `<h2 style="font-weight: 600; margin-bottom: 16px;">${opts.heading}</h2>`
    : "";
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #292524;">
    ${heading}
    ${opts.body}
    ${button}
    ${signature}
  </div>`;
}

// ---------- shared phrasing for computed placeholders ------------------------

export function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "You are bringing 2 guests (Jane Doe, Tom Lee)." or "" without guests. */
export function guestsSentence(count: number, names: string | null) {
  if (count <= 0) return "";
  return `You are bringing ${plural(count, "guest")}${names ? ` (${names})` : ""}.`;
}
