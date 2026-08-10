import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateApplication } from './application.js';

/**
 * The rules are still where every caller looks for them (ADR-0009).
 *
 * The move is a prefactor, so the export that matters is the one nobody edited:
 * `validateApplication` imported from `application.js`, behaving as it did.
 */
describe('the validation rules keep their address', () => {
  it('is the same function, re-exported', async () => {
    const leaf = await import('./validation.js');

    expect(validateApplication).toBe(leaf.validateApplication);
  });

  it('names every rule an empty form breaks', () => {
    // The messages themselves, and the answered-never-agreed cases, are
    // `application.test.ts`'s and `agreements.test.ts`'s. What this asserts is
    // that the re-exported function is the whole rule set rather than a subset.
    expect(
      Object.keys(
        validateApplication(
          {
            familyName: '',
            email: 'ruth at example',
            children: [],
            faith: {},
            objections: '',
            agreements: {},
          },
          [{ slug: 'code-of-conduct' }],
        ),
      ).sort(),
    ).toEqual(['agreements', 'children', 'classes', 'email', 'faith', 'familyName']);
  });
});

/**
 * Why the module exists at all (ADR-0009).
 *
 * #85 imports these rules into the page's browser script. The saving is not the
 * rules — it is everything `application.ts` reaches on the way to them: the rate
 * card, the catalogue, the timetable and the Statement of Faith. A value import
 * added here would take all of that into the bundle to check that a text field
 * is not empty, and the regression would be invisible until somebody measured
 * the page. So the import graph is asserted rather than intended.
 *
 * Type-only imports are excluded because they are erased before the bundler
 * sees them: `import type { ApplicationFields }` from the fat module next door
 * costs a browser nothing.
 */
describe('the rules are a leaf', () => {
  it('reaches nothing but the shared form helpers', () => {
    // `agreements.ts` since #85 — the gate has to read an answer to a document,
    // and that module is a leaf itself. Everything else stays out.
    expect([...reachableFrom(moduleUrl('validation.ts'))].sort()).toEqual([
      'agreements.ts',
      'forms.ts',
    ]);
  });
});

function moduleUrl(specifier: string, from: string | URL = import.meta.url): URL {
  return new URL(specifier, from);
}

/** Every module a browser would have to load for this one, by file name. */
function reachableFrom(entry: URL): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const url = queue.shift()!;
    for (const specifier of valueImportsOf(readFileSync(fileURLToPath(url), 'utf8'))) {
      const next = moduleUrl(specifier.replace(/\.js$/, '.ts'), url);
      const name = next.pathname.split('/').pop()!;
      if (seen.has(name)) continue;
      seen.add(name);
      queue.push(next);
    }
  }

  return seen;
}

/**
 * The specifiers of every import that survives to runtime.
 *
 * `import type { … }` is dropped whole. A named `type` inside a value import —
 * `import { findOffering, type Offering }` — still loads the module, so the
 * import counts.
 */
function valueImportsOf(source: string): string[] {
  const imports = [...source.matchAll(/^import\s+([\s\S]*?)\s*from\s*'([^']+)'/gm)];

  return imports
    .filter(([, clause]) => !/^type\b/.test(clause!))
    .map(([, , specifier]) => specifier!);
}
