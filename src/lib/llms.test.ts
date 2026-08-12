import { describe, expect, it } from 'vitest';

import { renderLlmsTxt } from './llms.js';
import { PUBLIC_ROUTES, absoluteUrl, publicPaths } from './routes.js';
import { SCHOOL_DESCRIPTION } from './site.js';

const SITE = 'https://www.pharosacademy.net';

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

  it('still lists a route that has no summary', () => {
    const body = renderLlmsTxt(SITE, [
      { path: '/unglossed', priority: 0.5, changefreq: 'monthly' },
    ]);
    expect(body).toContain(`- [/unglossed](${SITE}/unglossed)`);
    expect(body).not.toContain('undefined');
  });
});
