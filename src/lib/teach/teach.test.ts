import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { publicPaths } from '../routes.js';
import { TEACH_PATH, TEACHER_CONTRACT } from './teach.js';

/**
 * The teacher contract is a file on disk rather than a database row (#30), and
 * that is the whole of what can go wrong with it: the link is right and the
 * file is absent, or the file is there and is not the school's.
 *
 * So both are checked. The bytes are compared against the copy in the mirror,
 * which is what was actually downloaded from the live site — not "a PDF exists
 * at that path", which a placeholder would satisfy.
 */
const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

describe('the teacher contract', () => {
  it('is served from a real file, byte-for-byte the one the school published', () => {
    const served = readFileSync(from(`../../../public${TEACHER_CONTRACT.path}`));
    const captured = readFileSync(from('../../../docs/mirror/pdf/policy-teacher-contract.pdf'));

    expect(served.equals(captured)).toBe(true);
    expect(statSync(from(`../../../public${TEACHER_CONTRACT.path}`)).size).toBeGreaterThan(1000);
  });

  it('saves under a name that says what it is, away from the school’s desktop', () => {
    expect(TEACHER_CONTRACT.filename).toMatch(/^pharos-academy-.*\.pdf$/);
  });
});

describe('the teach page', () => {
  it('sits at the root, off the parent path', () => {
    expect(TEACH_PATH).toBe('/teach');
  });

  // Enumerated like every other public page, so the sitemap carries it and
  // whole-site republishing walks it — the email address on it is read from
  // the school details row.
  it('is an enumerated public route', () => {
    expect(publicPaths()).toContain(TEACH_PATH);
  });
});
