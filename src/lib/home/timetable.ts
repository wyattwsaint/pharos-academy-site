/**
 * The week, as a grid of the classes that actually run.
 *
 * Hard-coded, deliberately and temporarily. Courses are in CONTEXT.md's
 * editable set and a later slice reads them from the database; #21 permits
 * hard-coding exactly where that is true. What is *not* temporary is the copy:
 * every title, time, age band, price and description below is the school's own
 * wording, carried over unedited from `docs/mirror/` by way of the prototype.
 * When the database arrives it inherits these strings — nobody retypes them.
 *
 * Two shapes are worth noticing.
 *
 * `ends` is a separate field from `meta` rather than being folded into one
 * line, because the grid's row label is the *start* time and the end time is
 * the thing a parent is actually working out ("can I collect at noon?"). It
 * gets its own line for that reason.
 *
 * Nothing here is upper-cased in CSS. The strings are typed the way the school
 * types them — "a.m.", "p.m.", "Grades 7–8" — and a `text-transform` would
 * turn those into "A.M." and lose the distinction between a grade band and an
 * age band that the school is careful about.
 */

/** One class in one slot on one morning. */
export type ClassEntry = {
  /** Unique on the page; becomes the panel's `id` for `aria-controls`. */
  id: string;
  title: string;
  /** "ends 10:00 a.m." — rendered on its own line above the meta. */
  ends: string;
  /**
   * The catalogue slug this cell is showing, where it has one.
   *
   * Present so the grid can *price* the cell without a price ever being typed
   * into it (#29 AC 1): the component looks the course up and asks
   * `priceSummary` for the figure at the school's current rates. Absent on the
   * two cells the school quotes by length rather than by price — "12 weeks",
   * "rotating" — which are complete without one.
   */
  slug?: string;
  /** Ages or grades, then any non-money qualifier, joined with a middot. */
  meta: string;
  /** The school's own course description, in full. */
  description: string;
};

/**
 * The school's four day tracks, in calendar order (CONTEXT.md, "day track").
 *
 * Re-exported rather than re-declared: the catalogue owns the list now that
 * courses are rows (#22), and two copies of a glossary term is how the two
 * drift. The homepage's selection of classes still lives in this file, but the
 * days they run on are the same days `/classes` draws.
 */
export { DAY_TRACKS, type DayTrack } from '../courses/schedule.js';

import { DAY_TRACKS, type DayTrack } from '../courses/schedule.js';

/** One row of the grid: a start time and what runs on each day track. */
export type TimeSlot = {
  /** The row label, e.g. "9:00". */
  time: string;
  /**
   * What runs on each day track that hour. Keyed by track rather than
   * positional, so a free hour is an absent key rather than an empty slot
   * counted in from the left — and so adding a Tuesday course is one entry
   * rather than a re-index of every row.
   */
  classes: Partial<Record<DayTrack, readonly ClassEntry[]>>;
};

// Two courses run twice in the week with identical text. Held once so the two
// cells cannot drift apart under a later edit.
const SPANISH_BASIC =
  'This introductory course is designed for students with little or no prior knowledge of ' +
  'Spanish who want to develop practical communication skills for everyday situations. ' +
  'Through interactive speaking activities, guided conversations, vocabulary building, and ' +
  'pronunciation practice, students will learn how to introduce themselves, greet others, ' +
  'ask and answer simple questions, and engage in basic social interactions.';

const ALGEBRA_1 =
  'This Algebra 1 course delivers clear, engaging instruction tailored for homeschool ' +
  'students. Designed in a classical style, it emphasizes understanding, logical reasoning, ' +
  'and problem-solving skills while also equipping parents with the knowledge, tools, and ' +
  'confidence to support and teach Algebra 1 effectively at home. Students attend live ' +
  'classes for direct instruction. All sessions are recorded and provided to families ' +
  'through private video access. Parents proctor exams and submit them to the instructor ' +
  'for grading.';

