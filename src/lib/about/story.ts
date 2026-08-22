/**
 * What the school says about itself (#30).
 *
 * The live site spread this across three addresses — `/core-values` (the
 * Method, the Core Values and the Mission & Vision), `/general-8` (an essay on
 * where the name comes from) and `/about-1` (where it meets) — behind an
 * `/about` that was a link hub with no content of its own. All three land on
 * one page here, and all three 301 to it.
 *
 * **Every string below is transcribed, not written.** The test beside this file
 * reads the captures in `docs/mirror/pages/` and fails on any drift, including
 * a tidied dash or a corrected space. The school's account of its own
 * convictions is not ours to edit, and this is the only copy of it we hold.
 *
 * Mission and vision are the one exception, and they are absent from here on
 * purpose: they live in the school details row, because the school edits them
 * and the mirror already caught four hand-typed copies drifting apart.
 */

/** Where this page lives, so links to it are written once. */
export const ABOUT_PATH = '/about';

/**
 * Where giving and volunteering live — one page, because they are one question.
 *
 * The Wix site had three addresses for it: `/giving`, `/volunteer`, and
 * `/about-5`, which is byte-for-byte the volunteer page and is labelled "Media"
 * in the nav. All three land here.
 */
export const SUPPORT_PATH = '/about/support';

/**
 * What sits under About, listed on About itself.
 *
 * #30 AC 1 is "reachable from the nav **or its parent**", and this is the
 * parent half of it. The nav is four items by design and cannot carry seven, so
 * the section index has to actually index the section — a nav item whose page
 * silently has three children the reader cannot see is the Wix failure this
 * ticket is undoing, not repeating.
 *
 * Written here rather than in the template because the test walks it: each
 * entry has to be a path this site really serves.
 */
export const ABOUT_CHILDREN: readonly { path: string; label: string; blurb: string }[] = [
  {
    path: '/about/beliefs',
    label: 'Statement of Faith and Practice',
    blurb:
      'The eleven articles in full — what families are asked to read before applying, and what ' +
      'the application asks them to say where they agree and where they do not.',
  },
  {
    path: '/about/staff',
    label: 'Who Teaches Here',
    blurb: 'Everyone who runs the school and everyone who teaches a class, with what they teach.',
  },
  {
    path: SUPPORT_PATH,
    label: 'Giving and Volunteering',
    blurb: 'How gifts to the school are handled today, and the five areas we need help in.',
  },
];

/** One of the six words the school describes its method with. */
export type MethodMark = {
  /** The word, in the school's own order. */
  word: string;
  /** The school's paragraph about it, verbatim. */
  text: string;
};

/**
 * The six marks of the method, in the order the school lists them.
 *
 * The live page shouts each word in capitals mid-sentence. That is a Wix
 * styling habit rather than a spelling, so the heading carries the word and the
 * paragraph keeps the school's own sentence exactly as published — capitals and
 * all. Nothing is re-cased inside the quoted text.
 */
export const METHOD: readonly MethodMark[] = [
  {
    word: 'Christian',
    text:
      'Our students will be guided to adopt a CHRISTIAN worldview, anchoring all that we do in ' +
      "the principles of God's Word.",
  },
  {
    word: 'Classical',
    text:
      'Our students will thrive under a CLASSICAL teaching approach that emphasizes goodness, ' +
      'truth, and beauty while pursuing excellence, as they explore rich curriculum.',
  },
  {
    word: 'Church-based',
    text:
      'Our families, as part of this CHURCH-BASED school, are encouraged to actively participate ' +
      'in a Christian church community. Affiliation with Pharos Academy’s partner, Enola First ' +
      'Church of God, is not mandatory for parents or students.',
  },
  {
    word: 'Covenantal',
    text:
      'As the cornerstone of our COVENANTAL school community, parents will sign a partnership ' +
      'agreement affirming that, while their children are entrusted to Pharos Academy’s care, ' +
      'they will fully support the school in educating their children according to its ' +
      'principles, mission, vision, core values, and statement of faith.',
  },
  {
    word: 'Hybrid',
    text:
      'Students flourish in our innovative hybrid model, which beautifully blends the structure ' +
      'and community of classroom learning with the flexibility and personalization of ' +
      'homeschooling. Families enjoy the convenience of dropping off their children for engaging ' +
      'small-group classes, or they may relax in our parent lounge. At the same time, we ' +
      'actively support parents as the primary guides of their children’s education at ' +
      'home—providing resources, guidance, and encouragement every step of the way. This ' +
      'approach is rooted in H.O.P.E. — Helping Our Parents Educate.',
  },
  {
    word: 'Microschool',
    text:
      'Your child will thrive in our vibrant microschool, where small-group classes allow ' +
      'parents to select a variety of subjects and experiences.',
  },
];

