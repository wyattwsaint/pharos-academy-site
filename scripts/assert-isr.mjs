#!/usr/bin/env node
/**
 * Assert the build actually produced an ISR deployment.
 *
 * "Serves through ISR, not a static export" is a property of the *build
 * output*, not of the source, and it is the kind of thing an adapter option
 * silently loses. So it is checked where it is true or false: in
 * `.vercel/output`, after `astro build`.
 *
 * Run via `npm run verify:isr`, immediately after a build.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PUBLIC_ROUTES } from '../src/lib/routes.ts';

const OUT = '.vercel/output';
const problems = [];

if (!existsSync(OUT)) {
  fail(`${OUT} does not exist — run \`npm run build\` first.`);
}

const config = JSON.parse(readFileSync(join(OUT, 'config.json'), 'utf8'));
const routes = config.routes ?? [];

// A static export has no functions at all. Its absence is the clearest single
// signal that the delivery model quietly changed.
if (!existsSync(join(OUT, 'functions', '_isr.func'))) {
  problems.push('No `_isr.func` in the build output — the adapter did not emit an ISR function.');
}

const prerenderConfig = join(OUT, 'functions', '_isr.prerender-config.json');
if (!existsSync(prerenderConfig)) {
  problems.push('No `_isr.prerender-config.json` — the ISR function has no revalidation config.');
} else {
  const { expiration } = JSON.parse(readFileSync(prerenderConfig, 'utf8'));
  if (typeof expiration !== 'number' || expiration <= 0) {
    problems.push(
      `ISR expiration is \`${expiration}\`; #18 §3 wants a modest expiration as the backstop for a revalidation that failed to report.`,
    );
  }
}

// Every enumerated public route must land on the ISR function, not on
// `_render` (plain SSR, a Neon cold start in front of a real parent) and not on
// the filesystem (a static export, a rebuild in front of every typo fix).
// `continue: true` entries are header/redirect rules that fall through to the
// next match rather than serving anything, so they are not the route's
// destination. Matching one would report `served by undefined` and fail a build
// that is in fact correct.
for (const { path } of PUBLIC_ROUTES) {
  const match = routes.find(
    (route) => route.src && route.continue !== true && new RegExp(route.src).test(path),
  );
  if (!match) {
    problems.push(`No route in the build output matches \`${path}\`.`);
  } else if (!String(match.dest ?? '').includes('_isr')) {
    problems.push(`\`${path}\` is served by \`${match.dest}\`, not the ISR function.`);
  }
}

if (problems.length > 0) {
  fail(problems.map((p) => `  - ${p}`).join('\n'));
}

console.log(
  `ISR verified: ${PUBLIC_ROUTES.length} public route(s) served by \`_isr.func\` with an expiration set.`,
);

function fail(message) {
  console.error(`ISR verification failed:\n${message}`);
  process.exit(1);
}
