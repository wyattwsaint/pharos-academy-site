import { describe, expect, it } from 'vitest';

import { flattenCapture as flatten, mirrorExternalLinks, mirrorPage } from '../mirror.js';

import {
  BELIEFS_ARTICLES,
  BELIEFS_CLOSING,
  BELIEFS_NOTES,
  BELIEFS_PATH,
  HERE_WE_STAND,
} from './beliefs.js';

/**
 * The one test on this project that is about a real-world harm rather than a
 * defect (#18 §18).
 *
 * It reads the captured live page and asserts that every sentence this codebase
 * publishes as the school's doctrine is a sentence the school actually
 * published. Nothing here checks rendering — it checks provenance. A developer
 * tidying an em dash, closing article 8's unclosed citation or "improving" a
 * line of theology fails this immediately, which is the point: the school's
 * words are not ours to edit, and the mirror is the only copy of them we have.
 */
const publishedText = flatten(mirrorPage('statement_of_faith'));

describe('the Statement of Faith', () => {
  it('carries all eleven of the school’s articles', () => {
    expect(BELIEFS_ARTICLES).toHaveLength(11);
  });

  it.each(BELIEFS_ARTICLES.map((article, index) => [index + 1, article] as const))(
    'transcribes article %i from the school’s own page, word for word',
    (_number, article) => {
      expect(publishedText).toContain(flatten(article));
    },
  );

  it('transcribes the closing paragraph', () => {
    expect(publishedText).toContain(flatten(BELIEFS_CLOSING));
  });

  it('keeps the permission notes the text is reproduced under', () => {
    expect(BELIEFS_NOTES).toHaveLength(2);
    for (const note of BELIEFS_NOTES) {
      expect(publishedText).toContain(flatten(note));
    }
  });

  // Article 11 binds the school to a document it does not host. The published
  // page links it on the church's domain, and that exact URL is in the mirror's
  // link graph — so this asserts we are pointing at the same file, not at a
  // plausible-looking one.
  it('links Here We Stand 2016 at the address the school links it', () => {
    expect(mirrorExternalLinks()).toContain(HERE_WE_STAND.href);
  });

  it('lives under About, where the nav tree puts it', () => {
    expect(BELIEFS_PATH).toBe('/about/beliefs');
  });
});
