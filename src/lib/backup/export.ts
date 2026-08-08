import type { Db } from '../db/client.js';
import { getSchoolDetails } from '../admin/school-details.js';
import { listApplications } from '../application/store.js';
import { getAttachment, listAnnouncements } from '../announcements/store.js';
import { getSchoolYear, listEvents } from '../calendar/store.js';
import { listCourses } from '../courses/store.js';
import { listInquiries } from '../inquiry/store.js';
import { getMoneySettings, listAgreedTerms } from '../money/store.js';
import { listPeople } from '../people/store.js';
import { getPolicyFile, listPolicies, listPolicyVersions } from '../policies/store.js';
import { SCHOOL_NAME } from '../site.js';
import { zip, type ZipEntry } from './zip.js';

/**
 * **Download everything** — the school's own copy of its own content (#33).
 *
 * The operator backup is a `pg_dump` in the developer's GitHub account, and the
 * question this half answers is a different one: how does *the school* get its
 * content back, without the developer, without Neon, and without anybody
 * knowing what a `.dump` file is. So the export is JSON and PDFs in a ZIP —
 * a format a school secretary can open, read and re-type from, at the cost of
 * not being something you can `pg_restore`.
 *
 * That cost is deliberate and is the whole design. A second `pg_dump` mailed
 * monthly would be a smaller file and a better restore, and would be worth
 * nothing to a board with no developer.
 *
 * The same bytes go two places: the button on `/admin/backup`, and the
 * automatic send on the 1st of each month (`monthly.ts`). One builder, because
 * "the emailed copy is the same ZIP" is an acceptance criterion, and two
 * builders is how it stops being true.
 */

/**
 * The tables whose contents are in the export.
 *
 * Named as tables rather than as concepts so that `export.test.ts` can hold
 * this list against the schema and fail when a new one appears. The editable
 * set (CONTEXT.md) is seven things; the money settings (#29) failed that test
 * into this list exactly as intended, and the school year and its events (#23)
 * and the course editor's own additions (#24) will do the same on the day they
 * land.
 *
 * `agreed_terms` is here for a different reason than the rest: nothing edits it,
 * so it is not "editable content" — but it is what the school promised each
 * family, and a copy of the school's content that restored today's fees with no
 * record of what anyone agreed to pay would be worse than useless.
 */
export const EXPORTED_TABLES = [
  'school_details',
  'courses',
  'people',
  'announcements',
  'policies',
  'policy_versions',
  'money_settings',
  'agreed_terms',
  'school_year',
  'school_year_terms',
  'school_year_closures',
  'calendar_events',
  'inquiries',
  'applications',
  'application_children',
] as const;

/**
 * What each exported table is, said to a school administrator.
 *
 * A `Record` over `EXPORTED_TABLES` rather than a list, so a table added to the
 * export without a sentence explaining it to Jill is a type error rather than a
 * gap on the screen. `/admin/backup` renders this: "what is in the download" is
 * the only question that screen has to answer, and answering it in table names
 * would be answering it in the wrong language.
 */
export const EXPORTED_TABLE_LABELS: Record<(typeof EXPORTED_TABLES)[number], string> = {
  school_details: 'The school’s own details — address, phone, email, mission and vision',
  courses: 'The class catalogue',
  people: 'Everyone on the staff page',
  announcements: 'Every announcement, and any PDF posted with one',
  policies: 'Every policy, with its description and its position on the page',
  policy_versions: 'Every policy document — including the ones that have been replaced',
  money_settings: 'The rates, fees, instalment dates and refund terms the school charges today',
  agreed_terms: 'What each family agreed to pay when they applied, frozen at that date',
  school_year: 'Which school year the site is publishing',
  school_year_terms: 'Each day track’s first class date and week count, per semester',
  school_year_closures: 'Every day the school is closed, with what it is closed for',
  calendar_events: 'One-off events — open houses, concerts, picture days',
  inquiries: 'Every family who has asked about the school, and what they asked',
  applications:
    'Every application a family has sent — who applied, what they answered about the Statement of Faith, any objection they raised, and who agreed to the Code of Conduct and the Handbook',
  application_children:
    'The children on each application: a name, an age and the classes chosen. Nothing else — no dates of birth, no addresses and no medical history',
};

/**
 * The tables that are deliberately not in it, and why.
 *
 * A backup of the school's *content*. Accounts are not content: a restore hands
 * somebody a database they then create accounts in, and an export that carried
 * password material would put the admin's credentials in a monthly email and in
 * whatever downloads folder the ZIP was opened from.
 */
export const EXCLUDED_TABLES: readonly { table: string; label: string; why: string }[] = [
  {
    table: 'admin_users',
    // `label` is the same fact in the language `/admin/backup` speaks. The
    // reason it is here rather than on the screen is that the screen would
    // then be a second list, and a second list is a list that goes stale.
    label: 'Logins and passwords',
    why: 'Accounts, not content. Exporting them would put scrypt hashes in a monthly email and in the school’s downloads folder; a restore makes new accounts instead.',
  },
  {
    table: 'admin_sessions',
    label: 'Who is signed in right now',
    why: 'Live logins, meaningless an hour later and never meaningful in a backup. The rows are hashes of cookies that a restore cannot and must not revive.',
  },
];

