import { describe, expect, it } from 'vitest';

import { MAX_ATTACHMENT_BYTES, parseAnnouncement } from './announcements.js';

/**
 * The announcement form, read (#27).
 *
 * Two things are being proved here. Every complaint is collected at once, as in
 * every other admin parser — a form that rejects one field per round trip is a
 * form Jill fills in four times. And an upload is checked for what it actually
 * is rather than for what its filename claims, because the one file this site
 * accepts from a browser is the one thing worth being careful about.
 */

/** A form with the fields filled in, ready for a test to break exactly one. */
function form(overrides: Record<string, string | File> = {}): FormData {
  const data = new FormData();
  data.set('headline', 'Picture day');
  data.set('body', 'Bring a comb.');
  data.set('postedOn', '2026-08-05');
  data.set('linkUrl', '');
  data.set('linkLabel', '');
  for (const [name, value] of Object.entries(overrides)) data.set(name, value);
  return data;
}

/** A file that really is a PDF, magic bytes and all. */
function pdf(name = 'notice.pdf', body = '%PDF-1.7\nreal enough'): File {
  return new File([body], name, { type: 'application/pdf' });
}

describe('a good submission', () => {
  it('hands back the values, trimmed', async () => {
    const parsed = await parseAnnouncement(form({ headline: '  Picture day  ' }));
    expect(parsed.errors).toEqual({});
    expect(parsed.values.headline).toBe('Picture day');
    expect(parsed.values.postedOn).toBe('2026-08-05');
  });

  it('stores an empty link as null rather than as an empty string', async () => {
    const parsed = await parseAnnouncement(form());
    expect(parsed.values.linkUrl).toBeNull();
    expect(parsed.values.linkLabel).toBeNull();
  });

  it('keeps a link and its label together', async () => {
    const parsed = await parseAnnouncement(
      form({ linkUrl: 'https://www.weis4school.com', linkLabel: 'Register your card' }),
    );
    expect(parsed.errors).toEqual({});
    expect(parsed.values.linkUrl).toBe('https://www.weis4school.com');
  });
});

describe('what it refuses', () => {
  it('collects every complaint at once', async () => {
    const parsed = await parseAnnouncement(
      form({ headline: '', body: '', postedOn: 'the fifth' }),
    );
    expect(Object.keys(parsed.errors).sort()).toEqual(['body', 'headline', 'postedOn']);
  });

  it('refuses a headline with nothing under it', async () => {
    const parsed = await parseAnnouncement(form({ body: '   ' }));
    expect(parsed.errors.body).toBeTruthy();
  });

  it('refuses a date that is not a date', async () => {
    for (const bad of ['5/8/2026', '2026-13-01', '2026-02-30', '']) {
      const parsed = await parseAnnouncement(form({ postedOn: bad }));
      expect(parsed.errors.postedOn, bad).toBeTruthy();
    }
  });

  it('refuses a link with no name for it', async () => {
    const parsed = await parseAnnouncement(form({ linkUrl: 'https://www.weis4school.com' }));
    expect(parsed.errors.linkLabel).toBeTruthy();
  });

  it('refuses a name with no link behind it', async () => {
    const parsed = await parseAnnouncement(form({ linkLabel: 'Register your card' }));
    expect(parsed.errors.linkUrl).toBeTruthy();
  });

  it('refuses a link that is not http', async () => {
    const parsed = await parseAnnouncement(
      form({ linkUrl: 'javascript:alert(1)', linkLabel: 'Register' }),
    );
    expect(parsed.errors.linkUrl).toBeTruthy();
  });

  it('redisplays what was typed even when it is wrong', async () => {
    const parsed = await parseAnnouncement(form({ headline: '', body: 'Bring a comb.' }));
    expect(parsed.values.body).toBe('Bring a comb.');
  });
});

describe('the attachment', () => {
  it('is left alone when no file was chosen', async () => {
    const parsed = await parseAnnouncement(form({ attachment: new File([], '') }));
    expect(parsed).not.toHaveProperty('attachment');
  });

  it('comes through as bytes and a filename', async () => {
    const parsed = await parseAnnouncement(form({ attachment: pdf() }));
    expect(parsed.errors).toEqual({});
    expect(parsed.attachment?.filename).toBe('notice.pdf');
    expect(parsed.attachment?.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('is a plain filename, never a path from the uploader’s machine', async () => {
    const parsed = await parseAnnouncement(
      form({ attachment: pdf('C:\\Users\\Jill\\Desktop\\../notice.pdf') }),
    );
    expect(parsed.attachment?.filename).toBe('notice.pdf');
  });

  it('refuses a file that only claims to be a PDF', async () => {
    const parsed = await parseAnnouncement(
      form({ attachment: new File(['<html>'], 'notice.pdf', { type: 'application/pdf' }) }),
    );
    expect(parsed.errors.attachment).toBeTruthy();
    expect(parsed).not.toHaveProperty('attachment');
  });

  it('refuses something that is not a PDF at all', async () => {
    const parsed = await parseAnnouncement(
      form({ attachment: new File(['%PDF-1.7'], 'notice.docx', { type: 'application/msword' }) }),
    );
    expect(parsed.errors.attachment).toBeTruthy();
  });

  it('refuses a file too big to be a notice', async () => {
    const huge = new File(
      ['%PDF-1.7', new Uint8Array(MAX_ATTACHMENT_BYTES)],
      'huge.pdf',
      { type: 'application/pdf' },
    );
    const parsed = await parseAnnouncement(form({ attachment: huge }));
    expect(parsed.errors.attachment).toBeTruthy();
  });

  it('is taken down when the remove box is ticked', async () => {
    const parsed = await parseAnnouncement(form({ removeAttachment: 'on' }));
    expect(parsed.attachment).toBeNull();
  });

  it('is replaced rather than removed when both are sent', async () => {
    const parsed = await parseAnnouncement(
      form({ removeAttachment: 'on', attachment: pdf('replacement.pdf') }),
    );
    expect(parsed.attachment?.filename).toBe('replacement.pdf');
  });
});
