/**
 * Measures the hero's real contrast — the one thing axe refuses to judge.
 *
 * axe reports every element over the video as *incomplete*: "background color
 * could not be determined due to a background gradient". So the hero, the only
 * place on the site where type sits on a photograph, is the only place the
 * automated pass says nothing about. #21 AC 9 is that this gets judged against
 * those nodes and the result recorded; this is the measurement, and
 * `docs/hero-contrast.md` is the record.
 *
 * Method, carried over from the prototype's `hero_contrast.py` (there is no
 * Python or PIL on this machine, so it is Playwright and sharp instead):
 *
 *   1. Read each text box's rectangle and its DECLARED colour.
 *   2. Make every glyph in the hero `color: transparent`. Not `visibility:
 *      hidden` on the copy layer — the scrim lives inside that layer, and
 *      hiding it would measure the contrast of a fix that is switched off.
 *      Transparent glyphs leave everything painted behind them exactly where it
 *      was. `text-shadow` goes too: it still paints under transparent text, and
 *      WCAG gives it no credit anyway.
 *   3. Screenshot what the browser actually composites behind the type — video
 *      frame, scrim, dim layer — and take the WCAG ratio of the declared colour
 *      against the background pixels the box covers.
 *
 * TWO numbers come out of step 3, and the difference between them matters.
 *
 *   `ground` is the ratio against the box's 40th-percentile luminance pixel.
 *   This is the verdict, and it is the method every number baked into the
 *   scrim's comments in `beacon.css` was measured by — so this record continues
 *   that series instead of starting a second, incomparable one.
 *
 *   `worst` is the ratio against the single worst pixel under the box. It is
 *   the pessimistic bound and it is reported, but it is not the verdict: these
 *   lines are centred inside a full-width box, so a box's darkest pixel is
 *   routinely a blade of meadow grass at the far end of a line that has no
 *   glyph anywhere near it.
 *
 * Sampled across the whole 8s loop (the brightest frame is not frame 0), at
 * three points on the blur/dim ramp, at 390 / 834 / 1440.
 *
 * The ramp is driven by really scrolling rather than by a test-only hook, so
 * what is measured is the shipped code path.
 *
 *   npm run hero:contrast > docs/hero-contrast.md
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 834, height: 1112 },
  { width: 1440, height: 900 },
];
/** Across the 8s loop. */
const FRAMES = [0, 1.6, 3.2, 4.8, 6.4];
/** Where on the ramp to sample, as a fraction of the hero's height. */
const RAMP = [0, 0.45, 0.85];
/** The `.btn` colour transition is 300ms; anything less reads it mid-flight. */
const SETTLE_MS = 450;

/**
 * Astro's dev server daemonises when it detects a coding agent, which makes a
 * spawned process look like it exited immediately. Blanked, exactly as
 * `playwright.config.ts` does it and for the same reason.
 */
const AGENT_ENV_BLANKED = Object.fromEntries(
  [
    'AGENT',
    'AI_AGENT',
    'CLAUDECODE',
    'CODEX_THREAD_ID',
    'CURSOR_TRACE_ID',
    'GEMINI_CLI',
    'OPENCODE',
    'REPLIT_MODE',
    'TERM_PROGRAM',
  ].map((name) => [name, '']),
);

/** The hero type that sits on the photograph. Buttons with a ground are axe's. */
const MEASURE = `() => {
  const out = [];
  const selector = '[data-site-header] a, [data-site-header] b, .hero-lockup h1,'
    + ' .hero-lockup p, .hero-lockup em';
  for (const el of document.querySelectorAll(selector)) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (rect.top > innerHeight || rect.bottom < 0) continue;
    // A solid-background control is already judged by axe.
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') continue;
    // Skip a wrapper whose text really lives in a measured child: the brand link
    // boxes the mark as well as the wordmark, and scoring the wordmark against
    // the mark's own gold beam is a graphic behind a graphic, not type on a
    // ground.
    if (el.querySelector('a, b, h1, p, em, small')) continue;
    // Skip type the ramp has already faded out — that is contrast against a
    // headline nobody can see, and the scrim lives in the same layer, so it
    // reads as a regression rather than as invisible.
    let opacity = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      opacity *= parseFloat(getComputedStyle(n).opacity);
    }
    if (opacity < 0.15) continue;
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight) || 400;
    out.push({
      selector: el.tagName.toLowerCase()
        + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : ''),
      text: (el.textContent || '').trim().slice(0, 34),
      x: rect.x, y: rect.y, w: rect.width, h: rect.height,
      color: style.color, size, weight,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
    });
  }
  return out;
}`;

