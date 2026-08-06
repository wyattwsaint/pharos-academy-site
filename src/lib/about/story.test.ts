import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ABOUT_PATH,
  CORE_VALUES,
  MEETING_PLACE,
  METHOD,
  PHAROS_MEANING,
  PHAROS_SOURCES,
} from './story.js';

/**
 * The same provenance test the Statement of Faith carries (#18 §18), for the
 * same reason and against two more captures.
 *
 * `/about` is assembled out of three Wix pages — `/core-values` (Method, Core
 * Values, Mission & Vision), `/general-8` (the essay on the name) and
 * `/about-1` (where the school meets). None of it is drafted, summarised or
 * tightened: what this build does is put the school's own paragraphs at one
 * address instead of four, and a developer who improves a sentence of it fails
 * here.
 *
 * Mission and vision are deliberately absent from this module. They are a
 * database row (`getSchoolDetails`), because the school edits them and the
 * mirror records them drifting across four hand-typed copies already.
 */
function mirror(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../docs/mirror/pages/${name}.txt`, import.meta.url)),
    'utf8',
  );
}

/** Wix's captures are full of non-breaking and zero-width marks; words survive. */
function flatten(text: string): string {
  return text.replace(/[ ​‎‏]/g, ' ').replace(/\s+/g, ' ').trim();
}

const coreValues = flatten(mirror('core_values'));
const pharosMeaning = flatten(mirror('general_8'));
const location = flatten(mirror('about_1'));

describe('the school’s method', () => {
  it('carries all six marks of it', () => {
    expect(METHOD.map((mark) => mark.word)).toEqual([
      'Christian',
      'Classical',
      'Church-based',
      'Covenantal',
      'Hybrid',
      'Microschool',
    ]);
  });

  it.each(METHOD.map((mark) => [mark.word, mark.text] as const))(
    'transcribes %s from the school’s own page, word for word',
    (_word, text) => {
      expect(coreValues).toContain(flatten(text));
    },
  );
});

describe('the core values', () => {
  it('carries all eight of them', () => {
    expect(CORE_VALUES.map((value) => value.subject)).toEqual([
      'God',
      'Scripture',
      'Salvation',
      'Family',
      'Learning',
      'Community',
      'Discipleship',
      'Leadership',
    ]);
  });

  it.each(CORE_VALUES.map((value) => [value.subject, value.text] as const))(
    'transcribes what the school believes about %s, word for word',
    (_subject, text) => {
      expect(coreValues).toContain(flatten(text));
    },
  );
});

describe('what “Pharos” means', () => {
  it.each(PHAROS_MEANING.map((paragraph, index) => [index + 1, paragraph] as const))(
    'transcribes paragraph %i of the school’s essay, word for word',
    (_number, paragraph) => {
      expect(pharosMeaning).toContain(flatten(paragraph));
    },
  );

  // The essay cites Encyclopaedia Britannica and a 1909 drawing in the public
  // domain. Both attributions are the school's, and dropping one while keeping
  // the sentence it belongs to would be us publishing an uncited claim.
  it('keeps the school’s own attributions', () => {
    for (const source of PHAROS_SOURCES) {
      expect(pharosMeaning).toContain(flatten(source));
    }
  });
});

describe('where the school meets', () => {
  it('names the host church as the school’s own page names it', () => {
    expect(location).toContain(flatten(MEETING_PLACE.name));
    expect(location).toContain(flatten(MEETING_PLACE.preamble));
  });

  // The church's own address, not a plausible-looking one: `/about-1` is where
  // the live site links it, and the mirror's link graph is the record of what
  // it linked.
  it('links the church at the address the school links it', () => {
    const external = readFileSync(
      fileURLToPath(new URL('../../../docs/mirror/data/external.json', import.meta.url)),
      'utf8',
    );
    expect(external).toContain(MEETING_PLACE.href);
  });
});

describe('the About page', () => {
  it('is the parent of the rest of the section', () => {
    expect(ABOUT_PATH).toBe('/about');
  });
});
