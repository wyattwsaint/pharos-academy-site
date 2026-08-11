/**
 * Squares and re-encodes the staff portraits from `assets/portraits/` into
 * `public/portraits/`.
 *
 * The sources are what the school actually sent: full-frame phone and camera
 * pictures of 0.7–2.2 MB, two of them carrying an EXIF orientation that says
 * "this landscape file is really a portrait". The page wants neither fact — the
 * `.portrait` slot is a 150 CSS px circle — so the rotation, the crop and the
 * re-encode happen here, once, and the result is committed. `sharp.rotate()`
 * with no argument bakes the EXIF orientation into the pixels, which is what
 * stops the two rotated sources from arriving sideways in browsers that ignore
 * the tag.
 *
 * The crop is square and biased *upwards*, not centred: a centred square on a
 * standing portrait puts the chin in the middle of a circle and the top of the
 * head outside it. `faceY` is where the face is in the upright source and
 * `HEAD_ROOM` is where in the square it should land.
 *
 * `sharp` is not a dependency of the site — nothing at runtime resizes anything
 * — so this, like `build-imagery.mjs`, is run with it fetched for the occasion:
 *
 *   npm i --no-save sharp && node scripts/build-portraits.mjs
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets', 'portraits');
const OUT = path.join(root, 'public', 'portraits');

/**
 * `faceY` is the centre of the face as a fraction of the upright source's
 * height, read off the source by eye. Everything else about a portrait — how
 * far the person stood from the wall, whether the phone was held high — is
 * already absorbed by that one number.
 */
const PORTRAITS = [
  { src: 'jill-kilker.jpeg', out: 'jill-kilker.webp', faceY: 0.36 },
  { src: 'george-jensen.jpeg', out: 'george-jensen.webp', faceY: 0.345 },
  { src: 'kathy-liddick.jpeg', out: 'kathy-liddick.webp', faceY: 0.434 },
  { src: 'mandy-saint.jpg', out: 'mandy-saint.webp', faceY: 0.247 },
];

/** Where the face sits down the square. Eyes above the middle, as a portrait. */
const HEAD_ROOM = 0.42;

/**
 * 600 px for a 150 px slot: 4× rather than 2×, because the same file is the
 * one a parent gets if they open the image, and a circle this small costs
 * ~25 KB either way.
 */
const WIDTH = 600;

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const portrait of PORTRAITS) {
    // `.rotate()` first, then measure: the crop is expressed in upright
    // coordinates, and for the two orientation-6 sources those are the
    // transpose of what the file's own header reports.
    const upright = sharp(path.join(SRC, portrait.src)).rotate();
    const { autoOrient } = await upright.metadata();
    const { width, height } = autoOrient;

    // The square is as wide as the frame — every one of these is a portrait
    // orientation with the subject filling the width, so trimming sideways
    // would only cut shoulders off.
    const side = Math.min(width, height);
    const top = clamp(Math.round(height * portrait.faceY - side * HEAD_ROOM), 0, height - side);
    const left = Math.round((width - side) / 2);

    const buffer = await upright
      .extract({ left, top, width: side, height: side })
      .resize({ width: WIDTH, height: WIDTH })
      .webp({ quality: 82, effort: 6 })
      .toBuffer();

    await writeFile(path.join(OUT, portrait.out), buffer);
    console.log(`${portrait.out}  ${Math.round(buffer.length / 1024)} KB`);
  }

  const written = new Set(PORTRAITS.map((portrait) => portrait.out));
  for (const name of await readdir(OUT)) {
    if (!written.has(name)) console.warn(`stale, not produced by this script: ${name}`);
  }
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

await main();
