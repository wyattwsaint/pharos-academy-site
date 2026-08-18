/**
 * Writes the browser-tab icons from `public/mark.svg` (#291).
 *
 * The site had none: no `rel="icon"`, no `favicon.ico`, so every tab showed the
 * browser's blank page glyph and Google's result rows showed the generic globe
 * beside the link. The favicon is what Google fetches for that row — it is not
 * read out of the structured data — so the icons here and the `logo` on the
 * School node are two separate fixes for the same complaint.
 *
 * All of them are the trace, not the raster logo, for the reason the header
 * uses the trace: at 16px the raster's soft beam turns to mush, and these are
 * mostly rendered at 16px.
 *
 * **The mark is squared onto a navy tile rather than shipped as-is.** The trace
 * is 268x302 with a tall thin tower; letterboxed into a square tab slot it
 * renders about nine pixels wide, and the wave that makes it legible as a
 * lighthouse falls below one pixel. The navy is the header's own ground, so the
 * tile is the same lockup a visitor already saw stuck to the top of the page.
 *
 * Run by hand and the output is committed, exactly like `build-social-preview.mjs`:
 *
 *   npm i --no-save sharp && node scripts/build-favicon.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARK = path.join(root, 'public', 'mark.svg');

/** The header's ground, `--color-navy`. Held to the token by `favicon.test.ts`. */
const NAVY = '#17365c';

/** The tile, in its own units. Every raster below is this SVG resized. */
const TILE = 512;
/** How tall the mark stands in that tile — the rest is quiet margin. */
const MARK_HEIGHT = 380;

const source = await readFile(MARK, 'utf8');

const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1];
if (!viewBox) throw new Error(`no viewBox in ${MARK}`);
const [, , boxWidth, boxHeight] = viewBox.split(/\s+/).map(Number);

// The mark's own aspect, kept. Squaring it by stretching would be a rebrand.
const markWidth = (boxWidth / boxHeight) * MARK_HEIGHT;

const inner = source
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}" role="img" aria-label="Pharos Academy">
  <rect width="${TILE}" height="${TILE}" rx="96" fill="${NAVY}" />
  <svg
    x="${round((TILE - markWidth) / 2)}"
    y="${round((TILE - MARK_HEIGHT) / 2)}"
    width="${round(markWidth)}"
    height="${MARK_HEIGHT}"
    viewBox="${viewBox}"
  >
${inner}
  </svg>
</svg>
`;

await writeFile(path.join(root, 'public', 'favicon.svg'), svg);

/** Two decimals is finer than a 512px tile can show. */
function round(n) {
  return Math.round(n * 100) / 100;
}

/** The raster fallbacks, each at the size the platform that asks for it uses. */
const RASTERS = [
  // Safari's home-screen tile, which is never transparent and never rounded by
  // us — iOS masks its own corners over whatever it is given.
  ['apple-touch-icon.png', 180],
  // Android's home screen, and the size Google's own crawler prefers to find.
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

for (const [name, size] of RASTERS) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(path.join(root, 'public', name), png);
}

/**
 * `favicon.ico`, for the browsers and crawlers that still request it at the
 * root whatever the markup says. An ICO is a directory of images and each entry
 * is allowed to be a whole PNG file, which is what these are — no BMP, no
 * inverted rows, no AND mask.
 */
const ICO_SIZES = [16, 32, 48];
const frames = await Promise.all(
  ICO_SIZES.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(frames.length, 4);

const DIRECTORY_ENTRY = 16;
let offset = header.length + DIRECTORY_ENTRY * frames.length;
const directory = frames.map((frame, i) => {
  const entry = Buffer.alloc(DIRECTORY_ENTRY);
  // 0 means 256; every size here is smaller, so the byte is literal.
  entry.writeUInt8(ICO_SIZES[i], 0);
  entry.writeUInt8(ICO_SIZES[i], 1);
  entry.writeUInt8(0, 2); // palette size: 0, the PNG carries its own colours
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(frame.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += frame.length;
  return entry;
});

await writeFile(
  path.join(root, 'public', 'favicon.ico'),
  Buffer.concat([header, ...directory, ...frames]),
);

console.log(`favicon.svg, ${RASTERS.map(([name]) => name).join(', ')}, favicon.ico`);
