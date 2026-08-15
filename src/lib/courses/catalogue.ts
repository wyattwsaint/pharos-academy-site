/**
 * The courses of 2026–2027, reconciled.
 *
 * This is the seed, not the store: `migrations.ts` turns it into rows and every
 * public surface reads it back out of Neon. It is held in the repo because the
 * reconciliation is authored work — the live site publishes these courses
 * across nine artefacts that disagree with one another, and
 * `docs/mirror/README.md` records which source won each argument.
 *
 * Every string below is the school's own, carried from `docs/mirror/` unedited.
 * What is deliberately *absent* is any number that can be derived: there is no
 * price and no contact-hours field, because both are computed from `weeks`, the
 * meeting times and the rate tier (`pricing.ts`), and the tests recompute every
 * one of them against the published figures.
 *
 * Two entries carry the school's own unresolved questions rather than a
 * resolution invented here: *Poetry, Plays, and Patterns* has "TBA" for its
 * required text, and *Introduction to Church and Bible History* is recorded at
 * ages 6–8 because two of the three live sources say so. Both are noted in
 * `docs/mirror/data/courses.json` under `conflicts`, which is where the school
 * will read them back.
 */

import type { Course } from './course.js';

const SPANISH_DESCRIPTION =
  'This introductory course is designed for students with little or no prior knowledge of ' +
  'Spanish who want to develop practical communication skills for everyday situations. ' +
  'Through interactive speaking activities, guided conversations, vocabulary building, and ' +
  'pronunciation practice, students will learn how to introduce themselves, greet others, ask ' +
  'and answer simple questions, and engage in basic social interactions.';

const SPANISH_TEXTS =
  'Abeka Spanish 1 Oral Fluency Exercises (approximately $30); QuickStudy Spanish Conversation ' +
  'Laminated Study Guide (approximately $12); QuickStudy Spanish Grammar Laminated Study Guide ' +
  '(approximately $12)';

// Carried verbatim from the live site, including the sentence about "the
// younger class" that has no referent in the Grades 5-6 entry. It is the
// school's copy to fix, and `courses.json` records the question.
const LATIN_DESCRIPTION =
  'This immersion course in Latin will utilize short stories, simple fables, and scenes set in ' +
  'the Roman era to learn the language through use. By reading, hearing, and speaking, we will ' +
  'breathe the native air of the ancient Latin speakers. The built-in repetition and the ' +
  'intrinsic retention that accompanies learning from stories will assure the student is ' +
  'building a vocabulary base and a familiarity with the inflected endings of the language. ' +
  'There will be some grammar instruction, but we will rely on reading, hearing, and speaking ' +
  'in the language to build the foundations of Latin. This course will be structured similarly ' +
  'to the younger class, but the pace will be quicker, due to larger assignment portions.';

const LATIN_TEXT =
  'Legentibus app (the teacher will guide you through this roughly $14.99 purchase for your device)';

const DRAWING_AND_PAINTING_DESCRIPTION =
  'Half of the semester will focus on technical drawing skills using both photographs (like ' +
  'animals) and three dimensional objects (still life), while looking at works of great art. ' +
  'Similarly, the second half of the semester will focus on technical painting skills using ' +
  'both photographs, three dimensional objects, and works of great art (especially landscapes).';

/**
 * A seed row: everything the school published, minus what only the editor
 * manages. `enrolmentUnits` and the stamp are derived below rather than written
 * once per row, because the seed's rule is one rule: a course starts
 * purchasable only as its own shape.
 */
type SeedCourse = Omit<Course, 'enrolmentUnits' | 'retiredAt' | 'lastEditedBy' | 'lastEditedAt'>;

