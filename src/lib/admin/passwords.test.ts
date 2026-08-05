import { afterEach, describe, expect, it } from 'vitest';

import { hashPassword, matchesBreakGlass, verifyPassword } from './passwords.js';

describe('password hashing', () => {
  it('verifies the password it hashed', () => {
    const stored = hashPassword('a correct horse battery staple');
    expect(verifyPassword('a correct horse battery staple', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('a correct horse battery staple');
    expect(verifyPassword('a correct horse battery stapl', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', () => {
    expect(hashPassword('same')).not.toEqual(hashPassword('same'));
  });

  it('never stores the password itself', () => {
    expect(hashPassword('recognisable-secret')).not.toContain('recognisable-secret');
  });

  it('rejects a stored value it does not recognise rather than throwing', () => {
    expect(verifyPassword('anything', '')).toBe(false);
    expect(verifyPassword('anything', 'plaintext')).toBe(false);
    expect(verifyPassword('anything', 'scrypt$16384$8$1$nothex$nothex')).toBe(false);
    expect(verifyPassword('anything', 'argon2$whatever')).toBe(false);
  });
});

describe('the break-glass password', () => {
  const original = process.env.BREAK_GLASS_PASSWORD;

  afterEach(() => {
    if (original === undefined) delete process.env.BREAK_GLASS_PASSWORD;
    else process.env.BREAK_GLASS_PASSWORD = original;
  });

  it('grants access when the environment value matches', () => {
    process.env.BREAK_GLASS_PASSWORD = 'the-sheet-in-the-locked-drawer';
    expect(matchesBreakGlass('the-sheet-in-the-locked-drawer')).toBe(true);
  });

  it('refuses anything else', () => {
    process.env.BREAK_GLASS_PASSWORD = 'the-sheet-in-the-locked-drawer';
    expect(matchesBreakGlass('the-sheet-in-the-locked-draweR')).toBe(false);
    expect(matchesBreakGlass('')).toBe(false);
  });

  // An absent value must never be an open door — the failure mode of a default
  // is a deployment where every password is the break-glass password.
  it('fails closed when the environment value is absent or blank', () => {
    delete process.env.BREAK_GLASS_PASSWORD;
    expect(matchesBreakGlass('')).toBe(false);
    expect(matchesBreakGlass('anything')).toBe(false);

    process.env.BREAK_GLASS_PASSWORD = '   ';
    expect(matchesBreakGlass('   ')).toBe(false);
    expect(matchesBreakGlass('')).toBe(false);
  });
});
