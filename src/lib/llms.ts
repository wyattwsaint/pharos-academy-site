import { SUPPORT_PATH } from './about/story.js';
import { NEWS_PATH } from './announcements/views.js';
import { APPLICATION_PATH } from './application/application.js';
import { CALENDAR_PATH } from './calendar/views.js';
import { CURRENT_FAMILIES_PATH } from './current-families/section.js';
import { INQUIRY_PATH } from './inquiry/inquiry.js';
import { STAFF_PATH } from './people/views.js';
import { POLICIES_PATH } from './policies/views.js';
import { TEACH_PATH } from './teach/teach.js';
import { PUBLIC_ROUTES, absoluteUrl } from './routes.js';
import { SCHOOL_DESCRIPTION, SCHOOL_NAME } from './site.js';

/**
 * One-line summaries for the `llms.txt` link list, keyed by public path.
 *
 * A route with no summary still appears — it is in `PUBLIC_ROUTES`, which is
 * the single list — it just carries no gloss. Silence beats a second route list
 * that can fall out of step with the first.
 *
 * No summary states a class count (#138). These are typed literals with no
 * database behind them, so a number here is one nothing keeps true; the pages
 * that read the catalogue state the count, and this file says "every class".
 */
const SUMMARIES: Record<string, string> = {
  '/': 'What Pharos Academy is, which mornings classes run, which ages, and what it costs.',
  '/classes': 'Every class for 2026–2027, grouped by the ages it is open to.',
  '/classes/by-day':
    'The timetable, drawn to scale — which classes run when, and which of them overlap.',
  '/classes/descriptions':
    'The full description, texts, prerequisites and fees for every class.',
  [STAFF_PATH]: 'Who runs the school and who teaches each class.',
  [NEWS_PATH]: 'Board updates, fundraisers and notices for current families, newest first.',
  [POLICIES_PATH]:
    'The school’s published policies as downloadable documents, each with what it is and when ' +
    'it was last updated. Nothing here requires a login.',
  '/about':
    'What the school is for, how it teaches, what it believes, where the name comes from, and ' +
    'where it meets.',
  [SUPPORT_PATH]:
    'How to give to the school and how to volunteer, including the volunteer form and the five ' +
    'areas the school asks for help in.',
  '/about/beliefs':
    'The Statement of Faith and Practice, in full — what the school teaches from, and what ' +
    'families are asked to read before applying.',
  [TEACH_PATH]:
    'For people who might teach a class — instructors are independent contractors, and this ' +
    'carries the contract and the Pennsylvania clearances required.',
  /*
   * Both audiences by name (#298). A model asked whether a cyber charter
   * student can take an outside class near Harrisburg cannot infer the answer
   * from “the families the school serves”, and this file exists so it does not
   * have to infer.
   */
  '/admissions':
    'How to apply — homeschooling and cyber school families alike, what makes the school ' +
    'different, the registration fee and per-class deposit, and which documents families sign.',
  /*
   * The four that were missing (#151 AC 8).
   *
   * Each was a route in `PUBLIC_ROUTES` appearing here as a bare link, which is
   * the one thing this file is for and the one thing an unglossed link does not
   * do: a model reading `/inquire` learns nothing a URL did not already say.
   * They are the school's two front doors and the section a current family
   * lives in.
   */
  [CURRENT_FAMILIES_PATH]:
    'The section for families already at the school — the calendar, news and the policies. ' +
    'Nothing in it requires a login.',
  [CALENDAR_PATH]:
    'Every class date for the school year by day track, the days the school is closed, and the ' +
    'year’s one-off events. Subscribable and printable.',
  [INQUIRY_PATH]:
    'The form for asking the school a question, and the school’s own phone number and email ' +
    'address. This is the school’s preferred first contact.',
  [APPLICATION_PATH]:
    'The application itself — the classes a family is enrolling in, the fees due, and the ' +
    'documents signed. Reached after an inquiry rather than cold.',
};

/**
 * `llms.txt` — a plain-language description of the site for language models,
 * generated from the same enumerated route list as the sitemap.
 *
 * Kept short on purpose. The value is that a model answering "is there a
 * classical Christian school near Harrisburg" gets the three facts a parent
 * needs (which mornings, which ages, how much) rather than inferring them.
 */
export function renderLlmsTxt(site: string | URL, routes = PUBLIC_ROUTES): string {
  const links = routes.map((route) => {
    const url = absoluteUrl(site, route.path);
    const summary = SUMMARIES[route.path];
    return summary ? `- [${route.path}](${url}): ${summary}` : `- [${route.path}](${url})`;
  });

  return [
    `# ${SCHOOL_NAME}`,
    '',
    `> ${SCHOOL_DESCRIPTION} in Enola, Pennsylvania, serving ages 4 to 18.`,
    '> Families choose individual classes and teach the rest at home. Classes meet on Monday,',
    '> Wednesday and Thursday mornings.',
    '',
    /*
     * What this file says about the site, reviewed against the site (#151 AC 8).
     *
     * It said "This site is being rebuilt. Only the pages listed below exist so
     * far." for as long as that was true and then for a while after it was not:
     * the domain now points here, `robots.txt` answers `Allow: /`, and a model
     * told a live school's website is a work in progress is a model that hedges
     * a family's question about a school that is enrolling.
     *
     * The claim that remains is the one still worth making — this list is
     * complete, generated from the same route list as the sitemap, so a page
     * absent from it is a page that does not exist rather than one omitted.
     */
    'Every page of the site is listed below, generated from the same route list as the sitemap.',
    'Each class also has its own page, linked from the class lists.',
    '',
    '## Pages',
    '',
    ...links,
    '',
  ].join('\n');
}