/** One of the eight subjects the school states a conviction about. */
export type CoreValue = {
  /** The subject, as the school labels it. */
  subject: string;
  /** What the school says it believes about that subject, verbatim. */
  text: string;
};

/**
 * The eight core values, in the school's own order.
 *
 * The label is split off the sentence so the page can set it as a heading; the
 * sentence itself is untouched. These overlap the Statement of Faith and do not
 * replace it — the page says so and links it, because the application gates on
 * the longer document and a family reading the short version alone would be
 * agreeing to something they have not seen.
 */
export const CORE_VALUES: readonly CoreValue[] = [
  {
    subject: 'God',
    text:
      'We believe God is one God Who exists as and manifests Himself in the three Persons of the ' +
      'Father, Son, and Holy Spirit.',
  },
  {
    subject: 'Scripture',
    text:
      'We believe that the Bible is the Word of God, is our rule of faith, and is the guide for ' +
      'how we think, speak, and act, as well as the lens through which we view and engage ' +
      'culture.',
  },
  {
    subject: 'Salvation',
    text:
      'We believe salvation comes by grace through faith by accepting Jesus Christ as Lord and ' +
      'Savior. By His death on the cross, Jesus paid the price for our sins so that we can be ' +
      'forgiven of our sins and be reconciled to God.',
  },
  {
    subject: 'Family',
    text:
      'We believe that the responsibility to train and educate a child belongs to the parents, ' +
      'and it is our goal to assist parents in this biblical endeavor.',
  },
  {
    subject: 'Learning',
    text:
      'We believe that the use of Classical Education leads to wisdom; virtue; and a love of ' +
      'goodness, truth, and beauty as seen throughout all curricular areas.',
  },
  {
    subject: 'Community',
    text:
      'We believe in the value of individuals as people created in God’s image, celebrate their ' +
      'gifts, encourage mutual growth, and care for others.',
  },
  {
    subject: 'Discipleship',
    text:
      'We believe in the use of Truth to develop a mature and growing faith in Christ, to build ' +
      'godly relationships, to develop the fruit of the Spirit, and to share the love of Christ ' +
      'with others.',
  },
  {
    subject: 'Leadership',
    text:
      'We believe in the calling to be servant-leaders in our families, churches, and ' +
      'communities, and desire to use godly wisdom, grace, and love to impact our world for ' +
      'Christ.',
  },
];

/**
 * The essay on the name, in three paragraphs, from `/general-8`.
 *
 * It is here rather than at its own address because a Wix slug called
 * `general-8` is not a page anybody navigates to on purpose, and because the
 * question it answers — why is a school called Pharos — is an About question.
 * The old address 301s here.
 */
export const PHAROS_MEANING: readonly string[] = [
  'Pharos Academy derives its name from the Greek word “pharos” (φάρος). The Lighthouse of ' +
    'Alexandria, Egypt, one of the Seven Wonders of the World stood on the island of Pharos in ' +
    'the harbor of Alexandria and is said to have been more than 350 feet (110 meters) high; the ' +
    'only taller man-made structures at the time would have been the pyramids of Giza. It was a ' +
    'technological triumph and is the archetype of all lighthouses since (Source: Encyclopedia ' +
    'Britannica). The lighthouse was built around 300 B.C. and was still standing until the 12th ' +
    'century A.D.',
  'The Greek word “pharos” spans both the Classical and Koine Greek periods, evolving in meaning ' +
    'over time. During the Classical era (500–323 BCE), it referred to a “plough.” By the Koine ' +
    'era (323 BCE–600 CE), however, “pharos” had come to mean “lighthouse,” a shift linked to the ' +
    'iconic Lighthouse of Alexandria on Pharos Island.',
  'Pharos Academy also draws its name from two core inspirations. First, we aim to shine as a ' +
    'beacon among educational institutions, collaborating with parents to deliver a classical ' +
    'education marked by excellence, much like a lighthouse guides through the dark. Second, we ' +
    'connect to the Koine Greek era, the language of the New Testament. While “pharos” doesn’t ' +
    'appear in the New Testament or the Septuagint—the Greek translation of the Old Testament—the ' +
    'New Testament introduces Apollos, a native of Alexandria, Egypt. Historical records confirm ' +
    'the Lighthouse of Alexandria stood during Apollos’ lifetime. In Acts 18:24–28, Apollos is ' +
    'described as an eloquent speaker who boldly taught about Jesus in the Ephesus synagogue, ' +
    'though initially he knew only John’s baptism. Priscilla and Aquila refined his ' +
    'understanding, deepening his grasp of God’s way. Later, in Achaia, he strengthened ' +
    'believers and skillfully proved from the Scriptures that Jesus was the Christ. At Pharos ' +
    'Academy, we aspire to nurture every student in the same spirit as Apollos, fostering growth ' +
    'in grace and knowledge and teaching them to “honor Christ the Lord as holy, always being ' +
    'prepared to make a defense to anyone who asks” for a reason for the hope that lies within ' +
    'them (1 Peter 3:15).',
];