/**
 * The hide carries an id so it can be taken off again. It has to be: one page is
 * reused across every ramp position, and a hide left in place means the next
 * round's `MEASURE` reads `rgba(0, 0, 0, 0)` as the declared colour and the line
 * scores an impossible 1.00:1 against itself.
 */
const HIDE_ID = 'hero-contrast-hide';

const HIDE_GLYPHS = `() => {
  const style = document.createElement('style');
  style.id = '${HIDE_ID}';
  style.textContent = '[data-site-header] *, .hero-lockup *'
    + '{ color: transparent !important; text-shadow: none !important; }';
  document.head.appendChild(style);
}`;

const SHOW_GLYPHS = `() => { document.getElementById('${HIDE_ID}')?.remove(); }`;

function channel(value) {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" -> [[r,g,b], alpha]. */
function parseColor(value) {
  const parts = value.slice(value.indexOf('(') + 1, value.indexOf(')')).split(',');
  const numbers = parts.map((part) => parseFloat(part));
  return [numbers.slice(0, 3).map((n) => Math.round(n)), numbers[3] ?? 1];
}

/** The background pixel a row was judged against, so a failure names its cause. */
function hex(rgb) {
  return rgb ? `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}` : 'n/a';
}

function describe(row) {
  return `\`${row.selector}\` — “${row.text}”`;
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`dev server never answered on ${url}`);
}

async function main() {
  let server;
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    server = spawn('npm', ['run', 'dev', '--', '--port', '4321'], {
      stdio: 'ignore',
      shell: true,
      env: { ...process.env, ...AGENT_ENV_BLANKED, ASTRO_DEV_TOOLBAR: 'off' },
    });
    await waitForServer(BASE);
  }

  const shots = await mkdtemp(path.join(tmpdir(), 'hero-contrast-'));
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  /** Worst case per element across every width, ramp position and frame. */
  const worstByElement = new Map();

  try {
    for (const viewport of WIDTHS) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await page.goto(BASE);
      await page.waitForTimeout(2500);

      const heroHeight = await page.locator('[data-hero]').evaluate((el) => el.offsetHeight);

      for (const fraction of RAMP) {
        const offset = Math.round(heroHeight * fraction);
        await page.evaluate((y) => window.scrollTo(0, y), offset);
        // Long enough for the ramp's rAF, the header's own state change and the
        // button's 300ms colour transition to all have finished.
        await page.waitForTimeout(SETTLE_MS);

        // Measure the type as it really renders, then take the glyphs out.
        await page.evaluate(`(${SHOW_GLYPHS})()`);
        await page.waitForTimeout(SETTLE_MS);
        const boxes = await page.evaluate(`(${MEASURE})()`);
        await page.evaluate(`(${HIDE_GLYPHS})()`);

        for (const time of FRAMES) {
          await page.evaluate((t) => {
            for (const video of document.querySelectorAll('video')) {
              video.pause();
              try {
                video.currentTime = t;
              } catch {
                /* not seekable yet */
              }
            }
          }, time);
          await page.waitForTimeout(SETTLE_MS);

          const file = path.join(shots, `bg-${viewport.width}-${offset}-${time}.png`);
          await page.screenshot({ path: file });
          const { data, info } = await sharp(file)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          for (const box of boxes) {
            // Inset by 2px so the box's own edge is never the sampled pixel.
            const x0 = Math.max(0, Math.round(box.x) + 2);
            const y0 = Math.max(0, Math.round(box.y) + 2);
            const x1 = Math.min(info.width, Math.round(box.x + box.w) - 2);
            const y1 = Math.min(info.height, Math.round(box.y + box.h) - 2);
            if (x1 <= x0 || y1 <= y0) continue;

            const [fg, alpha] = parseColor(box.color);
            const need = box.large ? 3 : 4.5;

            // Every second pixel on both axes: the same answer for a quarter of
            // the work, on a gradient this smooth.
            const pixels = [];
            for (let y = y0; y < y1; y += 2) {
              for (let x = x0; x < x1; x += 2) {
                const i = (y * info.width + x) * info.channels;
                pixels.push([data[i], data[i + 1], data[i + 2]]);
              }
            }
            if (pixels.length === 0) continue;

            /** The type's own alpha composites it onto the very pixel it covers. */
            const ratioAgainst = (bg) =>
              contrast(
                fg.map((c, n) => Math.round(c * alpha + bg[n] * (1 - alpha))),
                bg,
              );

            const failing = pixels.filter((bg) => ratioAgainst(bg) < need).length;

            const worstBg = pixels.reduce((a, b) => (ratioAgainst(a) <= ratioAgainst(b) ? a : b));
            const byLuminance = [...pixels].sort((a, b) => luminance(a) - luminance(b));
            const groundBg = byLuminance[Math.floor(byLuminance.length * 0.4)];

            const row = {
              ...box,
              need,
              ground: ratioAgainst(groundBg),
              groundBg,
              worst: ratioAgainst(worstBg),
              worstBg,
              failPct: (100 * failing) / pixels.length,
              width: viewport.width,
              progress: fraction,
              time,
            };

            const key = `${box.selector} ${box.text}`;
            const previous = worstByElement.get(key);
            if (!previous || row.ground < previous.ground) worstByElement.set(key, row);
          }
        }
      }

      await page.close();
    }
  } finally {
    await browser.close();
    await rm(shots, { recursive: true, force: true });
    server?.kill();
  }

  report([...worstByElement.values()].sort((a, b) => a.ground - b.ground));
}

