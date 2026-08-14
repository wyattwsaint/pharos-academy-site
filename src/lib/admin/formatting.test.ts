import { describe, expect, it } from 'vitest';

import { formatDay, formatStamp, formatTimestamp } from './formatting.js';

describe('the attribution stamp', () => {
  it('names the person and the day', () => {
    expect(formatStamp('Jill Kilker', new Date('2026-08-05T14:30:00Z'))).toBe(
      'Last edited by Jill Kilker on 5 August 2026',
    );
  });

  it('says so plainly when nothing has been edited yet', () => {
    expect(formatStamp(null, null)).toBe('Not edited yet');
    expect(formatStamp('Jill Kilker', null)).toBe('Not edited yet');
  });
});

describe('a moment printed on an admin row', () => {
  /*
   * Matched rather than compared, on the separator only: whether Node's ICU
   * writes "5 August 2026, 09:14" or "5 August 2026 at 09:14" is its business
   * and has changed between releases. The day and the clock are the assertion.
   */
  it('gives the day and the time', () => {
    expect(formatTimestamp(new Date('2026-08-05T13:14:00Z'))).toMatch(/^5 August 2026\D+09:14$/);
  });

  // Vercel renders in UTC; Enola is behind it. An inquiry that arrived on
  // Tuesday evening in Enola must not be filed under Wednesday.
  it('reads the clock in Enola, not in the region that rendered it', () => {
    expect(formatTimestamp(new Date('2026-08-05T01:30:00Z'))).toMatch(/^4 August 2026\D+21:30$/);
    expect(formatDay(new Date('2026-08-05T01:30:00Z'))).toBe('4 August 2026');
  });
});