const SEEDS: readonly SeedCourse[] = [
  {
    slug: 'algebra-1',
    title: 'Algebra 1',
    description:
      'This Algebra 1 course delivers clear, engaging instruction tailored for homeschool ' +
      'students. Designed in a classical style, it emphasizes understanding, logical reasoning, ' +
      'and problem-solving skills while also equipping parents with the knowledge, tools, and ' +
      'confidence to support and teach Algebra 1 effectively at home. Students attend live ' +
      'classes for direct instruction. All sessions are recorded and provided to families ' +
      'through private video access. Parents proctor exams and submit them to the instructor ' +
      'for grading. Topics to be covered include fundamental operations, functions and graphs, ' +
      'the integers, rational numbers, equations in one variable, equations in two variables, ' +
      'simultaneous equations, exponents, polynomials, factoring, fractions, square roots, ' +
      'quadratic equations, the real numbers, fractional equations and inequalities.',
    stages: ['Middle School (Logic Stage)', 'High School (Rhetoric Stage)'],
    days: ['Monday', 'Wednesday'],
    start: '11:20',
    end: '12:20',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    // No numeric range on purpose. The gate is proficiency, not an age, so the
    // course is shown in every band rather than filtered out of all of them.
    ageLabel: '8th Grade and older (or younger students who demonstrate proficiency)',
    ageMin: null,
    ageMax: null,
    rateTier: 'highSchoolCredit',
    credit: '1 High School Algebra 1 credit with completed homework',
    requiredText:
      'Elementary Algebra Set from Master Books, which includes the textbook, Elementary ' +
      'Algebra by Harold R. Jacobs, and the Elementary Algebra Teacher Guide, Revised Edition',
    optionalText: 'Jacobs’ Elementary Algebra e-Course (video lessons)',
    materialsToBuy:
      'Notebook, pen or pencil, ruler or straight edge, and a calculator (any calculator is ' +
      'sufficient, but a TI-30XS or equivalent is recommended)',
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: 50,
    assessmentFeeNote: 'for test scoring',
    prerequisites:
      'Proficiency in core arithmetic skills. Competency in Pre-Algebra concepts is helpful ' +
      'but not necessary.',
    instructorSlug: 'george-jensen',
  },
  {
    slug: 'backyard-botany',
    title: 'Backyard Botany',
    description:
      'Discover some of the most common trees and plants found right in your own backyard here ' +
      'in Central Pennsylvania. Learn about their botanical, beneficial, and medicinal ' +
      'qualities. Sketch and paint this beautiful part of God’s creation.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Thursday'],
    start: '11:10',
    end: '12:10',
    enrolment: 'fall',
    weeks: 14,
    dates: [],
    ageLabel: '5-10 (approximately K-6th grades)',
    ageMin: 5,
    ageMax: 10,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 10,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None (just a curious mind)',
    instructorSlug: 'angela-fecteau',
  },
  {
    slug: 'basic-spanish-grades-5-8',
    title: 'Basic Spanish Conversation for Beginners (Grades 5-8)',
    description: SPANISH_DESCRIPTION,
    stages: ['Middle School (Logic Stage)'],
    days: ['Wednesday'],
    start: '09:00',
    end: '10:00',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '10-14 (approximately 5th-8th grades)',
    ageMin: 10,
    ageMax: 14,
    rateTier: 'standard',
    credit: null,
    requiredText: SPANISH_TEXTS,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 15,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'elizabeth-hayes',
  },
  {
    slug: 'basic-spanish-grades-9-12',
    title: 'Basic Spanish Conversation for Beginners (Grades 9-12)',
    description: SPANISH_DESCRIPTION,
    stages: ['High School (Rhetoric Stage)'],
    days: ['Wednesday'],
    start: '10:10',
    end: '11:10',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '14-18 (approximately 9th-12th grades)',
    ageMin: 14,
    ageMax: 18,
    // The school prices this section at the high-school rate although it
    // carries no credit. Recorded as published, and flagged in `courses.json`
    // for the school to confirm — not quietly normalised to the other rate.
    rateTier: 'highSchoolCredit',
    credit: null,
    requiredText: SPANISH_TEXTS,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 15,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'elizabeth-hayes',
  },
  {
    slug: 'beginner-latin-grades-5-6',
    title: 'Beginner Latin Immersion (Grades 5-6)',
    description: LATIN_DESCRIPTION,
    stages: ['Middle School (Logic Stage)'],
    days: ['Monday'],
    start: '11:20',
    end: '12:20',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '10-13 (approximately 5th and 6th grades)',
    ageMin: 10,
    ageMax: 13,
    rateTier: 'standard',
    credit: null,
    requiredText: LATIN_TEXT,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 25,
    materialsFeeNote: 'per year',
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'chelsea-miller',
  },
  {
    slug: 'beginner-latin-grades-7-8',
    title: 'Beginner Latin Immersion (Grades 7-8)',
    description: LATIN_DESCRIPTION,
    stages: ['Middle School (Logic Stage)'],
    days: ['Monday'],
    start: '09:00',
    end: '10:00',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '12-15 (approximately 7th and 8th grades)',
    ageMin: 12,
    ageMax: 15,
    rateTier: 'standard',
    credit: null,
    requiredText: LATIN_TEXT,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 25,
    materialsFeeNote: 'per year',
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'chelsea-miller',
  },
  {
    slug: 'god-made-everything',
    title: 'God Made Everything: Early Elementary Science',
    description:
      'Your little explorer will participate in a beginner’s science class, inspired by the ' +
      'Biblically-based curriculum, Generations. Through hands-on engaging lessons, music, ' +
      'literature, and catechism questions, your child will grow in wonder as they discover ' +
      'that all of creation reflects God’s handiwork. Semester 1 will include topics such as ' +
      'light, moon, space, water, and plants. Semester 2 will include topics such as insects, ' +
      'amphibians, reptiles, mammals, fish, birds, and created in the Image of God.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Monday'],
    start: '09:00',
    end: '10:30',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '5-8',
    ageMin: 5,
    ageMax: 8,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'insect-explorers',
    title: 'Insect Explorers: Early Elementary Science Elective',
    description:
      'In this wonder-filled elective, young learners will explore the fascinating world of ' +
      'insects through nature study, stories, hands-on observation, art, music, memory work, ' +
      'and outdoor discovery. Students will learn how insects live, grow, build, fly, and help ' +
      'God’s world flourish. The course encourages curiosity, attentiveness, and delight in ' +
      'creation while building early science vocabulary and observation skills.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Wednesday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'block',
    weeks: 6,
    dates: ['2027-03-03', '2027-03-10', '2027-03-17', '2027-03-24', '2027-03-31', '2027-04-07'],
    ageLabel: '6-10',
    ageMin: 6,
    ageMax: 10,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'introduction-to-church-and-bible-history',
    title: 'Introduction to Church and Bible History',
    description:
      'Young learners will discover God’s history by engaging in weekly activities inspired by ' +
      'the Biblically based curriculums, Generations and My Father’s World. We will learn how ' +
      'God uses his people, from all over the world, to build his church. Children will learn ' +
      'about 15 different heroes of the faith that will inspire them to stand firm on God’s ' +
      'promises and truth. Some of these mighty men and women include Alfred the Great, Martin ' +
      'Luther, Anna Bullinger, and Olga (in the fall semester), and Robert Boyle, Johann ' +
      'Sebastian Bach, Janet Paton, and Dandeson Crowther (in the spring semester). During our ' +
      'time together we will also apply selected verses from Proverbs to build our faith. ' +
      'Weekly memorization of these verses is encouraged but not required. This course will ' +
      'reinforce skills such as listening and narration.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Wednesday'],
    start: '09:00',
    end: '10:30',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '6-8',
    ageMin: 6,
    ageMax: 8,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'drawing-and-painting-grades-5-8',
    title: 'Introduction to Drawing and Painting (Grades 5-8)',
    description: DRAWING_AND_PAINTING_DESCRIPTION,
    stages: ['Middle School (Logic Stage)'],
    days: ['Monday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'fall',
    weeks: 14,
    dates: [],
    ageLabel: '10-14 (5th-8th grades)',
    ageMin: 10,
    ageMax: 14,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 50,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'lanette-johnson',
  },
  {
    slug: 'drawing-and-painting-grades-2-4',
    title: 'Introduction to Drawing and Painting (Grades 2-4)',
    description: DRAWING_AND_PAINTING_DESCRIPTION,
    stages: ['Elementary (Grammar Stage)'],
    days: ['Monday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'spring',
    weeks: 14,
    dates: [],
    ageLabel: '7-10 (2nd-4th grades)',
    ageMin: 7,
    ageMax: 10,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 50,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'lanette-johnson',
  },
  {
    slug: 'kingdom-math',
    title: 'Kingdom Math: Early Elementary Math Enrichment',
    description:
      'Kingdom Math is a hands-on homeschool class where children discover the wonder of ' +
      'mathematics through games, building projects, puzzles, nature studies, experiments, and ' +
      'real-world challenges. Students build confidence, creativity, and problem-solving skills ' +
      'while learning that math is far more than worksheets — it is a way to understand God’s ' +
      'beautifully ordered world.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Monday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '6-8',
    ageMin: 6,
    ageMax: 8,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'letter-of-the-week',
    title: 'Letter of the Week',
    description:
      'Your early learner will engage in sensory based activities to build an understanding of ' +
      'the letters, A-Z, and their sounds. Each session is designed to foster a love of ' +
      'learning through songs, nursery rhymes, literature, crafts, snacks, and more. As a ' +
      'Christian academy, your child will also learn Psalm 23 ESV. This course is ideal if your ' +
      'early learner has basic knowledge of the alphabet, or if your child needs a review of ' +
      'these foundational skills.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Thursday'],
    start: '09:30',
    end: '11:00',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '4-6',
    ageMin: 4,
    ageMax: 6,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'nocturnal-wonders',
    title: 'Nocturnal Wonders: Early Elementary Science Elective',
    description:
      'This gentle, wonder-filled elective introduces young learners to the fascinating world ' +
      'of nocturnal animals — creatures that wake when most people sleep. Through stories, ' +
      'Scripture reflection, narration, art, music, memory work, and hands-on exploration, ' +
      'students will learn about God’s design in creation while building observation and ' +
      'language skills.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Wednesday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'block',
    weeks: 6,
    dates: ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07'],
    ageLabel: '6-8',
    ageMin: 6,
    ageMax: 8,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'poetry-plays-and-patterns',
    title: 'Poetry, Plays, and Patterns (Shakespeare and poetry)',
    description:
      'Students will read and study Shakespeare’s Hamlet, Julius Caesar, and Macbeth, as well ' +
      'as poetry by various poets. Throughout the course, there will be recognition and ' +
      'modeling of the seven basic sentence patterns and usage in students’ own writings. ' +
      'Homework will consist of writing assignments, reading, and grammar review.',
    stages: ['High School (Rhetoric Stage)'],
    days: ['Thursday'],
    start: '10:00',
    end: '11:00',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '14-18 (9th-12th grades)',
    ageMin: 14,
    ageMax: 18,
    rateTier: 'highSchoolCredit',
    credit: '1 High School English credit with completed homework',
    // The school's own "TBA", published as it stands. Inventing a title here
    // would be the site quietly answering a question only the school can.
    requiredText: 'TBA',
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 30,
    materialsFeeNote: null,
    assessmentFee: 50,
    assessmentFeeNote: 'for feedback on writing',
    prerequisites: 'Proficiency in reading.',
    instructorSlug: 'robyn-lach',
  },
  {
    slug: 'principles-of-drawing',
    title: 'Principles of Drawing',
    description:
      'This drawing course will begin with the basics: orientation, scale, pressure, ' +
      'composition, and basic shapes. We will advance to finding interior shapes, exploring ' +
      'values, measuring proportions, and using shading techniques. Class time will include ' +
      'instructional time and project time with teacher input. We will do both exercises and ' +
      'finished pieces. Projects may include still life subjects, drawing from masters, and ' +
      'working with toned paper and white charcoal. Drawing mediums, subjects, and accessories ' +
      'will be provided. Students should be able to take instruction well. They will be ' +
      'expected to handle materials with respect.',
    stages: ['High School (Rhetoric Stage)'],
    days: ['Monday'],
    start: '10:10',
    end: '11:10',
    enrolment: 'year',
    weeks: 28,
    dates: [],
    ageLabel: '14-18 (approximately 9th-12th grades)',
    ageMin: 14,
    ageMax: 18,
    rateTier: 'highSchoolCredit',
    credit: '½ credit if the student practices at home',
    requiredText: null,
    optionalText: null,
    materialsToBuy: '18"x12" sketch pad',
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'chelsea-miller',
  },
  {
    slug: 'pilgrims-progress-for-kids',
    title: 'The Pilgrim’s Progress for Kids',
    description:
      'This course will introduce your child to a children’s adaptation of one of the ' +
      'best-selling books of all time: The Pilgrim’s Progress, by John Bunyan. Students will ' +
      'read Little Pilgrim’s Big Journey and follow the allegorical story of Christian, a boy ' +
      'determined to reach the Celestial City while navigating many obstacles that (historical ' +
      'and modern-day) Christians encounter. Students will read scripture, learn catechisms, ' +
      'and sing hymns to fortify their biblical knowledge and equip them to overcome common ' +
      'trials of the Christian life — just like Christian on his journey to the Celestial City.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Wednesday'],
    start: '10:40',
    end: '11:40',
    enrolment: 'block',
    weeks: 12,
    // Twelve dates for twelve weeks, and the published list skips Wednesday
    // 30 September, which is a scheduled class day. Recorded as published; the
    // gap is one of `courses.json`'s open questions for the school.
    dates: [
      '2026-09-02',
      '2026-09-09',
      '2026-09-16',
      '2026-09-23',
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
      '2026-10-28',
      '2026-11-04',
      '2026-11-11',
      '2026-11-18',
      '2026-12-02',
    ],
    ageLabel: '5-10 (approximately K-4th grade)',
    ageMin: 5,
    ageMax: 10,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText:
      'Little Pilgrim’s Big Journey by Tyler Van Halteren (use code HOMEMAKING for 10% off at ' +
      'lithoskids.com); Truth & Grace Memory Book 1 by Thomas K. Ascol',
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'rachel-holderman',
  },
  {
    slug: 'the-virtue-of-kindness',
    title: 'The Virtue of Kindness: Elementary Elective',
    description:
      'This classical elective, inspired by the curriculum Gentle and Classical, will introduce ' +
      'young children to the virtue of kindness through stories, Scripture, poetry, habits, ' +
      'copywork, narration, songs, and crafts. We will also delight in studying the warm and ' +
      'beautiful artwork of Carl Larsson and the rich, expressive music of Robert Schumann. The ' +
      'goal is not merely to talk about kindness, but to cultivate a heart that delights in ' +
      'loving others well.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Wednesday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'block',
    weeks: 6,
    dates: ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18'],
    ageLabel: '6-10',
    ageMin: 6,
    ageMax: 10,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: 3,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
  {
    slug: 'what-is-a-community',
    title: 'What is a Community? Early Elementary Elective',
    description:
      'This gentle classical-style elective introduces young children to the idea of community ' +
      'through stories, Scripture, conversation, memory work, hands-on activities, narration, ' +
      'songs, and a simple service project.',
    stages: ['Elementary (Grammar Stage)'],
    days: ['Wednesday'],
    start: '10:40',
    end: '12:10',
    enrolment: 'block',
    weeks: 8,
    dates: [
      '2027-01-06',
      '2027-01-13',
      '2027-01-20',
      '2027-01-27',
      '2027-02-03',
      '2027-02-10',
      '2027-02-17',
      '2027-02-24',
    ],
    ageLabel: '6-8',
    ageMin: 6,
    ageMax: 8,
    rateTier: 'standard',
    credit: null,
    requiredText: null,
    optionalText: null,
    materialsToBuy: null,
    materialsFee: null,
    materialsFeeNote: null,
    assessmentFee: null,
    assessmentFeeNote: null,
    prerequisites: 'None',
    instructorSlug: 'mandy-saint',
  },
];

/**
 * The seed with the editor's fields filled in conservatively: each course is
 * purchasable as its own shape and nothing more, until Jill ticks otherwise in
 * the admin (#24). The nine year courses that publish a semester price get only
 * `['year']` here — the site must not guess a $420 offering into existence.
 */
export const CATALOGUE: readonly Course[] = SEEDS.map((seed) => ({
  ...seed,
  enrolmentUnits: [seed.enrolment],
  // Every seeded class is one the school runs, which is what null says (#263).
  retiredAt: null,
  lastEditedBy: null,
  lastEditedAt: null,
}));

/** Alphabetical by title — the order the full-descriptions surface reads in. */
export function byTitle(courses: readonly Course[]): Course[] {
  return [...courses].sort((a, b) => a.title.localeCompare(b.title));
}
