import { PUBLIC_ROUTES, absoluteUrl } from './routes.js';
import { SCHOOL_NAME } from './site.js';

/**
 * One-line summaries for the `llms.txt` link list, keyed by public path.
 *
 * A route with no summary still appears — it is in `PUBLIC_ROUTES`, which is
 * the single list — it just carries no gloss. Silence beats a second route list
 * that can fall out of step with the first.
 */
const SUMMARIES: Record<string, string> = {
  '/': 'What Pharos Academy is, which mornings classes run, which ages, and what it costs.',
  '/classes': 'Every class for 2026–2027, grouped by the ages it is open to.',
  '/classes/by-day':
    'The timetable, drawn to scale — which classes run when, and which of them overlap.',
  '/classes/full-descriptions':
    'The full description, texts, prerequisites and fees for all nineteen classes.',
  '/staff': 'Who runs the school and who teaches each class.',
  '/news': 'Board updates, fundraisers and notices for current families, newest first.',
  '/about/beliefs':
    'The Statement of Faith and Practice, in full — what the school teaches from, and what ' +
    'families are asked to read before applying.',
  '/admissions':
    'How to apply — who the classes are for, which mornings they run, what applying involves, ' +
    'the registration fee and per-class deposit, and which documents families sign.',
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
    '> A Christian classical hybrid microschool in Enola, Pennsylvania, serving ages 4 to 18.',
    '> Families choose individual classes and teach the rest at home. Classes meet on Monday,',
    '> Wednesday and Thursday mornings.',
    '',
    'This site is being rebuilt. Only the pages listed below exist so far.',
    '',
    '## Pages',
    '',
    ...links,
    '',
  ].join('\n');
}
