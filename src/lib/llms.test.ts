import { describe, expect, it } from 'vitest';

import { CLASS_VIEWS } from './courses/views.js';
import { renderLlmsTxt } from './llms.js';
import { PUBLIC_ROUTES, absoluteUrl, publicPaths } from './routes.js';
import { SCHOOL_DESCRIPTION } from './site.js';

const SITE = 'https://www.pharosacademy.net';

/** The catalogue's three list views, which are glossed; a class's own page is not. */
const CLASS_VIEW_PATHS: string[] = CLASS_VIEWS.map((view) => view.path);

describe('llms.txt', () => {
  it('opens with an H1 naming the school', () => {
    expect(renderLlmsTxt(SITE).startsWith('# Pharos Academy\n')).toBe(true);
  });

  it('lists every enumerated public route, and nothing else', () => {
    const body = renderLlmsTxt(SITE);
    const listed = [...body.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map((m) => m[1]);
    expect(listed).toEqual(publicPaths().map((path) => absoluteUrl(SITE, path)));
    expect(listed).toHaveLength(PUBLIC_ROUTES.length);
  });

  it('states the three facts a parent decides on', () => {
    const body = renderLlmsTxt(SITE).toLowerCase();
    expect(body).toContain('monday');
    expect(body).toContain('ages 4 to 18');
    expect(body).toContain('enola');
  });

  it('describes the school the one way the site describes it', () => {
    expect(renderLlmsTxt(SITE)).toContain(SCHOOL_DESCRIPTION);
  });

  it('quotes no class count, because this file cannot read the catalogue', () => {
    // #138. The summaries are typed literals with no database behind them, so
    // a number here is a number nothing keeps true. The surfaces that do read
    // the catalogue are free to state one; this one says "every class".
    const body = renderLlmsTxt(SITE);
    const COUNT =
      '\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|' +
      'fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
    expect(body).not.toMatch(new RegExp(`\\b(?:${COUNT})\\s+(?:\\w+\\s+)?(?:class|course)e?s\\b`, 'i'));
  });

  /*
   * #151 AC 8 — the summary is in step with the site.
   *
   * Two ways it fell out of step, both fixed and both now guarded. Four routes
   * were listed with no gloss at all, which is the one job this file has; and it
   * described a live, enrolling school as a site being rebuilt, which it stopped
   * being at the cutover.
   *
   * A class's own page is deliberately unglossed — there is one per class and the
   * summary would be the course description, which the page itself carries.
   */
  it('glosses every route except the classes’ own pages', () => {
    const body = renderLlmsTxt(SITE);
    const oneClassPage = (path: string) =>
      /^\/classes\/[^/]+$/.test(path) && !CLASS_VIEW_PATHS.includes(path);
    const unglossed = publicPaths()
      .filter((path) => !oneClassPage(path))
      .filter((path) => !new RegExp(`^- \\[${path}\\]\\([^)]+\\): .`, 'm').test(body));
    expect(unglossed).toEqual([]);
  });

  it('does not describe a live school’s site as unfinished', () => {
    const body = renderLlmsTxt(SITE).toLowerCase();
    for (const claim of ['being rebuilt', 'so far', 'coming soon', 'placeholder']) {
      expect(body, claim).not.toContain(claim);
    }
  });

  it('still lists a route that has no summary', () => {
    const body = renderLlmsTxt(SITE, [
      { path: '/unglossed', priority: 0.5, changefreq: 'monthly' },
    ]);
    expect(body).toContain(`- [/unglossed](${SITE}/unglossed)`);
    expect(body).not.toContain('undefined');
  });
});
