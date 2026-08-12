/**
 * Crops the hero's poster frame into the link-preview card at
 * `public/social/preview.jpg` (#147).
 *
 * Every share of this site — and this school reaches families through
 * Facebook, WhatsApp and group texts far more than through search — renders
 * whatever this file is. So the constraints are the scrapers', not the page's:
 *
 * - **1200×630.** The size Facebook, LinkedIn, Slack and iMessage all size
 *   their large card to. Anything smaller than 600×315 is demoted to the tiny
 *   thumbnail beside the text, which is the layout this ticket exists to stop.
 * - **JPEG, not WebP.** Everything on the site is WebP and this one file is
 *   not, deliberately: WhatsApp and several mail clients still fail to render
 *   a WebP `og:image` and fall back to no image at all. A preview card is worth
 *   the extra bytes to be readable everywhere, and the budget below keeps them
 *   in hand.
 * - **Under 300 KB.** Not a formal limit, but scrapers time out. Asserted
 *   below rather than only written here, because the failure is silent: a
 *   heavier source would still write a valid file, and the symptom — a card
 *   that never renders — appears in a chat app, where nothing in this repo
 *   would ever see it. `social-preview.test.ts` holds the committed file to the
 *   same ceiling.
 *
 * The source is the hero's own poster rather than one of the homepage plates,
 * because the lighthouse *is* how the site introduces itself: it is the first
 * thing above the fold and the school's emblem. **It is not a photograph of the
 * school** — no such photograph exists in this repo, and
 * `assets/imagery/README.md` says why. When one arrives, point `SOURCE` at it.
 *
 * Run by hand, exactly like `build-imagery.mjs` and `build-portraits.mjs`, and
 * the output is committed:
 *
 *   npm i --no-save sharp && node scripts/build-social-preview.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The hero's poster frame, 1600×900. */
const SOURCE = path.join(root, 'public', 'hero', 'hope-poster.webp');
const OUT = path.join(root, 'public', 'social', 'preview.jpg');

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Where the kept window sits on the axis being trimmed: 0 keeps the top edge,
 * 1 the bottom.
 *
 * 16:9 is taller than 1.91:1, so 60 source rows have to go. They come off the
 * bottom rather than being split evenly, because the bottom of the frame is
 * meadow and the top is the lantern — and a preview card cropped through the
 * light is a lighthouse with its point cut off.
 */
const BIAS = 0;

/**
 * WebP q82 is what the rest of the site is encoded at; JPEG needs a little more
 * to hold a painted sky without banding it, and 88 measures clean here.
 */
const QUALITY = 88;

/** The ceiling the header argues for, in bytes. */
const MAX_BYTES = 300 * 1024;

const image = sharp(SOURCE);
const { width: srcWidth = 0, height: srcHeight = 0 } = await image.metadata();

const windowHeight = Math.round((srcWidth * HEIGHT) / WIDTH);
if (windowHeight > srcHeight) {
  throw new Error(`${path.basename(SOURCE)} is ${srcWidth}×${srcHeight}: too tall to crop to ${WIDTH}×${HEIGHT}`);
}

const body = await image
  .extract({
    left: 0,
    top: Math.round((srcHeight - windowHeight) * BIAS),
    width: srcWidth,
    height: windowHeight,
  })
  .resize(WIDTH, HEIGHT)
  // `mozjpeg` is sharp's own better encoder; `chromaSubsampling` off keeps the
  // gold in the sky from smearing, which 4:2:0 does to exactly this palette.
  .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
  .toBuffer();

if (body.length > MAX_BYTES) {
  throw new Error(
    `card is ${(body.length / 1024).toFixed(0)} KB, over the ${MAX_BYTES / 1024} KB ceiling — lower QUALITY or pick a lighter source`,
  );
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, body);

console.log(`${path.relative(root, OUT)}  ${WIDTH}×${HEIGHT}  ${(body.length / 1024).toFixed(0)} KB`);
