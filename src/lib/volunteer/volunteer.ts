import type { Mail, Sender } from '../backup/monthly.js';

/**
 * The Volunteer Information Sheet, as a form this site owns (#30 AC 3).
 *
 * The school settled on #14 that the Google Form goes: it is a second form on a
 * third-party domain, its answers land in a spreadsheet nobody has agreed to
 * own, and the live Volunteer page links it twice under two different names.
 * What replaces it is this — the same fields, the same five areas of help, in
 * the school's own words, delivered to the school's own address.
 *
 * **The fields are transcribed, not designed.** The test beside this file reads
 * the captured form and fails if a label or a description drifts. What the
 * school asks a volunteer is the school's decision; how it is laid out and what
 * happens when the send fails are ours.
 */

/** How somebody would rather be contacted, in the school's own order. */
export const CONTACT_METHODS = ['Phone', 'Text', 'Email'] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number];

/** One of the five areas the school asks for help in. */
export type Interest = {
  /** The value on the wire, and the key in the mail. */
  id: string;
  /** The school's own short name for it. */
  label: string;
  /** The school's own description of it, verbatim. */
  blurb: string;
};

export const INTERESTS: readonly Interest[] = [
  {
    id: 'prayer-warriors',
    label: 'Prayer Warriors',
    blurb: 'Commit to praying regularly for our mission and those we serve',
  },
  {
    id: 'promoters',
    label: 'Promoters',
    blurb:
      'Help spread the word about our school to the community and businesses using social ' +
      'media, flyers, and word of mouth.',
  },
  {
    id: 'directing-students',
    label: 'Directing Students',
    blurb: 'Assist in promoting the school to potential students.',
  },
  {
    id: 'donations',
    label: 'Donations',
    blurb: 'Contribute financially or provide needed supplies and resources.',
  },
  {
    id: 'volunteering',
    label: 'Volunteering',
    blurb:
      'Offer hands-on help during events, activities, or special projects.',
  },
];

export type VolunteerFields = {
  name: string;
  phone: string;
  email: string;
  contactMethod: ContactMethod;
  /** Interest ids, in the school's order rather than the order they were ticked. */
  interests: string[];
  comments: string;
};

export type VolunteerErrors = Partial<Record<keyof VolunteerFields, string>>;

export type ParsedVolunteer = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: VolunteerFields;
  /** Empty when the submission is good. */
  errors: VolunteerErrors;
};

/**
 * Read a submitted form, trimmed, with every complaint collected at once.
 *
 * Three things are required and three are not. A name, an email address and at
 * least one area of interest are the whole point of the form; a phone number is
 * not, because somebody who chose Email has already said how to reach them, and
 * a field demanded for symmetry is a field that loses volunteers.
 */
export function parseVolunteer(form: FormData): ParsedVolunteer {
  const offered = new Set(INTERESTS.map((interest) => interest.id));
  const ticked = form
    .getAll('interests')
    .filter((value): value is string => typeof value === 'string');

  const values: VolunteerFields = {
    name: text(form, 'name'),
    phone: text(form, 'phone'),
    email: text(form, 'email'),
    contactMethod: asContactMethod(text(form, 'contactMethod')),
    // Kept in the school's order rather than the browser's, so two identical
    // submissions read identically in Jill's inbox.
    interests: INTERESTS.map((interest) => interest.id).filter((id) =>
      ticked.includes(id),
    ),
    comments: text(form, 'comments'),
  };

  const errors: VolunteerErrors = {};
  if (!values.name) errors.name = 'We need a name to know who is offering.';
  if (!values.email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!isEmailAddress(values.email)) {
    errors.email = 'That does not look like an email address.';
  }
  if (values.interests.length === 0) {
    errors.interests =
      'Tick at least one area — it is what tells us how to use the help.';
  } else if (ticked.some((id) => !offered.has(id))) {
    errors.interests =
      'One of those areas is not one we asked about. Please tick them again.';
  }

  return { values, errors };
}

/**
 * The message the school receives.
 *
 * Plain text, laid out the way somebody reads it on a phone, and it carries the
 * volunteer's own address in the body rather than only in a header — a school
 * office forwards these, and a forwarded message loses its reply-to.
 */
export function volunteerMail(
  values: VolunteerFields,
  options: { to: string; from: string },
): Mail {
  const chosen = INTERESTS.filter((interest) =>
    values.interests.includes(interest.id),
  ).map((interest) => `  - ${interest.label}`);

  const lines = [
    `${values.name} would like to volunteer at Pharos Academy.`,
    '',
    `Email:            ${values.email}`,
    `Phone:            ${values.phone || '(not given)'}`,
    `Prefers:          ${values.contactMethod}`,
    '',
    'Areas of interest:',
    ...chosen,
  ];

  if (values.comments) {
    lines.push('', 'Comments or special skills:', values.comments);
  }

  lines.push('', 'Sent from the volunteer form on the Pharos Academy website.');

  return {
    to: options.to,
    from: options.from,
    subject: `Volunteer sign-up — ${values.name}`,
    text: lines.join('\n'),
  };
}

export type VolunteerResult = {
  ok: boolean;
  /** What to say on the page, in the school's voice rather than the mailer's. */
  message: string;
};

/**
 * Send it, and be honest about whether it went.
 *
 * `sender` may be absent, which is what a deployment with no mail credentials
 * looks like. That case and a refused send are deliberately the same case here:
 * both mean the school did not get this, and both must say so on screen with
 * the address to write to instead. **Nothing on this path may print a thank-you
 * it cannot back up** — a volunteer who believes they have signed up and has
 * not is the failure this whole function exists to prevent, and it is silent
 * for months.
 */
export async function submitVolunteer(
  values: VolunteerFields,
  options: { to: string; from: string; sender: Sender | undefined },
): Promise<VolunteerResult> {
  const fallback =
    `We could not send that just now — nothing was lost, but it did not reach us. ` +
    `Please email ${options.to} and we will pick it up from there.`;

  if (!options.sender) return { ok: false, message: fallback };

  try {
    await options.sender(volunteerMail(values, options));
    return {
      ok: true,
      message: `Thank you — that reached us. We will be in touch by ${values.contactMethod.toLowerCase()}.`,
    };
  } catch {
    // The mailer's own words belong in the server log, not on a page a
    // volunteer is reading; what they need is the address that works.
    return { ok: false, message: fallback };
  }
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function asContactMethod(value: string): ContactMethod {
  return (CONTACT_METHODS as readonly string[]).includes(value)
    ? (value as ContactMethod)
    : 'Email';
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}
