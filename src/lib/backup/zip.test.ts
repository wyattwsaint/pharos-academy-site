import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { zip } from './zip.js';

/**
 * The ZIP container, read back by somebody else's unzipper (#33).
 *
 * "Readable without Postgres" is the acceptance criterion, and the only way to
 * believe it is to open the archive with an implementation that shares no code
 * with the one that wrote it. `fflate` is a devDependency for exactly this and
 * is not shipped: an archive that only this repo's own reader can open would
 * pass a round-trip test and still be useless in the school's hands.
 */

describe('zip', () => {
  it('round-trips text through an independent unzipper', () => {
    const archive = unzipSync(
      zip([{ path: 'content/school-details.json', bytes: Buffer.from('{"phone":"555"}', 'utf8') }]),
    );

    expect(Object.keys(archive)).toEqual(['content/school-details.json']);
    expect(Buffer.from(archive['content/school-details.json']).toString('utf8')).toBe(
      '{"phone":"555"}',
    );
  });

  it('round-trips a real PDF byte for byte', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');

    const archive = unzipSync(zip([{ path: 'files/policies/handbook/v1-handbook.pdf', bytes: pdf }]));

    expect(Buffer.from(archive['files/policies/handbook/v1-handbook.pdf']).equals(pdf)).toBe(true);
  });

  it('carries many entries, in the order they were given', async () => {
    const pdf = await readFile('docs/mirror/pdf/policy-code-of-conduct.pdf');
    const entries = [
      { path: 'README.txt', bytes: Buffer.from('read me', 'utf8') },
      { path: 'content/courses.json', bytes: Buffer.from('[]', 'utf8') },
      { path: 'files/policies/code-of-conduct/v1.pdf', bytes: pdf },
    ];

    const archive = unzipSync(zip(entries));

    expect(Object.keys(archive)).toEqual(entries.map((entry) => entry.path));
  });

  it('compresses the JSON it can and leaves the PDFs alone', async () => {
    const repetitive = Buffer.from('{"headline":"Bake sale"}\n'.repeat(500), 'utf8');
    const pdf = await readFile('docs/mirror/pdf/policy-handbook.pdf');

    const compressible = zip([{ path: 'a.json', bytes: repetitive }]);
    const already = zip([{ path: 'a.pdf', bytes: pdf }]);

    expect(compressible.length).toBeLessThan(repetitive.length / 4);
    // Storing an already-compressed PDF must not make the archive bigger than
    // the file it holds. A 3 MB export emailed monthly has a size budget.
    expect(already.length).toBeLessThan(pdf.length + 1024);
  });

  it('holds an empty file without corrupting the archive', () => {
    const archive = unzipSync(
      zip([
        { path: 'content/announcements.json', bytes: Buffer.from('[]', 'utf8') },
        { path: 'files/.keep', bytes: Buffer.alloc(0) },
      ]),
    );

    expect(archive['files/.keep'].length).toBe(0);
    expect(Buffer.from(archive['content/announcements.json']).toString('utf8')).toBe('[]');
  });

  it('writes non-ASCII names as UTF-8 and says so, so they survive the trip', () => {
    const archive = unzipSync(zip([{ path: 'files/policies/café.pdf', bytes: Buffer.from('x') }]));

    expect(Object.keys(archive)).toEqual(['files/policies/café.pdf']);
  });

  it('refuses two entries at the same path rather than writing an ambiguous archive', () => {
    expect(() =>
      zip([
        { path: 'content/courses.json', bytes: Buffer.from('a') },
        { path: 'content/courses.json', bytes: Buffer.from('b') },
      ]),
    ).toThrow(/content\/courses\.json/);
  });

  it('is byte-identical for the same content and the same timestamp', () => {
    const at = new Date('2026-09-01T05:00:00Z');
    const entries = [{ path: 'a.json', bytes: Buffer.from('{}', 'utf8') }];

    expect(zip(entries, at).equals(zip(entries, at))).toBe(true);
  });

  // The store path is worth its own case: it is the one a PDF takes, chosen
  // because deflating an already-compressed file makes it bigger. A bug there
  // would only ever show up on the files that matter most.
  it('round-trips bytes that deflate cannot shrink', () => {
    const incompressible = randomBytes(4096);

    const archive = unzipSync(zip([{ path: 'noise.bin', bytes: incompressible }]));

    expect(Buffer.from(archive['noise.bin']).equals(incompressible)).toBe(true);
  });
});
