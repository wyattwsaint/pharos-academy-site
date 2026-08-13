import { describe, expect, it } from 'vitest';

import { parseIcalEvents, unescapeIcalText } from './ical.js';

/**
 * The reader, against the shapes Google actually emits.
 *
 * The fixture the sync tests use is the school's own feed, captured whole. What
 * is proved here is smaller and nastier: the folding, the escaping and the
 * parameters, each of which silently corrupts a title or a date when it is got
 * wrong rather than failing loudly.
 */

const CRLF = '\r\n';

function calendar(...lines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join(CRLF);
}

describe('reading events out of a calendar', () => {
  it('finds each VEVENT and ignores everything around them', () => {
    const events = parseIcalEvents(
      calendar(
        'X-WR-CALNAME:Pharos',
        'BEGIN:VEVENT',
        'UID:one@google.com',
        'SUMMARY:Open house',
        'END:VEVENT',
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:two@google.com',
        'SUMMARY:Picture day',
        'END:VEVENT',
      ),
    );

    expect(events.map((event) => event.UID?.value)).toEqual(['one@google.com', 'two@google.com']);
    expect(events[1]?.SUMMARY?.value).toBe('Picture day');
  });

  it('returns nothing for a body that is not a calendar at all', () => {
    expect(parseIcalEvents('<html><body>Sign in to continue</body></html>')).toEqual([]);
  });

  it('reads a property that was folded across lines back as one value', () => {
    // Exactly how the school's own feed carries this title.
    const [event] = parseIcalEvents(
      calendar(
        'BEGIN:VEVENT',
        'UID:one@google.com',
        'SUMMARY:Pharos Academy Reps Making a Presentation at Eastern Regional Confe',
        ' rence',
        'END:VEVENT',
      ),
    );

    expect(event?.SUMMARY?.value).toBe(
      'Pharos Academy Reps Making a Presentation at Eastern Regional Conference',
    );
  });

  it('unfolds a continuation marked with a tab, which RFC 5545 also allows', () => {
    const [event] = parseIcalEvents(
      calendar('BEGIN:VEVENT', 'UID:one@google.com', 'SUMMARY:Picture', '\t day', 'END:VEVENT'),
    );

    // The marker is removed and nothing is put in its place — the space here is
    // the second character of the continuation, which is content.
    expect(event?.SUMMARY?.value).toBe('Picture day');
  });

  it('reads a feed that uses bare newlines rather than CRLF', () => {
    const events = parseIcalEvents(
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:one@google.com\nEND:VEVENT\nEND:VCALENDAR',
    );

    expect(events).toHaveLength(1);
  });

  it('separates a property from its parameters', () => {
    const [event] = parseIcalEvents(
      calendar('BEGIN:VEVENT', 'UID:one@google.com', 'DTSTART;VALUE=DATE:20260914', 'END:VEVENT'),
    );

    expect(event?.DTSTART).toEqual({ value: '20260914', params: { VALUE: 'DATE' } });
  });

  it('keeps a value that itself contains colons and semicolons', () => {
    const [event] = parseIcalEvents(
      calendar(
        'BEGIN:VEVENT',
        'UID:one@google.com',
        'RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20270406;BYDAY=TU',
        'END:VEVENT',
      ),
    );

    expect(event?.RRULE?.value).toBe('FREQ=WEEKLY;WKST=SU;UNTIL=20270406;BYDAY=TU');
    expect(event?.RRULE?.params).toEqual({});
  });

  it('upper-cases the property name, because a feed may not', () => {
    const [event] = parseIcalEvents(
      calendar('BEGIN:VEVENT', 'uid:one@google.com', 'Summary:Open house', 'END:VEVENT'),
    );

    expect(event?.UID?.value).toBe('one@google.com');
    expect(event?.SUMMARY?.value).toBe('Open house');
  });

  it('ignores an event that was never closed rather than inventing one', () => {
    const events = parseIcalEvents(
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:one@google.com\nEND:VCALENDAR',
    );

    expect(events).toEqual([]);
  });
});

describe('unescaping a text value', () => {
  it('restores the commas the school typed in an address', () => {
    // Verbatim from the school's own feed.
    expect(unescapeIcalText('Enola First Church of God\\, 9 Sherwood Dr\\, Enola\\, PA 17025')).toBe(
      'Enola First Church of God, 9 Sherwood Dr, Enola, PA 17025',
    );
  });

  it('restores semicolons and newlines', () => {
    expect(unescapeIcalText('4pm to 7pm\\; come along\\nA percentage goes to Pharos.')).toBe(
      '4pm to 7pm; come along\nA percentage goes to Pharos.',
    );
  });

  it('reads an escaped backslash as one backslash and stops there', () => {
    // The trap: a naive chain turns `\\n` into a newline instead of `\n`.
    expect(unescapeIcalText('C:\\\\temp\\\\notes')).toBe('C:\\temp\\notes');
    expect(unescapeIcalText('half \\\\n not a newline')).toBe('half \\n not a newline');
  });

  it('accepts an upper-case \\N, which RFC 5545 treats as a newline too', () => {
    expect(unescapeIcalText('one\\Ntwo')).toBe('one\ntwo');
  });
});
