import { describe, expect, it } from 'vitest';

import { bypassHeaders } from './protection.js';

describe('bypassHeaders', () => {
  it('sends nothing when no bypass secret is configured', () => {
    expect(bypassHeaders(undefined)).toEqual({});
    expect(bypassHeaders('')).toEqual({});
    expect(bypassHeaders('   ')).toEqual({});
  });

  it('sends the bypass token and asks for the cookie when a secret is configured', () => {
    expect(bypassHeaders('s3cret')).toEqual({
      'x-vercel-protection-bypass': 's3cret',
      'x-vercel-set-bypass-cookie': 'samesitenone',
    });
  });

  it('trims the secret, so a stray newline in a CI secret still authenticates', () => {
    expect(bypassHeaders(' s3cret\n')['x-vercel-protection-bypass']).toBe('s3cret');
  });
});
