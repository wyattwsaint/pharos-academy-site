/**
 * Crops and re-encodes the homepage plates from `assets/imagery/` into
 * `public/imagery/`.
 *
 * The sources are 16:9 PNGs of 2–3 MB each. Nothing on the page wants either of
 * those facts: the accent column is 3:2 and about 400 CSS px wide, and the
 * H.O.P.E. cards are 380 px. Astro's own image pipeline could resize them, but
 * it cannot take a *biased* crop — the desk still-life has a third of bare wall
 * on its left — so the crop lives here, once, in a script whose output is
 * committed rather than rebuilt on every deploy.
 *
 * The specs are carried over from the prototype's `build_assets.py`, which is
 * where the crops were decided against the design (`prototypes/README.md`).
 *
 *   node scripts/build-imagery.mjs
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets', 'imagery');
const OUT = path.join(root, 'public', 'imagery');

/**
 * `bias` slides the kept window across the axis being trimmed: 0 keeps the
 * left/top edge, 1 the right/bottom, 0.5 dead centre.
 *
 * - `still-desk` leans right (0.70) because its left third is bare wall and the
 *   mug and brush jar are what the frame is for.
 * - `vista-path` is centred: nothing in it sits to one side.
 * - the four H.O.P.E. paintings are each composed with their subject in the
 *   middle, so they take a centred crop too, at card width rather than plate
 *   width — 800 px covers a 380 px card at 2×, and 1400 would be four times the
 *   bytes for nothing.
 */
const PLATES = [
  { src: 'still-desk.png', out: 'still-desk.webp', width: 1400, bias: 0.7 },
  { src: 'vista-path.png', out: 'vista-path.webp', width: 1400, bias: 0.5 },
  { src: 'hope-h-helping.png', out: 'hope-h.webp', width: 800, bias: 0.5 },
  { src: 'hope-o-our.png', out: 'hope-o.webp', width: 800, bias: 0.5 },
  { src: 'hope-p-parents.png', out: 'hope-p.webp', width: 800, bias: 0.5 },
  { src: 'hope-e-educate.png', out: 'hope-e.webp', width: 800, bias: 0.5 },
];

/** Every plate on the page is set 3:2. */
const RATIO = 3 / 2;

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const plate of PLATES) {
    const image = sharp(path.join(SRC, plate.src));
    const { width, height } = await image.metadata();

    // Trim whichever axis is long, then resize to the target width. Doing both
    // in one pass keeps the resample single-step, which matters on paintings:
    // a crop-then-resize round trip through a second encode softens the brush
    // detail that is the entire reason these are paintings and not photographs.
    const region =
      width / height > RATIO
        ? {
            left: Math.round((width - Math.round(height * RATIO)) * plate.bias),
            top: 0,
            width: Math.round(height * RATIO),
            height,
          }
        : {
            left: 0,
            top: Math.round((height - Math.round(width / RATIO)) * plate.bias),
            width,
            height: Math.round(width / RATIO),
          };

    const buffer = await image
      .extract(region)
      .resize({ width: plate.width })
      .webp({ quality: plate.width > 1000 ? 76 : 74, effort: 6 })
      .toBuffer();

    await writeFile(path.join(OUT, plate.out), buffer);
    console.log(`${plate.out}  ${Math.round(buffer.length / 1024)} KB`);
  }

  const written = new Set(PLATES.map((plate) => plate.out));
  for (const name of await readdir(OUT)) {
    if (!written.has(name)) console.warn(`stale, not produced by this script: ${name}`);
  }
}

await main();