export const TIMETABLE: readonly TimeSlot[] = [
  {
    time: '9:00',
    classes: {
      Monday: [
        {
          id: 'latin-beginner',
          slug: 'beginner-latin-grades-7-8',
          title: 'Beginner Latin Immersion',
          ends: 'ends 10:00 a.m.',
          meta: 'Grades 7–8',
          description:
            'This immersion course in Latin will utilize short stories, simple fables, and ' +
            'scenes set in the Roman era to learn the language through use. By reading, ' +
            'hearing, and speaking, we will breathe the native air of the ancient Latin ' +
            'speakers. The built-in repetition and the intrinsic retention that accompanies ' +
            'learning from stories will assure the student is building a vocabulary base and ' +
            'a familiarity with the inflected endings of the language. There will be some ' +
            'grammar instruction, but we will rely on reading, hearing, and speaking in the ' +
            'language to build the foundations of Latin.',
        },
        {
          id: 'science-god-made-everything',
          slug: 'god-made-everything',
          title: 'God Made Everything: Science',
          ends: 'ends 10:30 a.m.',
          meta: 'Ages 5–8',
          description:
            "Your little explorer will participate in a beginner's science class, inspired by " +
            'the Biblically-based curriculum, Generations. Through hands-on engaging lessons, ' +
            "music, literature, and catechism questions, your child will grow in wonder as " +
            "they discover that all of creation reflects God's handiwork. Semester 1 will " +
            'include topics such as light, moon, space, water and plants; Semester 2, insects, ' +
            'amphibians, reptiles, mammals, fish, birds, and created in the Image of God.',
        },
      ],
      Wednesday: [
        {
          id: 'spanish-basic-5-8',
          slug: 'basic-spanish-grades-5-8',
          title: 'Basic Spanish Conversation',
          ends: 'ends 10:00 a.m.',
          meta: 'Grades 5–8',
          description: SPANISH_BASIC,
        },
        {
          id: 'church-bible-history',
          slug: 'introduction-to-church-and-bible-history',
          title: 'Church & Bible History',
          ends: 'ends 10:30 a.m.',
          meta: 'Ages 6–8',
          description:
            "Young learners will discover God's history by engaging in weekly activities " +
            'inspired by the Biblically based curriculums, Generations and My Father’s ' +
            'World. We will learn how God uses his people, from all over the world, to build ' +
            'his church. Children will learn about 15 different heroes of the faith — among ' +
            'them Alfred the Great, Martin Luther, Anna Bullinger and Olga in the fall, and ' +
            'Robert Boyle, Johann Sebastian Bach, Janet Paton and Dandeson Crowther in the ' +
            'spring. We will also apply selected verses from Proverbs to build our faith.',
        },
      ],
    },
  },
  {
    time: '9:30',
    classes: {
      Thursday: [
        {
          id: 'letter-of-the-week',
          slug: 'letter-of-the-week',
          title: 'Letter of the Week',
          ends: 'ends 11:00 a.m.',
          meta: 'Ages 4–6',
          description:
            'Your early learner will engage in sensory based activities to build an ' +
            'understanding of the letters, A–Z, and their sounds. Each session is designed to ' +
            'foster a love of learning through songs, nursery rhymes, literature, crafts, ' +
            'snacks, and more. As a Christian academy, your child will also learn Psalm 23 ' +
            'ESV. This course is ideal if your early learner has basic knowledge of the ' +
            'alphabet, or if your child needs a review of these foundational skills.',
        },
      ],
    },
  },
  {
    time: '10:10',
    classes: {
      Monday: [
        {
          id: 'drawing-principles',
          slug: 'principles-of-drawing',
          title: 'Principles of Drawing',
          ends: 'ends 11:10 a.m.',
          meta: 'Ages 14–18',
          description:
            'This drawing course will begin with the basics: orientation, scale, pressure, ' +
            'composition, and basic shapes. We will advance to finding interior shapes, ' +
            'exploring values, measuring proportions, and using shading techniques. Class ' +
            'time will include instructional time and project time with teacher input. We ' +
            'will do both exercises and finished pieces. Projects may include still life ' +
            'subjects, drawing from masters, and working with toned paper and white charcoal. ' +
            'Drawing mediums, subjects and accessories will be provided.',
        },
      ],
      Wednesday: [
        {
          id: 'spanish-basic-9-12',
          slug: 'basic-spanish-grades-9-12',
          title: 'Basic Spanish Conversation',
          ends: 'ends 11:10 a.m.',
          meta: 'Grades 9–12',
          description: SPANISH_BASIC,
        },
      ],
      Thursday: [
        {
          id: 'poetry-plays-patterns',
          slug: 'poetry-plays-and-patterns',
          title: 'Poetry, Plays, and Patterns',
          ends: 'ends 11:00 a.m.',
          meta: 'Ages 14–18',
          description:
            "Students will read and study Shakespeare's Hamlet, Julius Caesar and Macbeth, as " +
            'well as poetry by various poets. Throughout the course, there will be ' +
            'recognition and modeling of the seven basic sentence patterns and usage in ' +
            "students' own writings. Homework will consist of writing assignments, reading, " +
            'and grammar review.',
        },
      ],
    },
  },
  {
    time: '10:40',
    classes: {
      Monday: [
        {
          id: 'kingdom-math',
          slug: 'kingdom-math',
          title: 'Kingdom Math',
          ends: 'ends 12:10 p.m.',
          meta: 'Ages 6–8',
          description:
            'Kingdom Math is a hands-on homeschool class where children discover the wonder ' +
            'of mathematics through games, building projects, puzzles, nature studies, ' +
            'experiments, and real-world challenges. Students build confidence, creativity, ' +
            'and problem-solving skills while learning that math is far more than worksheets ' +
            "— it is a way to understand God's beautifully ordered world.",
        },
        {
          id: 'drawing-painting',
          slug: 'drawing-and-painting-grades-5-8',
          title: 'Drawing & Painting',
          ends: 'ends 12:10 p.m.',
          meta: 'Grades 5–8',
          description:
            'Half of the semester will focus on technical drawing skills using both ' +
            'photographs (like animals) and three dimensional objects (still life), while ' +
            'looking at works of great art. Similarly, the second half of the semester will ' +
            'focus on technical painting skills using both photographs, three dimensional ' +
            'objects, and works of great art (especially landscapes). The grades 5–8 section ' +
            'runs in the fall; a grades 2–4 section runs in the spring at the same hour.',
        },
      ],
      Wednesday: [
        {
          id: 'pilgrims-progress',
          title: "The Pilgrim's Progress for Kids",
          ends: 'ends 11:40 a.m.',
          meta: 'Ages 5–10 · 12 weeks',
          description:
            "This course will introduce your child to a children's adaptation of one of the " +
            "best-selling books of all time: The Pilgrim's Progress, by John Bunyan. Students " +
            "will read Little Pilgrim's Big Journey and follow the allegorical story of " +
            'Christian, a boy determined to reach the Celestial City while navigating many ' +
            'obstacles that Christians encounter. Students will read scripture, learn ' +
            'catechisms, and sing hymns to fortify their biblical knowledge and equip them to ' +
            'overcome common trials of the Christian life.',
        },
        {
          id: 'six-week-electives',
          title: 'Three six-week electives',
          ends: 'ends 12:10 p.m.',
          meta: 'Ages 6–10 · rotating',
          description:
            'Short electives rotate through this hour across the year. Nocturnal Wonders (six ' +
            'weeks from September) introduces young learners to creatures that wake when most ' +
            'people sleep. The Virtue of Kindness (six weeks from October), inspired by Gentle ' +
            'and Classical, cultivates a heart that delights in loving others well, alongside ' +
            'the artwork of Carl Larsson and the music of Robert Schumann. What is a ' +
            'Community? (eight weeks from January) introduces the idea of community through ' +
            'stories, Scripture, memory work and a simple service project. Insect Explorers ' +
            "(six weeks from March) explores how insects live, grow, build, fly, and help God's " +
            'world flourish.',
        },
      ],
    },
  },
  {
    time: '11:10',
    classes: {
      Thursday: [
        {
          id: 'backyard-botany',
          slug: 'backyard-botany',
          title: 'Backyard Botany',
          ends: 'ends 12:10 p.m.',
          meta: 'Ages 5–10',
          description:
            'Discover some of the most common trees and plants found right in your own ' +
            'backyard here in Central Pennsylvania. Learn about their botanical, beneficial, ' +
            "and medicinal qualities. Sketch and paint this beautiful part of God's creation.",
        },
      ],
    },
  },
  {
    time: '11:20',
    classes: {
      Monday: [
        {
          id: 'algebra-1-monday',
          slug: 'algebra-1',
          title: 'Algebra 1',
          ends: 'ends 12:20 p.m.',
          meta: 'Grades 8+ · 1 credit',
          description: ALGEBRA_1,
        },
      ],
      Wednesday: [
        {
          id: 'algebra-1-wednesday',
          slug: 'algebra-1',
          title: 'Algebra 1',
          ends: 'ends 12:20 p.m.',
          meta: 'Grades 8+ · 1 credit',
          description: ALGEBRA_1,
        },
      ],
    },
  },
];