/** What the download and the monthly email both hand over. */
export type BackupArchive = {
  /** `pharos-academy-backup-2026-09-01.zip` — the school and the day. */
  filename: string;
  bytes: Buffer;
};

/**
 * Build the whole export.
 *
 * `at` is a parameter rather than `new Date()` so the archive is reproducible:
 * the same content and the same instant give the same bytes, which is what lets
 * the tests compare archives and what keeps the monthly mail from differing
 * from the button's download for no reason.
 */
export async function buildExport(db: Db, at = new Date()): Promise<BackupArchive> {
  const files: ZipEntry[] = [];
  const tables: { table: string; file: string; rows: number }[] = [];

  const details = await getSchoolDetails(db);
  files.push(jsonEntry('content/school-details.json', details));
  tables.push({ table: 'school_details', file: 'content/school-details.json', rows: 1 });

  const courses = await listCourses(db);
  files.push(jsonEntry('content/courses.json', courses));
  tables.push({ table: 'courses', file: 'content/courses.json', rows: courses.length });

  const people = await listPeople(db);
  files.push(jsonEntry('content/people.json', people));
  tables.push({ table: 'people', file: 'content/people.json', rows: people.length });

  const announcements = await exportAnnouncements(db, files);
  files.push(jsonEntry('content/announcements.json', announcements));
  tables.push({
    table: 'announcements',
    file: 'content/announcements.json',
    rows: announcements.length,
  });

  const { policies, versionCount } = await exportPolicies(db, files);
  files.push(jsonEntry('content/policies.json', policies));
  tables.push({ table: 'policies', file: 'content/policies.json', rows: policies.length });
  // The versions are rows of their own table and are listed as such, so the
  // coverage test cannot be satisfied by a policies file that dropped them.
  tables.push({
    table: 'policy_versions',
    file: 'content/policies.json',
    rows: versionCount,
  });

  const money = await getMoneySettings(db);
  files.push(jsonEntry('content/money-settings.json', money));
  tables.push({ table: 'money_settings', file: 'content/money-settings.json', rows: 1 });

  /*
   * The inquiries (#25).
   *
   * Content in the sense that matters: these are the school's leads, they are
   * what the application flow pre-fills from, and losing them loses families
   * rather than settings. They are exported for the same reason `agreed_terms`
   * is — nothing edits them, and that makes them more worth keeping, not less.
   */
  const inquiryRows = await listInquiries(db);
  files.push(jsonEntry('content/inquiries.json', inquiryRows));
  tables.push({ table: 'inquiries', file: 'content/inquiries.json', rows: inquiryRows.length });

  /*
   * The applications (#31).
   *
   * The least reproducible content the school holds: what each parent answered
   * about the Statement of Faith, which text of it they were shown, any
   * objection they raised, and the classes they chose for each child. Nothing
   * edits these rows — which is the reason they are here rather than a reason
   * to leave them out, exactly as it is for `agreed_terms` below.
   *
   * The children are counted as their own table against the same file, so an
   * export that dropped them fails the coverage test rather than quietly
   * shipping applications with no applicants on them.
   */
  const applicationRows = await listApplications(db);
  files.push(jsonEntry('content/applications.json', applicationRows));
  tables.push({
    table: 'applications',
    file: 'content/applications.json',
    rows: applicationRows.length,
  });
  tables.push({
    table: 'application_children',
    file: 'content/applications.json',
    rows: applicationRows.reduce((count, row) => count + row.children.length, 0),
  });

  const agreed = await listAgreedTerms(db);
  files.push(jsonEntry('content/agreed-terms.json', agreed));
  tables.push({ table: 'agreed_terms', file: 'content/agreed-terms.json', rows: agreed.length });

  /*
   * The school year, as the eight numbers and the closures it actually is —
   * not as the 112 dates it produces (#23).
   *
   * A restore wants what Jill typed. The dates are a computation over it, and a
   * copy carrying the output instead would be the five hand-made PDFs again:
   * correct on the day it was taken and unmaintainable afterwards. `schoolYear`
   * is undefined only before the migration that creates it has run, and the
   * empty object keeps the file present rather than the archive short.
   */
  const schoolYear = await getSchoolYear(db);
  files.push(jsonEntry('content/school-year.json', schoolYear ?? {}));
  tables.push({ table: 'school_year', file: 'content/school-year.json', rows: schoolYear ? 1 : 0 });
  tables.push({
    table: 'school_year_terms',
    file: 'content/school-year.json',
    rows: schoolYear?.terms.length ?? 0,
  });
  tables.push({
    table: 'school_year_closures',
    file: 'content/school-year.json',
    rows: schoolYear?.closures.length ?? 0,
  });

  const events = await listEvents(db);
  files.push(jsonEntry('content/events.json', events));
  tables.push({ table: 'calendar_events', file: 'content/events.json', rows: events.length });

  files.unshift({ path: 'README.txt', bytes: Buffer.from(readme(at), 'utf8') });

  const manifest = {
    school: SCHOOL_NAME,
    generatedAt: at.toISOString(),
    format: 'JSON and files in a ZIP. No Postgres needed to read it — see README.txt.',
    tables,
    excluded: EXCLUDED_TABLES,
    files: files.map((file) => ({ path: file.path, bytes: file.bytes.length })),
  };
  // Written last, so it describes what is actually in the archive, and placed
  // second so the two orienting files are the first two a reader sees.
  files.splice(1, 0, jsonEntry('manifest.json', manifest));

  return {
    filename: `pharos-academy-backup-${isoDate(at)}.zip`,
    bytes: zip(files, at),
  };
}

