import { describe, expect, it } from 'vitest';

import { flattenCapture as flatten, mirrorExternalLinks, mirrorPage } from '../mirror.js';
import { publicPaths } from '../routes.js';
import {
  ABOUT_CHILDREN,
  ABOUT_PATH,
  CORE_VALUES,
  GIVING_INTRO,
  GIVING_LINK_LABEL,
  MEETING_PLACE,
  METHOD,
  PHAROS_MEANING,
  PHAROS_SOURCES,
  SUPPORT_PATH,
  VOLUNTEER_INTRO,
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
const coreValues = flatten(mirrorPage('core_values'));
const pharosMeaning = flatten(mirrorPage('general_8'));
const location = flatten(mirrorPage('about_1'));

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
    expect(mirrorExternalLinks()).toContain(MEETING_PLACE.href);
  });
});

describe('how the school asks for support', () => {
  const giving = flatten(mirrorPage('giving'));
  const volunteer = flatten(mirrorPage('volunteer'));

  it.each(GIVING_INTRO.map((paragraph, index) => [index + 1, paragraph] as const))(
    'transcribes paragraph %i of the giving explanation, word for word',
    (_number, paragraph) => {
      expect(giving).toContain(flatten(paragraph));
    },
  );

  it('uses the school’s own label for the link out', () => {
    expect(giving).toContain(GIVING_LINK_LABEL);
  });

  it.each(VOLUNTEER_INTRO.map((sentence, index) => [index + 1, sentence] as const))(
    'transcribes sentence %i of the volunteer ask, word for word',
    (_number, sentence) => {
      expect(volunteer).toContain(flatten(sentence));
    },
  );

  // The one sentence deliberately dropped: it instructs the reader to fill out
  // a Google Form on another domain, and the form is now on the page itself.
  it('drops the instruction about the Google Form, and only that', () => {
    expect(VOLUNTEER_INTRO.join(' ')).not.toContain('Volunteer Information Sheet');
  });

  it('lives under About, beside the rest of the section', () => {
    expect(SUPPORT_PATH).toBe('/about/support');
  });
});

describe('the About page', () => {
  it('is the parent of the rest of the section', () => {
    expect(ABOUT_PATH).toBe('/about');
  });

  // AC 1 is "reachable from the nav *or its parent*", and the nav is four
  // items. So About has to list what is under it, and every entry has to be a
  // path this site really serves — a section index pointing at a 404 is worse
  // than the Wix link hub it replaces.
  it('lists its children, and each of them is a route this site serves', () => {
    expect(ABOUT_CHILDREN.map((child) => child.path)).toEqual([
      '/about/beliefs',
      '/about/staff',
      SUPPORT_PATH,
    ]);
    for (const child of ABOUT_CHILDREN) {
      expect(publicPaths(), child.label).toContain(child.path);
    }
  });
});
