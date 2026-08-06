import type { Attachment } from '../announcements/store.js';

/**
 * An announcement, as the admin form posts it (#27).
 *
 * Works like `people.ts` and `school-details.ts`: it always hands back values,
 * valid or not, so a rejected form redisplays what was typed, and it collects
 * every complaint at once rather than one per round trip.
 *
 * The new thing here is a file, and the file is the reason this parser is
 * careful. It is the only bytes this site ever accepts from a browser, so the
 * upload is checked for what it *is* — the `%PDF-` signature — and not for what
 * its name or its declared type claims, which are both attacker-chosen.
 */

/** The typed fields. Also the error keys, `attachment` aside. */
export type AnnouncementFields = {
  headline: string;
  body: string;
  postedOn: string;
  linkUrl: string | null;
  linkLabel: string | null;
};

export type AnnouncementErrors = Partial<
  Record<keyof AnnouncementFields | 'attachment', string>
>;

export type ParsedAnnouncement = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: AnnouncementFields;
  /**
   * Three-valued, matching the store's edit type: **absent** means the form did
   * not touch the file, `null` means take it down, an `Attachment` means replace
   * it. Absent is the ordinary case — Jill fixing a headline — and it is why a
   * plain `Attachment | null` would be wrong here.
   */
  attachment?: Attachment | null;
  /** Empty when the submission is good. */
  errors: AnnouncementErrors;
};

/** The human names of the fields, used in both the form and its errors. */
export const LABELS: Record<keyof AnnouncementFields | 'attachment', string> = {
  headline: 'Headline',
  body: 'What it says',
  postedOn: 'Posted on',
  linkUrl: 'Link',
  linkLabel: 'Link text',
  attachment: 'PDF',
};

/**
 * The largest PDF the school can attach.
 *
 * Eight megabytes, against a largest-in-the-mirror of 921 KB. Generous rather
 * than tight, because the failure this guards is a 200 MB video going into the
 * database, not a scanned newsletter being slightly heavy.
 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Read a submitted form, trimmed, with every complaint collected at once. */
export async function parseAnnouncement(form: FormData): Promise<ParsedAnnouncement> {
  const values: AnnouncementFields = {
    headline: text(form, 'headline'),
    body: text(form, 'body').replace(/\r\n/g, '\n'),
    postedOn: text(form, 'postedOn'),
    linkUrl: optional(text(form, 'linkUrl')),
    linkLabel: optional(text(form, 'linkLabel')),
  };

  const errors: AnnouncementErrors = {};
  if (!values.headline) errors.headline = `${LABELS.headline} cannot be empty.`;
  if (!values.body) {
    errors.body = 'Say what the announcement is — a headline on its own is a rumour.';
  }
  if (!isCalendarDate(values.postedOn)) {
    errors.postedOn = 'Give the date it was posted, as a day on the calendar.';
  }

  if (values.linkUrl && !values.linkLabel) {
    errors.linkLabel = 'A link needs something to call it — “Register your card”, not “here”.';
  }
  if (values.linkLabel && !values.linkUrl) {
    errors.linkUrl = 'There is link text but no link. Give the address it goes to, or clear both.';
  }
  if (values.linkUrl && !isWebAddress(values.linkUrl)) {
    errors.linkUrl = 'A link is a web address beginning “https://”.';
  }

  const upload = await readAttachment(form);
  if (upload.error) errors.attachment = upload.error;

  const parsed: ParsedAnnouncement = { values, errors };
  if ('attachment' in upload) parsed.attachment = upload.attachment;
  return parsed;
}

/**
 * The uploaded file, if the form sent one.
 *
 * A browser posts an empty `File` for a file input nobody touched, which is why
 * emptiness rather than absence is what means "leave it alone". Ticking the
 * remove box while also choosing a file is read as a replacement: the file is
 * the more specific instruction, and refusing the combination would be an error
 * message about a contradiction Jill did not intend.
 */
async function readAttachment(
  form: FormData,
): Promise<{ attachment?: Attachment | null; error?: string }> {
  const file = form.get('attachment');
  const removing = form.get('removeAttachment') !== null;

  if (!(file instanceof File) || file.size === 0) {
    return removing ? { attachment: null } : {};
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      error: `That PDF is ${Math.round(file.size / 1024 / 1024)} MB. ${
        MAX_ATTACHMENT_BYTES / 1024 / 1024
      } MB is the most an announcement can carry — attach a smaller one, or link to it instead.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isPdf(file, bytes)) {
    return {
      error: 'That file is not a PDF. Announcements take PDFs, which is what the school publishes.',
    };
  }

  return { attachment: { filename: plainFilename(file.name), bytes } };
}

/**
 * A PDF, by its first five bytes as well as by its type.
 *
 * The signature is the half that matters. A declared content type and a `.pdf`
 * on the end of a filename are both typed by whoever is uploading, so a check
 * that trusted either would accept an HTML page served back at parents from
 * this school's own domain.
 */
function isPdf(file: File, bytes: Buffer): boolean {
  const declared = file.type === '' || file.type === 'application/pdf';
  return declared && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * The name of the file, and nothing about the machine it came from.
 *
 * Browsers send a bare filename, but this value ends up in a
 * `content-disposition` header and in a URL, so the path separators and the
 * `..` that a non-browser client could send are cut here rather than trusted to
 * be absent. Anything left that is not filename-shaped becomes `notice.pdf`,
 * because a download with no name is worse than a generic one.
 */
function plainFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\w. -]+/g, '').replace(/^[.\s]+/, '');
  return /\.pdf$/i.test(cleaned) ? cleaned : 'notice.pdf';
}

/**
 * A real day on the calendar, not merely four digits and two dashes.
 *
 * `2026-02-30` passes a pattern and is not a date; round-tripping it through
 * `Date` is what catches it, and the freshness rule counts days from this value.
 */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** An address a browser will follow. `javascript:` is the one this exists to refuse. */
function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Nothing typed is nothing stored — null, so the page renders no element at all. */
function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}
