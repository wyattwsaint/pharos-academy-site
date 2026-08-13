/**
 * Reading an iCalendar file, as far as this site needs to read one (#153).
 *
 * The counterpart to `ics.ts`, which writes the school's own feed. This one
 * reads somebody else's — Google's — and it is deliberately a reader for the
 * subset that appears in it rather than a general RFC 5545 implementation: the
 * events, their properties and their parameters, and nothing about alarms,
 * timezone components or recurrence arithmetic.
 *
 * Small on purpose, and hand-written rather than a dependency, for the reason
 * the ZIP writer is: what arrives here is a public URL the school controls and
 * the failure mode of a parser bug is a wrong date on a page a parent reads.
 * The whole of it fits on a screen and every rule in it is tested against the
 * school's own captured feed.
 */

/** One property: its value, and whatever came before the colon. */
export type IcalProperty = {
  /** Still escaped. Text properties go through {@link unescapeIcalText}. */
  value: string;
  /** `DTSTART;VALUE=DATE` gives `{ VALUE: 'DATE' }`. Empty when there are none. */
  params: Record<string, string>;
};

/**
 * One VEVENT, keyed by upper-case property name.
 *
 * A plain record rather than a class, and last-one-wins where a property
 * repeats: nothing this site reads is legitimately multi-valued. `EXDATE`
 * repeats nineteen times in the school's feed and is never read, because the
 * recurring events it belongs to are skipped whole.
 */
export type IcalEvent = Record<string, IcalProperty | undefined>;

/**
 * Every VEVENT in a calendar body, in the order it appears.
 *
 * An empty array for anything that is not a calendar — a sign-in page, an error
 * document, a truncated download. The caller must treat that as a failed read
 * rather than as an empty calendar, and `sync.ts` is where that distinction is
 * enforced, because it is the difference between "nothing is on" and "the
 * school's whole calendar has been deleted".
 */
export function parseIcalEvents(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  let current: IcalEvent | undefined;

  for (const line of unfoldLines(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      // An END with no BEGIN is a malformed feed, not an empty event.
      if (current) events.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;

    const property = parseLine(line);
    if (property) current[property.name] = { value: property.value, params: property.params };
  }

  // Anything still open at the end of the file was truncated in transit. It is
  // dropped rather than published: a half-read event has a title and no date.
  return events;
}

/**
 * The physical lines put back together into logical ones.
 *
 * A continuation is a line beginning with a space or a tab, and its first
 * character is the marker rather than content — RFC 5545 folds by inserting
 * one, so unfolding removes exactly one and no more. Bare newlines are accepted
 * as well as CRLF, because a feed that has been through a text editor or a test
 * fixture has lost its carriage returns and is otherwise perfectly readable.
 */
function unfoldLines(text: string): string[] {
  const lines: string[] = [];

  for (const physical of text.split(/\r?\n/)) {
    if (/^[ \t]/.test(physical) && lines.length > 0) {
      lines[lines.length - 1] += physical.slice(1);
    } else {
      lines.push(physical);
    }
  }

  return lines;
}

/**
 * `DTSTART;VALUE=DATE:20260914` → the name, the parameters and the value.
 *
 * Split at the **first** colon, because everything after it is the value and
 * values contain colons: an RRULE is `FREQ=WEEKLY;WKST=SU;…` and a URL is
 * worse. The semicolons that separate parameters are therefore only the ones
 * before that colon, which is what makes the RRULE case fall out for free.
 */
function parseLine(line: string): ({ name: string } & IcalProperty) | undefined {
  const colon = line.indexOf(':');
  if (colon < 0) return undefined;

  const [name, ...parameterParts] = line.slice(0, colon).split(';');
  if (!name) return undefined;

  const params: Record<string, string> = {};
  for (const part of parameterParts) {
    const equals = part.indexOf('=');
    if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1);
  }

  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/**
 * A text value, as the person who typed it wrote it.
 *
 * One pass rather than a chain of replaces, and that is the whole reason this
 * is a function rather than three lines at the call site: chained replaces turn
 * an escaped backslash followed by an `n` into a newline, so a Windows path in
 * a note comes back with a line break in the middle of it.
 *
 * Both `\n` and `\N` are newlines — RFC 5545 says so, and Google emits the
 * lower-case one.
 */
export function unescapeIcalText(value: string): string {
  let out = '';

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      out += value[index];
      continue;
    }

    const escaped = value[(index += 1)];
    if (escaped === undefined) break;
    out += escaped === 'n' || escaped === 'N' ? '\n' : escaped;
  }

  return out;
}
