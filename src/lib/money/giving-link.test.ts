import { describe, expect, it } from 'vitest';

import { givingLink, givingLinkTemplateError, type GivingLink } from './giving-link.js';

const GIVING_PAGE = 'https://secure.myvanco.com/YH8R/campaign/C-REGISTRATION';
const TEMPLATE = `${GIVING_PAGE}?amt={amount}`;
const REFERENCE = 'PA-4KMN-7QTW';

describe('checking a giving-page link template', () => {
  it('accepts the giving page itself, with the two placeholders on it', () => {
    expect(givingLinkTemplateError(TEMPLATE, GIVING_PAGE)).toBeNull();
    expect(
      givingLinkTemplateError(`${GIVING_PAGE}?amt={amount}&memo={reference}`, GIVING_PAGE),
    ).toBeNull();
    // A deeper path under the same campaign is still the same campaign.
    expect(givingLinkTemplateError(`${GIVING_PAGE}/donate?amt={amount}`, GIVING_PAGE)).toBeNull();
  });

  it('accepts an empty template — it is how this ships', () => {
    expect(givingLinkTemplateError('', GIVING_PAGE)).toBeNull();
    expect(givingLinkTemplateError('', '')).toBeNull();
  });

  /*
   * The whole point of the check (#265). A paste error in this box is a family's
   * payment sent to whoever owns the address that got pasted, so anything that
   * is not the configured giving page is refused before it can be saved.
   */
  it('refuses another host, however much it looks like the right one', () => {
    for (const template of [
      'https://secure.myvanco.com.evil.example/YH8R/campaign/C-REGISTRATION?amt={amount}',
      'https://evil.example/YH8R/campaign/C-REGISTRATION?amt={amount}',
      'http://secure.myvanco.com/YH8R/campaign/C-REGISTRATION?amt={amount}',
      'https://secure.myvanco.com:8443/YH8R/campaign/C-REGISTRATION?amt={amount}',
    ]) {
      expect(givingLinkTemplateError(template, GIVING_PAGE)).toBeTruthy();
    }
  });

  it('refuses another path on the right host, including one that merely starts the same', () => {
    expect(
      givingLinkTemplateError(`${GIVING_PAGE}-STAFF-PARTY?amt={amount}`, GIVING_PAGE),
    ).toBeTruthy();
    expect(
      givingLinkTemplateError('https://secure.myvanco.com/YH8R/home?amt={amount}', GIVING_PAGE),
    ).toBeTruthy();
  });

  it('refuses what is not an absolute http(s) address at all', () => {
    expect(givingLinkTemplateError('?amt={amount}', GIVING_PAGE)).toBeTruthy();
    expect(givingLinkTemplateError('javascript:alert(1)', GIVING_PAGE)).toBeTruthy();
    expect(givingLinkTemplateError('secure.myvanco.com/YH8R?amt={amount}', GIVING_PAGE)).toBeTruthy();
  });

  // Two placeholders and no others, so a typo cannot survive as a literal
  // `{amt}` in the query string a family is sent to.
  it('refuses a placeholder it does not know', () => {
    expect(givingLinkTemplateError(`${GIVING_PAGE}?amt={amt}`, GIVING_PAGE)).toBeTruthy();
    expect(givingLinkTemplateError(`${GIVING_PAGE}?amt={Amount}`, GIVING_PAGE)).toBeTruthy();
    expect(givingLinkTemplateError(`${GIVING_PAGE}?amt={{amount}}`, GIVING_PAGE)).toBeTruthy();
    expect(givingLinkTemplateError(`${GIVING_PAGE}?amt={amount`, GIVING_PAGE)).toBeTruthy();
  });

  // There is nothing to check a template against until the giving page is set,
  // and an unchecked template is the one thing this box may never hold.
  it('refuses a template when no giving page is configured', () => {
    expect(givingLinkTemplateError(TEMPLATE, '')).toBeTruthy();
  });
});

describe('the link a family clicks', () => {
  /** One link, from the giving page and a template, for a family who owes $1285. */
  function link(overrides: Partial<Parameters<typeof givingLink>[0]> = {}): GivingLink {
    return givingLink({
      payOnlineUrl: GIVING_PAGE,
      template: TEMPLATE,
      reference: REFERENCE,
      amount: 1285,
      ...overrides,
    });
  }

  /** The state every failure below has to land in: the plain address, carrying nothing. */
  const PLAIN: GivingLink = { href: GIVING_PAGE, carriesAmount: false, pattern: null };

  it('carries the amount and the reference', () => {
    expect(link({ template: `${GIVING_PAGE}?amt={amount}&memo={reference}` })).toEqual({
      href: `${GIVING_PAGE}?amt=1285&memo=PA-4KMN-7QTW`,
      carriesAmount: true,
      pattern: `${GIVING_PAGE}?amt={amount}&memo=PA-4KMN-7QTW`,
    });
  });

  it('writes cents only when there are cents', () => {
    expect(link().href).toBe(`${GIVING_PAGE}?amt=1285`);
    expect(link({ amount: 0 }).href).toBe(`${GIVING_PAGE}?amt=0`);
    expect(link({ amount: 1285.5 }).href).toBe(`${GIVING_PAGE}?amt=1285.50`);
  });

  /*
   * The button can never point somewhere that is not the giving page (#265).
   * Every way a substitution can fail lands on the plain address, which is
   * exactly what the page did before this existed.
   */
  it('falls back to the plain giving page whenever anything is off', () => {
    expect(link({ template: '' })).toEqual(PLAIN);
    expect(link({ template: 'https://evil.example/?amt={amount}' })).toEqual(PLAIN);
    expect(link({ template: `${GIVING_PAGE}?amt={amt}` })).toEqual(PLAIN);
    expect(link({ amount: Number.NaN })).toEqual(PLAIN);
    expect(link({ amount: -5 })).toEqual(PLAIN);
  });

  // Before the application is sent there is no reference to carry, so a
  // template that asks for one has nothing to substitute — and a link with a
  // literal `{reference}` in it is worse than the plain address (ADR-0016).
  it('falls back when the template wants a reference and there is none yet', () => {
    expect(link({ template: `${GIVING_PAGE}?amt={amount}&memo={reference}`, reference: null }))
      .toEqual(PLAIN);

    // A template that never asks for one is unaffected.
    expect(link({ reference: null }).href).toBe(`${GIVING_PAGE}?amt=1285`);
  });

  it('is the plain giving page when there is no giving page to be', () => {
    expect(link({ payOnlineUrl: '' })).toEqual({ href: '', carriesAmount: false, pattern: null });
  });

  /*
   * What the copy beside the button is allowed to claim, reported rather than
   * inferred: a page deducing it by comparing the href against the plain
   * address would say "the amount is already in the box" about a template that
   * only ever carried a reference.
   */
  it('says it carries no amount when the template names none', () => {
    const carried = link({ template: `${GIVING_PAGE}?memo={reference}` });
    expect(carried.href).toBe(`${GIVING_PAGE}?memo=PA-4KMN-7QTW`);
    expect(carried.carriesAmount).toBe(false);
    // And nothing for the browser to move, so the server's href stands.
    expect(carried.pattern).toBeNull();
  });
});
