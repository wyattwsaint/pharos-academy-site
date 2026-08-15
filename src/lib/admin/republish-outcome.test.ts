import { describe, expect, it } from 'vitest';

import {
  personDeletionOutcome,
  policyDeletionOutcome,
  removalOutcome,
  republishOutcome,
} from './republish-outcome.js';

describe('what ?republished= means', () => {
  it('reports a republish that reached the live site', () => {
    expect(republishOutcome('live')).toEqual({
      ok: true,
      message: 'Republished — the live site is up to date.',
    });
  });

  it('reports one that did not, and points at Retry', () => {
    expect(republishOutcome('stale')).toEqual({
      ok: false,
      message: "Republishing didn't reach the live site — Retry.",
    });
  });

  it('says nothing at all when the screen was merely opened', () => {
    expect(republishOutcome(null)).toBeNull();
  });

  it('says nothing about a value it does not recognise', () => {
    expect(republishOutcome('')).toBeNull();
    expect(republishOutcome('LIVE')).toBeNull();
    expect(republishOutcome('probably')).toBeNull();
  });
});

describe('what ?removed= means (#200)', () => {
  it('names the one-off and says the live calendar caught up', () => {
    expect(removalOutcome('Fall open house', 'live', 'calendar')).toEqual({
      ok: true,
      message: 'Fall open house is off the calendar. Republished — the live site is up to date.',
    });
  });

  it('does not claim the live site caught up when it did not', () => {
    expect(removalOutcome('Fall open house', 'stale', 'calendar')).toEqual({
      ok: false,
      message:
        "Fall open house is off the calendar. Republishing didn't reach the live site — Retry.",
    });
  });

  it('still reports the removal when the URL says nothing about republishing', () => {
    expect(removalOutcome('Fall open house', null, 'calendar')).toEqual({
      ok: true,
      message: 'Fall open house is off the calendar.',
    });
  });

  it('says nothing at all when the list was merely opened', () => {
    expect(removalOutcome(null, null, 'calendar')).toBeNull();
    expect(removalOutcome(null, 'live', 'calendar')).toBeNull();
  });

  /**
   * The announcements list reports its delete in the same words (#258).
   *
   * The place is the only thing that differs, and it comes from a closed list
   * rather than from the URL — so the two screens cannot drift into describing
   * one kind of event two ways.
   */
  it('says the same about a deleted announcement, and says where', () => {
    expect(removalOutcome('Texas Roadhouse night', 'live', 'news')).toEqual({
      ok: true,
      message:
        'Texas Roadhouse night is off the news page. Republished — the live site is up to date.',
    });
  });

  it('does not claim the news page caught up when it did not', () => {
    expect(removalOutcome('Texas Roadhouse night', 'stale', 'news')).toEqual({
      ok: false,
      message:
        "Texas Roadhouse night is off the news page. Republishing didn't reach the live site — Retry.",
    });
  });
});

describe('what ?deleted= means (#260)', () => {
  it('names the policy, says the documents are kept, and reports the republish', () => {
    expect(policyDeletionOutcome('Handbook', 'live')).toEqual({
      ok: true,
      message:
        'Handbook is deleted. Every document already uploaded to it is still readable at the address it was given. Republished — the live site is up to date.',
    });
  });

  // The delete happened either way, so the banner still reports it — but it is
  // not allowed to imply that a family reading the policies page has caught up.
  it('does not claim the live site caught up when it did not', () => {
    expect(policyDeletionOutcome('Handbook', 'stale')).toEqual({
      ok: false,
      message:
        "Handbook is deleted. Every document already uploaded to it is still readable at the address it was given. Republishing didn't reach the live site — Retry.",
    });
  });

  it('still reports the deletion when the URL says nothing about republishing', () => {
    expect(policyDeletionOutcome('Handbook', null)).toEqual({
      ok: true,
      message:
        'Handbook is deleted. Every document already uploaded to it is still readable at the address it was given.',
    });
  });

  it('says nothing at all when the list was merely opened', () => {
    expect(policyDeletionOutcome(null, null)).toBeNull();
    expect(policyDeletionOutcome(null, 'live')).toBeNull();
  });
});

describe('what ?deleted= means on People (#262)', () => {
  it('names who went, says the classes are still running, and reports the republish', () => {
    expect(personDeletionOutcome('Dr. Mandy Saint', 'live')).toEqual({
      ok: true,
      message:
        'Dr. Mandy Saint is deleted. Any class they taught is still running, and is now waiting for an instructor. Republished — the live site is up to date.',
    });
  });

  // The delete happened either way, so the banner still reports it — but it is
  // not allowed to imply that a parent reading the staff page has caught up.
  it('does not claim the live site caught up when it did not', () => {
    expect(personDeletionOutcome('Dr. Mandy Saint', 'stale')).toEqual({
      ok: false,
      message:
        "Dr. Mandy Saint is deleted. Any class they taught is still running, and is now waiting for an instructor. Republishing didn't reach the live site — Retry.",
    });
  });

  it('still reports the deletion when the URL says nothing about republishing', () => {
    expect(personDeletionOutcome('Dr. Mandy Saint', null)).toEqual({
      ok: true,
      message:
        'Dr. Mandy Saint is deleted. Any class they taught is still running, and is now waiting for an instructor.',
    });
  });

  it('says nothing at all when the list was merely opened', () => {
    expect(personDeletionOutcome(null, null)).toBeNull();
    expect(personDeletionOutcome(null, 'live')).toBeNull();
  });
});