/**
 * The attributions the essay carries, kept with it.
 *
 * The last two belong to the drawing, which the live page printed and this one
 * now prints again (#106). Its licence condition is the credit itself, so the
 * caption is not decoration and is not ours to shorten: the work is public
 * domain *given* that Thiersch is named.
 */
export const PHAROS_SOURCES: readonly string[] = [
  'Source: Encyclopedia Britannica',
  'A drawing of the Pharos of Alexandria by German archaeologist Prof. H. Thiersch (1909)',
  'Source: Public Domain',
];

/**
 * Thiersch's 1909 reconstruction of the lighthouse, as the page prints it.
 *
 * The school asked for it back (#106): it stood on the old `/general-8` beside
 * this essay, and it is the only picture either site has of the thing the
 * school is named after. The file is the school's own upload, re-encoded from
 * `assets/imagery/thiersch-pharos.png` by `scripts/build-imagery.mjs`.
 *
 * `alt` is the one string here that is written rather than transcribed, and it
 * describes the drawing — a reader who cannot see it wants the lighthouse, not
 * the credit. The credit is in the caption, where it is visible to everyone,
 * because that is what the licence asks for.
 */
export const PHAROS_DRAWING = {
  src: '/imagery/thiersch-pharos.webp',
  width: 900,
  height: 766,
  alt:
    'A line drawing of the Lighthouse of Alexandria: a tall square tower on a walled harbour ' +
    'front, narrowing to an octagonal storey and a domed lantern with a statue on top, smoke ' +
    'trailing from it, a sailing boat on the water below.',
  credit: PHAROS_SOURCES[1]!,
  licence: PHAROS_SOURCES[2]!,
} as const;

/**
 * How the school explains giving, from `/giving`, verbatim.
 *
 * Every word of this is load-bearing and none of it is ours. It describes a gift
 * going through Enola First Church of God's platform, where the giver picks
 * "Pharos Academy" from a list. A tidier sentence here would be a sentence that
 * misrepresents where somebody's money is going, and the Form 1023 for federal
 * tax-exempt status is still in progress, so how a donation is described is not
 * a copywriting question.
 *
 * The link itself is **not** here. It is `giveUrl` on the school details row —
 * spec #18 §12 — which is why #302 could move it to Pharos's own Vanco
 * organisation without touching a template. **These words did not move with
 * it**, and the mismatch is deliberate rather than missed: the school owns this
 * paragraph, and the day it decides how the new account is described, the
 * sentence is theirs to rewrite.
 */
export const GIVING_INTRO: readonly string[] = [
  'Pharos Academy is currently partnering with Enola First Church of God to facilitate ' +
    'charitable donations.',
  "If you'd like to support Pharos Academy with a gift, simply click the link below. " +
    "You'll be directed to the Enola First Church of God's donation platform, where " +
    'you can select "Pharos Academy" from the options and proceed with the provided ' +
    'instructions.',
];

/** The school's own label for the button, from the live page. */
export const GIVING_LINK_LABEL = 'Give to Pharos Academy';

/**
 * How the school asks for volunteers, from `/volunteer`, verbatim.
 *
 * The live page's third sentence — "Please take a moment to fill out a
 * Volunteer Information Sheet" — is deliberately not carried. It is an
 * instruction about a Google Form that this build replaces, and the form is now
 * directly under these words rather than behind a link to another domain. The
 * two sentences that say what the school needs are untouched.
 */
export const VOLUNTEER_INTRO: readonly string[] = [
  'If you are interested in volunteering at Pharos Academy, we would like to hear from you!',
  'We need Prayer Warriors, Promoters, Help in Directing Students, Donations and Hands on ' +
    'Volunteers.',
];

/**
 * Where the school meets, from `/about-1`.
 *
 * The street address is deliberately not here — it is the school details row,
 * rendered in the footer of every page and edited in one place. What `/about-1`
 * adds over the footer is exactly two things: that the building is a church,
 * and which church. That is what this holds.
 */
export const MEETING_PLACE = {
  /** The school's own lead-in line. */
  preamble: 'Pharos Academy meets at',
  /** The host church, named as the school names it. */
  name: 'Enola First Church of God',
  /** The church's own site, as the live page links it, over https. */
  href: 'https://www.enolacog.com/',
} as const;
