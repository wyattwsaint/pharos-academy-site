import { describe, expect, it } from 'vitest';

import { copyrightYear, formatStamp, parseSchoolDetails } from './school-details.js';

/** A complete, valid submission. Individual tests break one field at a time. */
function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    address: '9 Sherwood Drive\nEnola, PA 17025',
    phone: '717-497-0896',
    email: 'jkilker@enolacog.com',
    schoolYearStart: '2026-08-31',
    mission: 'Partnering with parents.',
    vision: 'Preparing students.',
    giveUrl: 'https://secure.myvanco.com/YH8R/home',
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('parsing a school-details submission', () => {
  it('accepts a complete form and trims what people paste', () => {
    const result = parseSchoolDetails(form({ phone: '  717-497-0896  ' }));
    expect(result.errors).toEqual({});
    expect(result.values.phone).toBe('717-497-0896');
    expect(result.values.address).toBe('9 Sherwood Drive\nEnola, PA 17025');
  });

  it('normalises pasted line endings in the address', () => {
    const result = parseSchoolDetails(form({ address: '9 Sherwood Drive\r\nEnola, PA 17025' }));
    expect(result.values.address).toBe('9 Sherwood Drive\nEnola, PA 17025');
  });

  it('requires every field', () => {
    const result = parseSchoolDetails(form({ address: '', mission: '   ' }));
    expect(Object.keys(result.errors).sort()).toEqual(['address', 'mission']);
  });

  it('rejects an address that is not an email address', () => {
    expect(parseSchoolDetails(form({ email: 'jkilker' })).errors.email).toBeTruthy();
    expect(parseSchoolDetails(form({ email: 'jkilker@' })).errors.email).toBeTruthy();
    expect(parseSchoolDetails(form({ email: 'a b@c.com' })).errors.email).toBeTruthy();
  });

  it('rejects a start date that is not a real day', () => {
    expect(parseSchoolDetails(form({ schoolYearStart: '31/08/2026' })).errors.schoolYearStart)
      .toBeTruthy();
    expect(parseSchoolDetails(form({ schoolYearStart: '2026-02-31' })).errors.schoolYearStart)
      .toBeTruthy();
  });

  // The Give URL leaves the site for someone else's payment page. A relative
  // path or a `javascript:` URL in that slot is a broken donate button at best.
  it('requires the Give URL to be an absolute http(s) address', () => {
    expect(parseSchoolDetails(form({ giveUrl: '/giving' })).errors.giveUrl).toBeTruthy();
    expect(parseSchoolDetails(form({ giveUrl: 'javascript:alert(1)' })).errors.giveUrl).toBeTruthy();
    expect(parseSchoolDetails(form({ giveUrl: 'secure.myvanco.com' })).errors.giveUrl).toBeTruthy();
    expect(parseSchoolDetails(form({ giveUrl: 'http://example.org/give' })).errors.giveUrl)
      .toBeUndefined();
  });

  it('keeps what was typed when it rejects it, so nothing has to be retyped', () => {
    const result = parseSchoolDetails(form({ email: 'not-an-email', mission: 'Kept.' }));
    expect(result.values.email).toBe('not-an-email');
    expect(result.values.mission).toBe('Kept.');
  });
});

describe('the copyright year', () => {
  // The live Wix site read "© 2025" all year. Computed, it cannot.
  it('is the year it is rendered in, not a stored value', () => {
    expect(copyrightYear(new Date('2026-08-05T12:00:00Z'))).toBe(2026);
    expect(copyrightYear(new Date('2031-01-01T12:00:00Z'))).toBe(2031);
  });

  // Vercel renders in UTC; Enola is five hours behind it. New Year's Eve in
  // Enola must not print next year's date on the school's own footer.
  it('turns over in Enola, not in the region that happened to render', () => {
    expect(copyrightYear(new Date('2031-01-01T02:00:00Z'))).toBe(2030);
  });
});

describe('the attribution stamp', () => {
  it('names the person and the day', () => {
    expect(formatStamp('Jill Kilker', new Date('2026-08-05T14:30:00Z'))).toBe(
      'Last edited by Jill Kilker on 5 August 2026',
    );
  });

  it('says so plainly when nothing has been edited yet', () => {
    expect(formatStamp(null, null)).toBe('Not edited yet');
    expect(formatStamp('Jill Kilker', null)).toBe('Not edited yet');
  });
});
