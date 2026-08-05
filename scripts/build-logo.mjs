/**
 * Knocks the white ground out of the school's own logo and writes
 * `public/mark-logo.png`.
 *
 * There are two marks on this site and the divergence is deliberate (#13).
 *
 * `public/mark.svg` is the redrawn trace. It runs in the stuck header and the
 * footer, where the mark is 25–40px and has to sit on a navy ground.
 *
 * This one is the school's REAL logo — two-tone tower, gold beam, wave base —
 * and it runs in the hero lockup at 200px, where the trace's flaws became
 * visible next to a 62px wordmark. It is a raster and cannot inherit a colour,
 * which is exactly why it is not used in the two places that need one.
 *
 * The source is the school's own JPEG off the live site, whose ground is a
 * near-white that is not white: a flat threshold leaves a grey rectangle around
 * the tower. Alpha therefore ramps across the last twenty levels rather than
 * cutting, which is what keeps the beam's soft edge soft.
 *
 *   node scripts/build-logo.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(
  root,
  'docs',
  'mirror',
  'assets',
  'cecb9d_0ca6169ee8cf426fbc06471e38be23f4~mv2.jpg',
);
const OUT = path.join(root, 'public', 'mark-logo.png');

/** Above this, a pixel is ground rather than ink. */
const GROUND = 235;
/** The ramp width: 255 is fully transparent, GROUND is fully opaque. */
const RAMP = 255 - GROUND;

/** 480px wide covers the hero's 200px lockup at 2× with room to spare. */
const WIDTH = 480;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += info.channels) {
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  data[i + 3] = min > GROUND ? Math.max(0, Math.round(((255 - min) / RAMP) * 255)) : 255;
}

const knocked = sharp(data, {
  raw: { width: info.width, height: info.height, channels: info.channels },
});

// Trim to the ink's own bounds before resizing, so the 480px is 480px of logo
// rather than 480px of mostly-empty JPEG canvas.
const trimmed = await knocked.png().trim({ threshold: 0 }).toBuffer();

const out = await sharp(trimmed)
  .resize({ width: WIDTH })
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();

await writeFile(OUT, out);

const meta = await sharp(out).metadata();
console.log(`mark-logo.png  ${meta.width}×${meta.height}  ${Math.round(out.length / 1024)} KB`);
