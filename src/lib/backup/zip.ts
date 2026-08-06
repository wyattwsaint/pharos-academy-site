import { crc32, deflateRawSync } from 'node:zlib';

/**
 * A ZIP archive, written by hand (#33).
 *
 * Hand-written because the thing being built is *the school's copy of its own
 * content*, and the point of it is that it outlives this codebase, its
 * dependencies and the developer. A ZIP is a container three decades of
 * software can open; a library that writes one is a runtime dependency in the
 * deployed function whose only job is to emit ninety bytes of header per file.
 * Node already ships the two hard parts — `deflateRaw` and `crc32` — so what is
 * left is the container format, and the container format is this file.
 *
 * The tests do not check it against itself: `zip.test.ts` opens every archive
 * with `fflate`, an independent implementation carried as a devDependency for
 * that purpose alone. "Readable without Postgres" is not a claim a round trip
 * through my own reader can support.
 *
 * Deliberately not ZIP64 and deliberately not streaming. The whole export is a
 * few megabytes — 18 PDFs at 3.0 MB in the mirror, a decade of retained
 * versions ≈ 30 MB — and it has to be a single `Buffer` anyway to be attached
 * to an email. A streaming writer would be the right shape for a store this
 * size in a decade, and the wrong complexity today.
 */

export type ZipEntry = {
  /** The path inside the archive, `/`-separated. */
  path: string;
  bytes: Buffer;
};

/** Deflate (8) when it helps, store (0) when it does not — see `pack`. */
const DEFLATED = 8;
const STORED = 0;

/** Bit 11 of the general-purpose flags: the name and comment are UTF-8. */
const UTF8_FLAG = 0x800;

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

/**
 * Unix mode `0100644` — a regular file, `rw-r--r--` — in the high sixteen bits,
 * which is where the central directory keeps it. Written unsigned: `<< 16` in
 * JavaScript produces a negative 32-bit int that `writeUInt32LE` refuses.
 */
const EXTERNAL_ATTRIBUTES = (0o100644 * 0x10000) >>> 0;

/**
 * The archive, entries in the order given.
 *
 * `modifiedAt` is one timestamp for every entry rather than one per file, and
 * it is a parameter rather than `new Date()` so the same content produces the
 * same bytes — which is what lets a test compare two archives, and what stops
 * the monthly email from looking different every time nothing changed.
 */
export function zip(entries: readonly ZipEntry[], modifiedAt = new Date()): Buffer {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new Error(
        `Two entries want the path "${entry.path}". An archive with a duplicate path unpacks to whichever one the reader happens to keep.`,
      );
    }
    seen.add(entry.path);
  }

  const { time, date } = dosStamp(modifiedAt);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const { method, payload } = pack(entry.bytes);
    const checksum = crc32(entry.bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // Version needed: 2.0, which is deflate.
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // No extra field.

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4); // Version made by.
    central.writeUInt16LE(20, 6); // Version needed.
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // Extra field length.
    central.writeUInt16LE(0, 32); // Comment length.
    central.writeUInt16LE(0, 34); // Disk number.
    central.writeUInt16LE(0, 36); // Internal attributes.
    central.writeUInt32LE(EXTERNAL_ATTRIBUTES, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, payload);
    centrals.push(central, name);
    offset += local.length + name.length + payload.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(0, 4); // This disk.
  end.writeUInt16LE(0, 6); // The disk the directory starts on.
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // No archive comment.

  return Buffer.concat([...locals, directory, end]);
}

/**
 * Deflate, unless deflating made it bigger.
 *
 * The JSON in this archive compresses to a fraction of itself; the PDFs are
 * already compressed and grow by a few bytes if run through deflate again.
 * Choosing per entry means neither has to be special-cased by name, and a
 * content type added later gets the right answer without anyone deciding.
 */
function pack(bytes: Buffer): { method: number; payload: Buffer } {
  if (bytes.length === 0) return { method: STORED, payload: bytes };

  const deflated = deflateRawSync(bytes, { level: 9 });
  return deflated.length < bytes.length
    ? { method: DEFLATED, payload: deflated }
    : { method: STORED, payload: bytes };
}

/**
 * MS-DOS's date and time, which is what a ZIP entry carries.
 *
 * Two-second resolution and an epoch of 1980 — dates before it clamp there,
 * because the alternative is a negative year field that unzippers read as
 * garbage. Local time by definition of the format; there is no zone in it.
 */
function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.max(at.getFullYear(), 1980);
  const time =
    (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  return { time, date };
}