function report(rows) {
  const stamp = new Date().toISOString().slice(0, 10);
  const failures = rows.filter((row) => row.ground < row.need);
  const worstRow = rows[0];

  const lines = [
    '# The hero, measured',
    '',
    '<!-- Generated by `npm run hero:contrast > docs/hero-contrast.md`.',
    '     Re-run it after ANY change to the scrim gradients in beacon.css. -->',
    '',
    `Measured ${stamp}, against the build at that commit.`,
    '',
    'axe reports every element over the hero video as *incomplete* — "background',
    'color could not be determined due to a background gradient" — so the one place',
    'on this site where type sits on a photograph is the one place the automated',
    'pass says nothing about. #21 AC 9 asks for those nodes to be judged and the',
    'result recorded. This is the record.',
    '',
    '## Method',
    '',
    'For each line of hero type: make the glyphs `color: transparent` (not hidden —',
    'the scrim lives in the same layer, and hiding it would measure a fix that is',
    'switched off), screenshot what the browser actually composites behind them,',
    'and take the WCAG ratio of the **declared** text colour against the background',
    'pixels the box covers, at five frames across the 8-second loop, at three points',
    'on the blur/dim ramp, at 390 / 834 / 1440. Each row below is that element’s',
    'worst case over all of them.',
    '',
    'Two numbers, and the difference between them is the point:',
    '',
    '- **ground** — the ratio against the box’s 40th-percentile luminance pixel.',
    '  **This is the verdict.** It is also the method every number baked into the',
    '  scrim comments in `src/styles/beacon.css` was measured by, so this table',
    '  continues that series rather than starting a second, incomparable one.',
    '- **worst** — the ratio against the single worst pixel under the box. The',
    '  pessimistic bound, reported but not the verdict. These lines are centred',
    '  inside a full-width box, so a box’s darkest pixel is routinely a blade of',
    '  meadow grass at the far end of a line with no glyph anywhere near it.',
    '',
    '## Result',
    '',
    failures.length === 0
      ? `**Every line passes.** The weakest is ${describe(worstRow)} at ` +
        `${worstRow.ground.toFixed(2)}:1 against a ${worstRow.need.toFixed(1)}:1 ` +
        'requirement.'
      : `**${failures.length} line(s) fail.** ` +
        failures.map((row) => `${describe(row)} at ${row.ground.toFixed(2)}:1`).join('; ') +
        '.',
    '',
    '| ground | worst | need | fail % | width | ramp | frame | type | ground px | verdict | element |',
    '| -----: | ----: | ---: | -----: | ----: | ---: | ----: | :--- | :-------- | :------ | :------ |',
    ...rows.map(
      (row) =>
        `| ${row.ground.toFixed(2)} | ${row.worst.toFixed(2)} | ${row.need.toFixed(1)} | ` +
        `${row.failPct.toFixed(1)}% | ${row.width} | ${row.progress.toFixed(2)} | ${row.time}s | ` +
        `\`${row.color}\` | \`${hex(row.groundBg)}\` | ` +
        `${row.ground < row.need ? '**FAIL**' : 'ok'} | ${describe(row)} |`,
    ),
    '',
    '`ramp` is the hero scroll progress the worst case was found at — 0 the top of',
    'the page, 1 the end of the first viewport. `fail %` is the share of sampled',
    'background pixels under the box below the requirement; a small value alongside',
    'a low `worst` means one dark corner rather than a line in trouble.',
    '',
  ];

  process.stdout.write(lines.join('\n'));
}

await main();