/**
 * The announcements, each with the path of its attachment rather than its bytes.
 *
 * The JSON points at the file; the file is in the same archive. A base64 blob
 * inside the JSON would keep everything in one document and would make the one
 * thing a non-developer needs — the actual PDF — the one thing they cannot get
 * at.
 */
async function exportAnnouncements(db: Db, files: ZipEntry[]) {
  const rows = await listAnnouncements(db);
  const exported = [];

  for (const row of rows) {
    const { attachmentFilename, ...rest } = row;
    let path: string | null = null;

    if (attachmentFilename) {
      const file = await getAttachment(db, row.slug);
      if (file) {
        path = `files/announcements/${row.slug}/${safeName(file.filename)}`;
        files.push({ path, bytes: file.bytes });
      }
    }

    exported.push({ ...rest, attachment: path });
  }

  return exported;
}

/**
 * The policies, and **every retained version** of each.
 *
 * Not just the current file. "Prior versions are retained" (#28) is the answer
 * to "what did the family who enrolled in August actually sign?", and a backup
 * holding only the newest PDF answers that question wrongly and confidently.
 */
async function exportPolicies(db: Db, files: ZipEntry[]) {
  const rows = await listPolicies(db);
  const exported = [];
  let versionCount = 0;

  for (const row of rows) {
    const versions = [];

    // Oldest first, so the JSON reads in the order the versions happened.
    for (const version of (await listPolicyVersions(db, row.slug)).reverse()) {
      const file = await getPolicyFile(db, row.slug, version.version);
      if (!file) continue;

      const path = `files/policies/${row.slug}/v${version.version}-${safeName(file.filename)}`;
      files.push({ path, bytes: file.bytes });
      versions.push({
        version: version.version,
        filename: version.filename,
        uploadedAt: version.uploadedAt,
        uploadedBy: version.uploadedBy,
        file: path,
      });
      versionCount += 1;
    }

    exported.push({ ...row, versions });
  }

  return { policies: exported, versionCount };
}

/** JSON a person can read: two-space indent, and a trailing newline. */
function jsonEntry(path: string, value: unknown): ZipEntry {
  return { path, bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8') };
}

/**
 * A filename that unpacks to a file.
 *
 * Uploaded names come from whatever computer produced them, and a `/` or a `..`
 * in one is a path outside the folder the archive was unpacked into. Slugs are
 * already safe; this exists for the filenames, which are not.
 */
function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '');
  return cleaned || 'document.pdf';
}

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * The first thing in the archive, addressed to whoever opens it.
 *
 * Written for a school administrator with no developer to hand, because that is
 * the situation this file exists for. It says what is here, what is not, and
 * what to do with it — in that order, and without a command to run.
 */
function readme(at: Date): string {
  return `${SCHOOL_NAME} — everything the school can edit
Taken on ${isoDate(at)}.

WHAT THIS IS
  A complete copy of the content on the Pharos Academy website: the classes,
  the people, the announcements, the policy documents, the school year and the
  school's own details. It is a backup you hold yourselves, so that getting your content
  back never depends on anyone else's account.

WHAT IS IN IT
  README.txt      This file.
  manifest.json   What was taken, when, and how many of each.
  content/        The text, as JSON files — one per kind of thing. JSON is
                  plain text: any text editor opens it, and a web browser will
                  display it tidily if you drag the file into a window.
  files/          The documents themselves, as ordinary PDFs, in folders named
                  after what they belong to. Double-click any of them.

WHAT IS NOT IN IT
  Admin usernames and passwords. Those are accounts rather than content, and
  putting them in a file that arrives by email every month would be a worse
  idea than any restore it might save. Whoever rebuilds the site makes new
  accounts.

IF YOU EVER NEED TO USE IT
  Nothing here needs the website, a database or a password to read. Unzip it
  and open the files. A developer rebuilding the site has everything they need
  in these two folders; you do not have to explain what was on the old one.

  Keep the newest copy somewhere that is not the same mailbox it arrived in.
`;
}
