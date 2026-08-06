import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `docs/handoff.md` is the deliverable of #34: the page the next developer is
 * handed, and the page George only has to keep findable.
 *
 * Three of that ticket's acceptance criteria are the sort that hold on the day
 * they are written and quietly stop holding afterwards, so each is a test here
 * rather than a promise:
 *
 * - **every environment variable is documented** — derived from the source, not
 *   from a list someone maintains, so a variable added next month fails this
 *   file until it is written down;
 * - **no secrets** — the doc names the locked drawer, it does not hold the
 *   sheet;
 * - **each rehearsal carries an answer** — a drill section may say it was
 *   performed or say why it was not, but it may not be silent, because a silent
 *   drill reads exactly like a passed one.
 */
const ROOT = new URL('../../', import.meta.url);
const HANDOFF = readFileSync(fileURLToPath(new URL('docs/handoff.md', ROOT)), 'utf8');

/** Where configuration is read. Everything the deployed site or CI can see. */
const SCANNED = [
  'src',
  'scripts',
  'e2e',
  '.github',
  'playwright.config.ts',
  'playwright.revalidation.config.ts',
  'playwright.database-down.config.ts',
  'astro.config.mjs',
];

/**
 * Names reached indirectly, which the scan below cannot see.
 *
 * `scripts/db.mjs` reads the seed passwords through `process.env[account.
 * passwordVar]`, and `revalidationOrigin` takes its environment as a parameter
 * so the browser suite can hand it a dead origin. Both are deliberate; both
 * would otherwise be undocumentable-by-accident.
 */
const INDIRECT = [
  'SEED_JILL_PASSWORD',
  'SEED_GEORGE_PASSWORD',
  'SEED_DEV_PASSWORD',
  'REVALIDATE_ORIGIN',
];

function filesUnder(entry: string): string[] {
  const path = fileURLToPath(new URL(entry, ROOT));
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((child) =>
    child.name === 'node_modules' ? [] : filesUnder(join(entry, child.name).replace(/\\/g, '/')),
  );
}

function configurationNames(): string[] {
  const names = new Set(INDIRECT);
  for (const file of SCANNED.flatMap(filesUnder)) {
    // `handoff-doc.test.ts` itself is scanned, and INDIRECT above would seed it
    // with its own contents either way, so there is nothing to exclude.
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]!);
    for (const match of source.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]!);
  }
  return [...names].sort();
}

const NAMES = configurationNames();

/** Shapes a credential takes. None of them belong in a document in the repo. */
const SECRET_SHAPES: Array<[string, RegExp]> = [
  ['a Postgres URL carrying a password', /postgres(?:ql)?:\/\/[^\s/@]+:[^\s/@]+@/i],
  ['a Resend API key', /\bre_[A-Za-z0-9_-]{16,}/],
  ['a GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['an npm token', /\bnpm_[A-Za-z0-9]{30,}/],
  ['a Neon API key', /\bnapi_[A-Za-z0-9]{20,}/],
];

/** The rehearsals #34 asks for. Each must answer, one way or the other. */
const REHEARSALS = [
  'Drill A — restore',
  'Drill B — migration',
  'The stale-ISR verification',
  'Neon capacity',
];

describe('docs/handoff.md', () => {
  it('exists and is not a placeholder', () => {
    expect(HANDOFF.length).toBeGreaterThan(2000);
  });

  it('has a section addressed to the next developer', () => {
    const headings = [...HANDOFF.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]!.trim());
    expect(headings).toContain('For the next developer');
  });

  it('found configuration to check, so a broken scan cannot pass silently', () => {
    expect(NAMES.length).toBeGreaterThan(15);
    expect(NAMES).toContain('DATABASE_URL');
    expect(NAMES).toContain('CRON_SECRET');
  });

  it.each(NAMES)('documents %s', (name) => {
    expect(HANDOFF).toContain(name);
  });

  it.each(SECRET_SHAPES)('holds no secret shaped like %s', (_label, pattern) => {
    expect(HANDOFF).not.toMatch(pattern);
  });

  it.each(REHEARSALS)('records whether "%s" was performed', (heading) => {
    const section = sectionFor(heading);
    expect(section, `no "## ${heading}" section`).toBeTruthy();
    expect(section).toMatch(/\*\*Status:\*\*\s+(?:Performed on \S|Not yet performed — \S)/);
  });
});

/** The body between a `##` heading and the next one, line-ending agnostic. */
function sectionFor(heading: string): string | undefined {
  const lines = HANDOFF.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}
