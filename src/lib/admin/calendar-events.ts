import type { CalendarEventEdit } from '../calendar/event.js';

/**
 * A one-off event, as the admin form posts it (#23).
 *
 * The same shape as the other parsers here: values always, every complaint at
 * once, and nothing clever. What it is careful about is the time, because the
 * time is the one field that is *optional and structured* — blank is an
 * all-day event and a real state, and "6.30" typed into a time field is a
 * browser's problem rather than this parser's, but a hand-typed value has to be
 * refused rather than stored as something a calendar client cannot read.
 */

export type EventFields = {
  heldOn: string;
  title: string;
  startTime: string;
  place: string;
  note: string;
};

export type EventErrors = Partial<Record<keyof EventFields, string>>;

export type ParsedEvent = {
  /** Always populated, valid or not, so a rejected form redisplays what was typed. */
  values: EventFields;
  /** What the store takes. Only meaningful when `errors` is empty. */
  edit: CalendarEventEdit;
  errors: EventErrors;
};

/** The human names of the fields, used in the form and in its errors. */
export const LABELS: Record<keyof EventFields, string> = {
  heldOn: 'Date',
  title: 'What it is',
  startTime: 'Time',
  place: 'Where',
  note: 'Anything else',
};

export const EMPTY: EventFields = { heldOn: '', title: '', startTime: '', place: '', note: '' };

export function parseEvent(form: FormData): ParsedEvent {
  const values: EventFields = {
    heldOn: text(form, 'heldOn'),
    title: text(form, 'title'),
    startTime: text(form, 'startTime'),
    place: text(form, 'place'),
    note: text(form, 'note').replace(/\r\n/g, '\n'),
  };

  const errors: EventErrors = {};
  if (!values.title) errors.title = `${LABELS.title} cannot be empty.`;
  if (!isCalendarDate(values.heldOn)) {
    errors.heldOn = 'Give the day it happens, as a day on the calendar.';
  }
  if (values.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.startTime)) {
    errors.startTime = 'Give the time as hours and minutes, or leave it empty for an all-day event.';
  }

  return {
    values,
    edit: {
      heldOn: values.heldOn,
      title: values.title,
      startTime: values.startTime || null,
      place: values.place || null,
      note: values.note || null,
    },
    errors,
  };
}

/** A real day on the calendar, not merely four digits and two dashes. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
