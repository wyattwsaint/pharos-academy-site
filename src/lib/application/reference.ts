/**
 * The short code an application calls itself by (#218).
 *
 * A row's id is a 36-character uuid, and a uuid is not something a family
 * retypes correctly. It has to be, because Vanco sends the site nothing
 * (ADR-0013): the office matches a payment to an application by reading the
 * note a family typed into the church's giving page, so this code is the only
 * thing joining the two, and it is read off a screen or an email and typed
 * somewhere else by hand.
 *
 * **Derived, never stored.** No column, no sequence, no second identity to keep
 * in step with the id — the same row answers the same code forever, and a row
 * restored from a backup keeps the code the family already quoted. Computing
 * rather than storing is the same habit as ADR-0003.
 */

/**
 * The characters a code is spelled with.
 *
 * Twenty-six of the thirty-six, and the ten that are missing are missing
 * because somebody copying a code by hand confuses them: `0`/`O`, `1`/`I`/`L`,
 * `2`/`Z`, `5`/`S`, `6`/`G`, `8`/`B`. Only one of each pair survives. `U` goes
 * too, which leaves `A`, `E` and `Y` as the only vowels — so a code is very
 * unlikely to spell a word at anybody.
 */
export const REFERENCE_ALPHABET = '23456789ACDEFHJKMNPQRTVWXY';

/** Eight characters: 26⁸ codes, which is far more rows than this school will ever hold. */
const LENGTH = 8;

/** FNV-1a, 64-bit — small, pure, and the same answer in every runtime. */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const SIXTY_FOUR_BITS = 0xffffffffffffffffn;

/**
 * The reference for one application row.
 *
 * The id is folded case-insensitively and trimmed first: Postgres hands back a
 * lowercase uuid, but an id that reached here from a URL or a spreadsheet must
 * not fork the code a family was already told.
 *
 * A refused submission has no row and therefore no reference — callers hold a
 * `string | null` and pass the null along, rather than asking this for a code
 * for a row that does not exist.
 */
export function applicationReference(id: string): string {
  let hash = FNV_OFFSET;
  for (const character of id.trim().toLowerCase()) {
    hash = ((hash ^ BigInt(character.codePointAt(0) ?? 0)) * FNV_PRIME) & SIXTY_FOUR_BITS;
  }

  const base = BigInt(REFERENCE_ALPHABET.length);
  let code = '';
  for (let taken = 0; taken < LENGTH; taken += 1) {
    code = REFERENCE_ALPHABET[Number(hash % base)] + code;
    hash /= base;
  }

  // Grouped in fours, the way a card number or a postcode is: a family reading
  // this down a phone line pauses where the hyphen is.
  return `PA-${code.slice(0, 4)}-${code.slice(4)}`;
}