/**
 * How many classes run on one day track, for the column heading.
 *
 * Counted rather than typed. The prototype's headings said "6 classes" over a
 * column holding five, which is the failure mode a typed count has and a
 * derived one cannot.
 */
export function classCountOnTrack(
  track: DayTrack,
  timetable: readonly TimeSlot[] = TIMETABLE,
): number {
  return timetable.reduce((total, slot) => total + (slot.classes[track]?.length ?? 0), 0);
}

/**
 * The day tracks the grid actually draws — those running at least one class.
 *
 * Derived, not listed. An empty track is complete rather than incomplete
 * (CONTEXT.md, "day track"), so it is simply not a column: the homepage grid
 * would otherwise carry a permanently blank Tuesday. Give Tuesday a course and
 * it becomes a column here with no other edit.
 */
export function activeDayTracks(timetable: readonly TimeSlot[] = TIMETABLE): DayTrack[] {
  return DAY_TRACKS.filter((track) => classCountOnTrack(track, timetable) > 0);
}

/** Every class in the grid, flattened — used to check ids are unique. */
export function allClasses(timetable: readonly TimeSlot[] = TIMETABLE): ClassEntry[] {
  return timetable.flatMap((slot) => DAY_TRACKS.flatMap((track) => slot.classes[track] ?? []));
}
