import { describe, expect, it } from 'vitest';

import { copyrightYear, parseSchoolDetails } from './school-details.js';

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
  for (const [name, value] of Object.entries(fields)) {
    // A checkbox posts nothing at all when it is unticked, and the parser reads
    // absence as off. Spelling that as an empty string here is the only way a
    // test can say "unticked" without a second helper.
    if (value !== '' || name !== 'bannerEnabled') data.set(name, value);
  }
  return data;
}

/** The banner switched on, with a message, a date and a link. */
function bannerForm(overrides: Record<string, string> = {}): FormData {
  return form({
    bannerEnabled: 'on',
    bannerMessage: 'Register now! Classes begin',
    bannerDate: '2026-08-31',
    bannerLink: 'https://example.org/register',
    ...overrides,
  });
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

  // #111. The registration fee is paid on someone else's page, so the same two
  // failures as the Give URL matter — but empty is a real answer here: it is
  // what makes the Apply page offer no online payment at all, rather than a
  // button that goes nowhere.
  it('reads the online payment link, and lets it be empty', () => {
    expect(
      parseSchoolDetails(form({ payOnlineUrl: '  https://secure.myvanco.com/YH8R/campaign  ' }))
        .values.payOnlineUrl,
    ).toBe('https://secure.myvanco.com/YH8R/campaign');

    const absent = parseSchoolDetails(form());
    expect(absent.values.payOnlineUrl).toBe('');
    expect(absent.errors).toEqual({});
  });

  it('rejects an online payment link that is not an absolute http(s) address', () => {
    expect(parseSchoolDetails(form({ payOnlineUrl: 'myvanco.com/YH8R' })).errors.payOnlineUrl)
      .toBeTruthy();
    expect(parseSchoolDetails(form({ payOnlineUrl: 'javascript:alert(1)' })).errors
      .payOnlineUrl).toBeTruthy();
    expect(parseSchoolDetails(form({ payOnlineUrl: '/pay' })).errors.payOnlineUrl)
      .toBeTruthy();
    expect(parseSchoolDetails(form({ payOnlineUrl: 'https://secure.myvanco.com/YH8R/home' }))
      .errors.payOnlineUrl).toBeUndefined();
  });

  /*
   * The giving-page link template (#265). The rules themselves are
   * `money/giving-link.test.ts`; what is checked here is that the form applies
   * them, against the payment link on the same submission rather than the one
   * already saved, and that empty stays the shipping state.
   */
  describe('the giving-page link template', () => {
    const PAY_ONLINE = 'https://secure.myvanco.com/YH8R/campaign/C-REGISTRATION';

    it('lets it be empty, whether or not there is a payment link', () => {
      expect(parseSchoolDetails(form()).errors.givingLinkTemplate).toBeUndefined();
      expect(
        parseSchoolDetails(form({ payOnlineUrl: PAY_ONLINE })).errors.givingLinkTemplate,
      ).toBeUndefined();
    });

    it('accepts the payment link with the two placeholders on it', () => {
      const result = parseSchoolDetails(
        form({
          payOnlineUrl: PAY_ONLINE,
          givingLinkTemplate: `  ${PAY_ONLINE}?amt={amount}  `,
        }),
      );
      expect(result.errors).toEqual({});
      expect(result.values.givingLinkTemplate).toBe(`${PAY_ONLINE}?amt={amount}`);
    });

    it('refuses one that does not start with the payment link, and says so', () => {
      const errors = parseSchoolDetails(
        form({
          payOnlineUrl: PAY_ONLINE,
          givingLinkTemplate: 'https://evil.example/pay?amt={amount}',
        }),
      ).errors;
      expect(errors.givingLinkTemplate).toContain(PAY_ONLINE);
    });

    it('refuses a placeholder it does not know', () => {
      expect(
        parseSchoolDetails(
          form({ payOnlineUrl: PAY_ONLINE, givingLinkTemplate: `${PAY_ONLINE}?amt={amt}` }),
        ).errors.givingLinkTemplate,
      ).toBeTruthy();
    });

    it('refuses one with no payment link to check it against', () => {
      expect(
        parseSchoolDetails(form({ givingLinkTemplate: `${PAY_ONLINE}?amt={amount}` })).errors
          .givingLinkTemplate,
      ).toBeTruthy();
    });

    // One complaint, about the field that has to be fixed first. Two would
    // point the office at the template when the payment link is what is wrong.
    it('says nothing about the template while the payment link is itself refused', () => {
      const errors = parseSchoolDetails(
        form({ payOnlineUrl: 'myvanco.com', givingLinkTemplate: `${PAY_ONLINE}?amt={amount}` }),
      ).errors;
      expect(errors.payOnlineUrl).toBeTruthy();
      expect(errors.givingLinkTemplate).toBeUndefined();
    });
  });

  it('keeps what was typed when it rejects it, so nothing has to be retyped', () => {
    const result = parseSchoolDetails(form({ email: 'not-an-email', mission: 'Kept.' }));
    expect(result.values.email).toBe('not-an-email');
    expect(result.values.mission).toBe('Kept.');
  });
});

