/**
 * The giving-page link, with the family's figures on it (#265).
 *
 * Vanco's campaign pages accept an amount on the query string — established by
 * loading the school's own campaign read-only in a browser, because Vanco
 * publishes no documentation for it. Nothing accepts a memo: `memo`, `memoline`,
 * `memoLine`, `memo_line` and `note` were all tried and all ignored, which is
 * why the reference is still hand-typed and still the only thing joining a
 * payment to an application (ADR-0013, ADR-0016).
 *
 * Because the parameter is undocumented and can change without warning, the
 * shape of the link is a **setting and not code**: the office pastes a template
 * carrying `{amount}` and `{reference}` into School Details, and whatever Vanco
 * supports next is a settings change rather than a deploy.
 *
 * Since #303 there are three campaigns and still one template, so it is checked
 * against the **class-fee** link — the one the site's single address became —
 * and at most one payment line can ever carry an amount. The complaints below
 * name that field, because it is the box the office has to fix.
 *
 * That freedom is why the checking here is severe. A box the office pastes a URL
 * into is a box a family's payment can be redirected out of, so a template is
 * refused unless it is the configured giving page — same origin, same path — and
 * the link the page renders falls back to the plain giving page on every way a
 * substitution can go wrong. **The button can never point somewhere that is not
 * the giving page**, and every branch below either substitutes cleanly or
 * returns the address the page used before this module existed.
 *
 * The arithmetic is not here. This module takes a number and writes it onto a
 * URL; what the number *is* belongs to `live.ts` (ADR-0019), and how the figure
 * is written to `settings.ts`, beside the formatter the page prints it with —
 * the browser writes the same figure onto the same link and cannot import this
 * module, so the rounding has one home and it is not here.
 */

import { moneyOnALink } from './settings.js';

/** The two placeholders a template may carry, and the whole of what it may carry. */
export const GIVING_LINK_PLACEHOLDERS = ['{amount}', '{reference}'] as const;

/** What is needed to write one link. `reference` is null until the row is written. */
export type GivingLinkOptions = {
  /** The configured giving page. Empty means the page offers no online payment. */
  payOnlineUrl: string;
  /** The configured template, which is empty far more often than not. */
  template: string;
  reference: string | null;
  /** What the family owes right now. */
  amount: number;
};

/** One link, and everything a page needs to know about it. */
export type GivingLink = {
  /** Where **Pay online** points, which is always the giving page. */
  href: string;
  /**
   * Whether the amount is on it — which is what the copy beside the button is
   * allowed to claim. Reported rather than left to be inferred: a page working
   * it out by comparing the href against the plain address would get a template
   * carrying only a reference exactly backwards.
   */
  carriesAmount: boolean;
};

/**
 * Why this template may not be saved, or null if it may.
 *
 * Every complaint names the rule it broke, because the office is pasting
 * something out of MyVanco and "invalid" would leave them guessing which half
 * of it the site objected to.
 */
export function givingLinkTemplateError(template: string, payOnlineUrl: string): string | null {
  // Empty is the shipping state and never a mistake — see the module comment.
  if (template === '') return null;

  if (payOnlineUrl === '') {
    return 'Set the class fees payment link first — there is nothing to check this template against.';
  }

  const givingPage = webAddress(payOnlineUrl);
  if (!givingPage) {
    return 'Fix the class fees payment link first — this template is checked against it.';
  }

  const candidate = webAddress(template);
  if (!candidate) {
    return 'The link template needs a full web address starting http:// or https://.';
  }

  /*
   * The origin is compared parsed *and* textually. Parsing is what defeats
   * `https://secure.myvanco.com@evil.example/…`, whose origin is not what it
   * reads as; the textual check is what stops a placeholder from ever sitting
   * in the host, which is the one place substitution could move the link off
   * the giving page. The path is compared at its own boundary, so that
   * `/C-REGISTRATION-STAFF-PARTY` is not within `/C-REGISTRATION`.
   */
  const sameGivingPage =
    candidate.origin === givingPage.origin &&
    template.startsWith(givingPage.origin) &&
    isPathWithin(candidate.pathname, givingPage.pathname);
  if (!sameGivingPage) {
    return `The link template has to start with the class fees payment link — ${payOnlineUrl}.`;
  }

  if (hasUnknownPlaceholder(template)) {
    return `The link template can only use ${GIVING_LINK_PLACEHOLDERS.join(' and ')}.`;
  }

  return null;
}

/**
 * The link to put on **Pay online**.
 *
 * The template is checked again here rather than trusted from the save: the
 * giving page can be edited afterwards, and a template that was the giving page
 * in March is not one in September. Every way a substitution can fail — no
 * template, a template that is no longer the giving page, an unknown
 * placeholder, a reference that does not exist yet, an amount that is not a
 * number — lands on the plain address, which is what the page rendered before
 * this module existed.
 */
export function givingLink(options: GivingLinkOptions): GivingLink {
  const { payOnlineUrl, template, reference, amount } = options;
  if (payOnlineUrl === '' || template === '') return plain(payOnlineUrl);
  if (givingLinkTemplateError(template, payOnlineUrl) !== null) return plain(payOnlineUrl);

  let pattern = template;
  if (pattern.includes('{reference}')) {
    // No reference yet — the application has not been sent. A link carrying a
    // literal `{reference}` is worse than one carrying nothing.
    if (!reference) return plain(payOnlineUrl);
    pattern = pattern.replaceAll('{reference}', encodeURIComponent(reference));
  }

  const carriesAmount = pattern.includes('{amount}');
  const href = carriesAmount ? withAmount(pattern, amount) : pattern;

  /*
   * The link is written once, here, and nothing moves it afterwards (#304).
   *
   * It used to hand the page the pattern as well, so the browser could
   * re-substitute the amount as a family ticked classes — a link on the form
   * stage had to keep up with a total that was still moving. Since #304 the
   * only link a family is given is on the confirmation, where the figures have
   * stopped, so the substitution happens once and there is nothing to keep in
   * step.
   */

  // The last gate, after every substitution: if what came out is not the giving
  // page, the family goes to the giving page.
  if (href === null || givingLinkTemplateError(href, payOnlineUrl) !== null) {
    return plain(payOnlineUrl);
  }

  return { href, carriesAmount };
}

/** The plain giving page, carrying nothing. What every failure above falls back to. */
function plain(payOnlineUrl: string): GivingLink {
  return { href: payOnlineUrl, carriesAmount: false };
}

function withAmount(pattern: string, amount: number): string | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  return pattern.replaceAll('{amount}', moneyOnALink(amount));
}

/** `/L-ZZ7H/campaign/C-REG` is not within `/L-ZZ7H/campaign/C-REGISTRATION`. */
function isPathWithin(path: string, base: string): boolean {
  if (path === base) return true;
  return path.startsWith(base.endsWith('/') ? base : `${base}/`);
}

/**
 * Any brace left once the two known placeholders are removed.
 *
 * Written as a removal rather than a list of names so that `{amt}`, `{Amount}`,
 * `{{amount}}` and a placeholder somebody forgot to close are all the same
 * answer. A stray brace in a URL is a typo whichever shape it takes.
 */
function hasUnknownPlaceholder(template: string): boolean {
  let rest = template;
  for (const placeholder of GIVING_LINK_PLACEHOLDERS) rest = rest.replaceAll(placeholder, '');
  return rest.includes('{') || rest.includes('}');
}

function webAddress(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}
