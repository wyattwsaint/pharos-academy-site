import { describe, expect, it } from 'vitest';

import {
  ADDRESS_REQUIRED_MESSAGE,
  DEFAULT_STATE,
  STATE_UNKNOWN_MESSAGE,
  US_STATES,
  ZIP_FORMAT_MESSAGE,
  addressError,
  blankAddress,
  formatAddress,
  isUsState,
  isZipCode,
  type HouseholdAddress,
} from './address.js';

/** A complete address, with one part overridden per test. */
const address = (over: Partial<HouseholdAddress> = {}): HouseholdAddress => ({
  street: '12 Oak Lane',
  street2: '',
  city: 'Gettysburg',
  state: 'PA',
  zip: '17325',
  ...over,
});

describe('the states the dropdown offers (#312)', () => {
  it('is the fifty states and the District of Columbia', () => {
    expect(US_STATES).toHaveLength(51);
    expect(US_STATES.filter((state) => state.code === 'DC')).toHaveLength(1);
  });

  it('has no duplicate code, which a dropdown cannot show twice', () => {
    expect(new Set(US_STATES.map((state) => state.code)).size).toBe(US_STATES.length);
  });

  it('opens on Pennsylvania, and Pennsylvania is in the list', () => {
    // A preselection, not a lock: the default has to be one of the options, or
    // the form opens on a state the family cannot re-choose after leaving it.
    expect(DEFAULT_STATE).toBe('PA');
    expect(isUsState(DEFAULT_STATE)).toBe(true);
    expect(blankAddress().state).toBe(DEFAULT_STATE);
  });

  it('refuses a territory and a state name', () => {
    // Codes are what the record holds. A form posting "Pennsylvania" is not a
    // dropdown, and a family in Guam is a conversation.
    expect(isUsState('PR')).toBe(false);
    expect(isUsState('Pennsylvania')).toBe(false);
    expect(isUsState('')).toBe(false);
  });
});

describe('what counts as a ZIP code (#312)', () => {
  it('takes five digits, and five plus four', () => {
    expect(isZipCode('17325')).toBe(true);
    expect(isZipCode('17325-1234')).toBe(true);
  });

  it('refuses anything else', () => {
    // Strict for `isPhoneNumber`'s reason: this is typed by a parent who will
    // be posted to, and a transposed digit should be an inline error rather
    // than a returned envelope.
    for (const wrong of ['1732', '173255', '17325 1234', '17325-12', 'GU1 1AA', '']) {
      expect(isZipCode(wrong), wrong).toBe(false);
    }
  });
});

describe('what makes a household address complete (#312)', () => {
  it('passes a whole one', () => {
    expect(addressError(address())).toBeUndefined();
  });

  it('never asks about the second street line', () => {
    // The only optional part. A rule that mentioned it would be a rule about
    // apartments.
    expect(addressError(address({ street2: '' }))).toBeUndefined();
    expect(addressError(address({ street2: 'Apt 3' }))).toBeUndefined();
  });

  it.each(['street', 'city', 'state', 'zip'] as const)('asks for the %s', (part) => {
    expect(addressError(address({ [part]: '' }))).toBe(ADDRESS_REQUIRED_MESSAGE);
  });

  it('says one thing about an address short of several parts', () => {
    // One sentence over five controls, the page's convention: a family filling
    // in an address is doing one thing, and four simultaneous complaints about
    // it read as four problems.
    expect(addressError(blankAddress())).toBe(ADDRESS_REQUIRED_MESSAGE);
  });

  it('names the ZIP only once the rest is there', () => {
    // "A ZIP code looks like 17325" is unhelpful advice to somebody who has not
    // typed a street yet.
    expect(addressError(address({ zip: '173' }))).toBe(ZIP_FORMAT_MESSAGE);
    expect(addressError(address({ street: '', zip: '173' }))).toBe(ADDRESS_REQUIRED_MESSAGE);
  });

  it('refuses a state nobody could have picked', () => {
    expect(addressError(address({ state: 'ZZ' }))).toBe(STATE_UNKNOWN_MESSAGE);
  });
});

describe('the address as it goes on an envelope (#312)', () => {
  it('writes two lines when there is no second street line', () => {
    expect(formatAddress(address())).toBe('12 Oak Lane\nGettysburg, PA 17325');
  });

  it('writes three when there is', () => {
    expect(formatAddress(address({ street2: 'Apt 3' }))).toBe(
      '12 Oak Lane\nApt 3\nGettysburg, PA 17325',
    );
  });

  it('writes nothing at all for a row from before the fields existed', () => {
    // Every application already in Neon. Empty is what puts the dash on the
    // admin screen and keeps the line out of both emails, rather than a blank
    // block that reads as a bug.
    expect(formatAddress({ street: '', street2: '', city: '', state: '', zip: '' })).toBe('');
  });
});