describe('parsing the announcement banner', () => {
  it('reads the switch, the message, the date and the link', () => {
    const result = parseSchoolDetails(bannerForm());

    expect(result.errors).toEqual({});
    expect(result.values.bannerEnabled).toBe(true);
    expect(result.values.bannerMessage).toBe('Register now! Classes begin');
    expect(result.values.bannerDate).toBe('2026-08-31');
    expect(result.values.bannerLink).toBe('https://example.org/register');
  });

  // A checkbox posts nothing when it is unticked. "Absent" therefore has to
  // mean off, or the office could never turn the banner back off again.
  it('reads an unticked switch as off', () => {
    expect(parseSchoolDetails(form()).values.bannerEnabled).toBe(false);
  });

  // The switch exists so the banner can be turned off *without* emptying the
  // words the office will want again next August.
  it('accepts empty banner fields while the banner is off', () => {
    const result = parseSchoolDetails(
      form({ bannerMessage: '', bannerDate: '', bannerLink: '' }),
    );
    expect(result.errors).toEqual({});
  });

  it('will not show a banner with no message', () => {
    expect(parseSchoolDetails(bannerForm({ bannerMessage: '   ' })).errors.bannerMessage)
      .toBeTruthy();
  });

  // AC: a missing date. The date is half of what the bar says, and a banner
  // switched on without one is a sentence that stops mid-air.
  it('will not show a banner with no date', () => {
    expect(parseSchoolDetails(bannerForm({ bannerDate: '' })).errors.bannerDate).toBeTruthy();
  });

  // A real date, not free text — which is the whole reason it is its own field.
  it('rejects a banner date that is not a real day', () => {
    expect(parseSchoolDetails(bannerForm({ bannerDate: '2026-02-31' })).errors.bannerDate)
      .toBeTruthy();
    expect(parseSchoolDetails(bannerForm({ bannerDate: '31/08/2026' })).errors.bannerDate)
      .toBeTruthy();
  });

  // AC: a non-URL link. The link is optional, but a typed one leaves the site
  // exactly as the Give URL does, and the same two failures matter.
  it('rejects a banner link that is not an absolute http(s) address', () => {
    expect(parseSchoolDetails(bannerForm({ bannerLink: 'example.org' })).errors.bannerLink)
      .toBeTruthy();
    expect(parseSchoolDetails(bannerForm({ bannerLink: 'javascript:alert(1)' })).errors.bannerLink)
      .toBeTruthy();
    expect(parseSchoolDetails(bannerForm({ bannerLink: '/register' })).errors.bannerLink)
      .toBeTruthy();
  });

  it('accepts a banner with no link, because the link is the optional one', () => {
    const result = parseSchoolDetails(bannerForm({ bannerLink: '' }));
    expect(result.errors).toEqual({});
    expect(result.values.bannerLink).toBe('');
  });

  // A rejected date is still checked, switch or no switch: a typo left in the
  // field is a typo that goes live the moment the banner is switched on.
  it('checks a typed date and link even while the banner is off', () => {
    const result = parseSchoolDetails(
      form({ bannerDate: '2026-02-31', bannerLink: 'nope' }),
    );
    expect(result.errors.bannerDate).toBeTruthy();
    expect(result.errors.bannerLink).toBeTruthy();
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
