import type { PersonEdit } from '../people/store.js';

/**
 * A person, as the admin form posts them (#26).
 *
 * The parser sits beside `school-details.ts` and works the same way: it always
 * hands back values, valid or not, so a rejected form redisplays what was
 * typed, and it collects every complaint at once rather than one per round
 * trip.
 *
 * The whole of the interesting behaviour is about **absence**. A bio Jill has
 * not written and a photograph she does not have are valid states, not gaps to
 * apologise for, so both become null — never `''`, which would be the row
 * claiming she wrote an empty paragraph.
 */

/** The form's fields, which are also the error keys. `PersonEdit` is the store's. */
export type PersonFields = PersonEdit;

export type PersonErrors = Partial<Record<keyof PersonFields, string>>;

export type ParsedPerson = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: PersonFields;
  /** Empty when the submission is good. */
  errors: PersonErrors;
};

/** The human names of the fields, used in both the form and its errors. */
export const LABELS: Record<keyof PersonFields, string> = {
  name: 'Name',
  role: 'Role',
  bio: 'About them',
  photo: 'Photograph',
  leadershipRank: 'Leadership order',
};

/** Read a submitted form, trimmed, with every complaint collected at once. */
export function parsePerson(form: FormData): ParsedPerson {
  const values: PersonFields = {
    name: text(form, 'name'),
    role: text(form, 'role'),
    bio: optional(text(form, 'bio').replace(/\r\n/g, '\n')),
    photo: optional(text(form, 'photo')),
    leadershipRank: null,
  };

  const errors: PersonErrors = {};
  if (!values.name) errors.name = `${LABELS.name} cannot be empty.`;
  if (!values.role) errors.role = `${LABELS.role} cannot be empty — say what they do here.`;

  const rank = text(form, 'leadershipRank');
  if (rank) {
    if (!/^\d+$/.test(rank) || Number(rank) < 1) {
      errors.leadershipRank =
        'Leadership order is a whole number from 1 upwards, or blank for everybody else.';
    } else {
      values.leadershipRank = Number(rank);
    }
  }

  if (values.photo && !isSitePhotograph(values.photo)) {
    errors.photo =
      'A photograph is a file in this site — “/portraits/their-name.webp”, built from the ' +
      'sources in assets/portraits with the site’s other images.';
  }

  return { values, errors };
}

/**
 * A photograph this site actually holds.
 *
 * Portraits must be photographs of real consenting adults (#13, #26, #99), and
 * the four the school supplied live in `public/portraits/`. A path under
 * `public/` is one somebody at the school chose, can look at, and can take
 * down; an off-site URL is a face nobody here can vouch for, so it is refused
 * rather than hot-linked.
 *
 * The second leading slash is the case worth naming: `//example.org/face.jpg`
 * *looks* like a path and is a protocol-relative URL, so a check that only
 * asked for a leading slash would let exactly the thing this refuses straight
 * through into a named member of staff's place.
 */
function isSitePhotograph(value: string): boolean {
  if (value.startsWith('//') || value.includes('..')) return false;
  return /^\/[\w./-]+\.(webp|jpg|jpeg|png|avif)$/i.test(value);
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Nothing typed is nothing stored — null, so the page renders no element at all. */
function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}
