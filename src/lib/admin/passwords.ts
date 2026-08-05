import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Passwords, hashed with scrypt from `node:crypto`.
 *
 * No vendor and no native dependency (#18 §4): scrypt is memory-hard, it is in
 * the standard library, and it survives a `npm ci` on a machine nobody has
 * configured. The parameters are stored beside the hash so raising them later
 * is a new prefix rather than a migration of everyone's password.
 */

const SCHEME = 'scrypt';
/** OWASP's scrypt floor at r=8, p=1. ~16 MB and ~50 ms per verification. */
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** A storable `scrypt$N$r$p$salt$hash`, salted freshly on every call. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = derive(password, salt, KEY_LENGTH);
  return [SCHEME, COST, BLOCK_SIZE, PARALLELISM, salt.toString('hex'), key.toString('hex')].join(
    '$',
  );
}

/**
 * Whether `password` produced `stored`.
 *
 * A stored value in any shape this module does not recognise is a `false`, not
 * a throw: a corrupt row should lock one account out, not 500 the login page
 * for everyone.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6) return false;

  const [scheme, cost, blockSize, parallelism, saltHex, keyHex] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (scheme !== SCHEME) return false;

  const salt = fromHex(saltHex);
  const expected = fromHex(keyHex);
  if (!salt || !expected || expected.length === 0) return false;

  const n = Number(cost);
  const r = Number(blockSize);
  const p = Number(parallelism);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: 256 * 1024 * 1024 });
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Whether `password` is the break-glass value held in the Vercel environment.
 *
 * Both admins locked out at once is the only thing this answers (#18 §4). There
 * is deliberately no default: an absent or blank `BREAK_GLASS_PASSWORD` is a
 * closed door, never an open one. The comparison is constant-time and the value
 * is never logged, not even a prefix of it.
 */
export function matchesBreakGlass(password: string): boolean {
  const secret = process.env.BREAK_GLASS_PASSWORD?.trim();
  if (!secret) return false;
  return constantTimeEquals(password, secret);
}

/**
 * Equality that does not leak the length of the shared prefix through timing.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself leak the
 * length, so both sides are hashed to a fixed 32 bytes first. SHA-256 and not
 * scrypt: neither side is ever stored, so there is nothing here for an offline
 * attacker to grind, and the memory-hard version cost ~100 ms of the login
 * request for no gain. This is the same digest `sessions.ts` compares tokens
 * with.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function derive(password: string, salt: Buffer, length: number): Buffer {
  return scryptSync(password, salt, length, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: 256 * 1024 * 1024,
  });
}

function fromHex(value: string): Buffer | undefined {
  if (!/^[0-9a-f]*$/i.test(value) || value.length % 2 !== 0) return undefined;
  return Buffer.from(value, 'hex');
}
