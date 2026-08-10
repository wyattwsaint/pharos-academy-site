/**
 * What is wrong with an application — the rules, with nothing else attached.
 *
 * A leaf on purpose. At runtime this module imports one function, the shared
 * email check in `../forms.js`; everything else it needs is a type, and types
 * weigh nothing once the build has run. `application.js` next door is the
 * opposite: it reaches the price list, the catalogue, the timetable and the
 * Statement of Faith, because totalling a cheque and finding a clash need all
 * four.
 *
 * The split exists for the browser. #85 runs these same rules on the page as a
 * family types, so that **Send the application** can be greyed until the form
 * is complete; importing them from `application.js` would drag the pricing and
 * timetable graphs into the browser bundle to discover that a text field is
 * empty. Keeping this module a leaf is what makes that import cheap, so
 * **nothing that is not a rule about a field belongs here** — see ADR-0009.
 *
 * **The children's sensitive data does not enter the site.** No rule here may
 * name a date of birth, an address, a medical condition, an evaluation or a
 * custody arrangement, because no such field exists to have a rule about.
 * `application.test.ts` reads this file back and fails if one appears.
 * **ADR-0007** holds that decision and what reversing it would cost.
 */

import type { ApplicationErrors, ApplicationFields } from './application.js';
import { isEmailAddress } from '../forms.js';

/**
 * Everything wrong with an application, in one pass.
 *
 * Four things can be wrong and none of them is an opinion: who is applying, how
 * to reach them, who the children are, and whether any class was chosen. The
 * Statement of Faith cannot appear here — see `isFlagged`.
 */
export function validateApplication(values: ApplicationFields): ApplicationErrors {
  const errors: ApplicationErrors = {};

  if (!values.familyName) errors.familyName = 'We need a family name for the application.';
  if (!values.email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!isEmailAddress(values.email)) {
    errors.email = 'That does not look like an email address.';
  }

  const named = values.children.filter((child) => child.name);
  if (named.length === 0) {
    errors.children = 'Tell us at least one child’s name, and their age.';
  } else if (named.some((child) => !child.age)) {
    errors.children = 'Each child needs an age beside their name.';
  }

  if (values.children.every((child) => child.offeringKeys.length === 0)) {
    errors.classes = 'Choose at least one class. If you are not sure yet, write to us instead.';
  }

  return errors;
}
