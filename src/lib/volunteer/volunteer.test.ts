import { describe, expect, it } from 'vitest';

import type { Mail } from '../backup/monthly.js';
import { flattenCapture as flatten, mirrorForm } from '../mirror.js';
import {
  CONTACT_METHODS,
  INTERESTS,
  parseVolunteer,
  submitVolunteer,
  volunteerMail,
  type VolunteerFields,
} from './volunteer.js';

/**
 * The second form the build owes (#30 AC 3), and the only one wired to a mailer
 * today — the inquiry is #25's.
 *
 * Two things are tested here and they are different in kind. The first is
 * provenance: the fields and the five areas of interest are the school's own,
 * transcribed from the live Google Form's capture, because a volunteer form
 * that quietly drops "Prayer Warriors" is a form that stops recruiting the
 * thing the school asked for most. The second is delivery: what is actually
 * sent, and — the failure that matters — what happens when the send fails.
 */
const published = flatten(mirrorForm('googleform_volunteer-info'));

function form(
  values: Partial<Omit<VolunteerFields, 'contactMethod' | 'interests'>> & {
    contactMethod?: string;
    interests?: string[];
  },
): FormData {
  const data = new FormData();
  data.set('name', values.name ?? 'Ruth Marsh');
  data.set('phone', values.phone ?? '717-555-0199');
  data.set('email', values.email ?? 'ruth@example.com');
  data.set('contactMethod', values.contactMethod ?? 'Email');
  data.set('comments', values.comments ?? '');
  for (const interest of values.interests ?? ['prayer-warriors']) {
    data.append('interests', interest);
  }
  return data;
}

describe('the areas the school asks for help in', () => {
  it('carries all five, in the school’s order', () => {
    expect(INTERESTS.map((interest) => interest.id)).toEqual([
      'prayer-warriors',
      'promoters',
      'directing-students',
      'donations',
      'volunteering',
    ]);
  });

  it.each(INTERESTS.map((interest) => [interest.id, interest] as const))(
    'transcribes %s from the school’s own form, label and description both',
    (_id, interest) => {
      expect(published).toContain(flatten(interest.label));
      expect(published).toContain(flatten(interest.blurb));
    },
  );

  it('offers the three contact methods the school offers', () => {
    expect([...CONTACT_METHODS]).toEqual(['Phone', 'Text', 'Email']);
    for (const method of CONTACT_METHODS) {
      expect(published).toContain(method);
    }
  });
});

describe('reading a submission', () => {
  it('takes a complete one', () => {
    const { values, errors } = parseVolunteer(form({}));
    expect(errors).toEqual({});
    expect(values.name).toBe('Ruth Marsh');
    expect(values.interests).toEqual(['prayer-warriors']);
  });

  it('collects every complaint at once rather than one per round trip', () => {
    const empty = new FormData();
    const { errors } = parseVolunteer(empty);
    expect(Object.keys(errors).sort()).toEqual(['email', 'interests', 'name']);
  });

  // A phone number is not required: somebody who picks Email as their contact
  // method has already said how to reach them, and demanding a number they
  // would rather not give is how a two-minute form stops being filled in.
  it('does not demand a phone number', () => {
    const { errors } = parseVolunteer(form({ phone: '' }));
    expect(errors.phone).toBeUndefined();
  });

  it('refuses an address that is not one, and an interest that is not offered', () => {
    expect(parseVolunteer(form({ email: 'ruth at example' })).errors.email).toBeDefined();
    expect(parseVolunteer(form({ interests: ['catering'] })).errors.interests).toBeDefined();
  });

  it('falls back to a contact method the school actually offers', () => {
    expect(parseVolunteer(form({ contactMethod: 'carrier pigeon' })).values.contactMethod).toBe(
      'Email',
    );
  });
});

describe('the message the school receives', () => {
  it('names the volunteer and every area they ticked, in words', () => {
    const { values } = parseVolunteer(form({ interests: ['prayer-warriors', 'donations'] }));
    const mail = volunteerMail(values, { to: 'office@example.org', from: 'site@example.org' });

    expect(mail.to).toBe('office@example.org');
    expect(mail.subject).toContain('Ruth Marsh');
    expect(mail.text).toContain('ruth@example.com');
    expect(mail.text).toContain('Prayer Warriors');
    expect(mail.text).toContain('Donations');
    expect(mail.attachment).toBeUndefined();
  });

  // The reply-to is the volunteer, so Jill can just hit reply. The `from` has
  // to stay the site's verified sender or the message does not arrive at all.
  it('replies to the volunteer, not to the website', () => {
    const { values } = parseVolunteer(form({}));
    const mail = volunteerMail(values, { to: 'office@example.org', from: 'site@example.org' });
    expect(mail.from).toBe('site@example.org');
    expect(mail.text).toContain('ruth@example.com');
  });
});

describe('sending it', () => {
  const options = { to: 'office@example.org', from: 'site@example.org' };

  it('reports a send that worked', async () => {
    const sent: Mail[] = [];
    const { values } = parseVolunteer(form({}));

    const result = await submitVolunteer(values, {
      ...options,
      sender: async (mail) => {
        sent.push(mail);
      },
    });

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
  });

  /*
   * The one that matters.
   *
   * A form that says "thank you" when nothing was sent is worse than one that
   * is plainly broken: the volunteer walks away believing the school has their
   * details, and the school never learns they offered. So a failed send must
   * say so, and must hand back the address to try instead.
   */
  it('never claims success when the send failed, and says where to write instead', async () => {
    const { values } = parseVolunteer(form({}));

    const result = await submitVolunteer(values, {
      ...options,
      sender: async () => {
        throw new Error('Resend refused the email (403): domain not verified');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('office@example.org');
  });

  it('says the same thing when there is no mailer configured at all', async () => {
    const { values } = parseVolunteer(form({}));

    const result = await submitVolunteer(values, { ...options, sender: undefined });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('office@example.org');
  });
});
