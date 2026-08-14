import { describe, expect, it } from 'vitest';

import { returnPath } from './return-path.js';

describe('where a form is allowed to come back to', () => {
  it('keeps a path on this site', () => {
    expect(returnPath('/admin/money')).toBe('/admin/money');
    expect(returnPath('/admin/policies/handbook')).toBe('/admin/policies/handbook');
  });

  it('keeps the query string a screen was opened with', () => {
    expect(returnPath('/admin/courses/new?from=classes')).toBe('/admin/courses/new?from=classes');
  });

  it('falls back to School details when nothing was carried', () => {
    expect(returnPath(null)).toBe('/admin/school-details');
    expect(returnPath(undefined)).toBe('/admin/school-details');
    expect(returnPath('')).toBe('/admin/school-details');
  });

  it('refuses another site, however it is spelled', () => {
    expect(returnPath('https://evil.example/admin')).toBe('/admin/school-details');
    expect(returnPath('//evil.example')).toBe('/admin/school-details');
    expect(returnPath('/\\evil.example')).toBe('/admin/school-details');
    expect(returnPath('javascript:alert(1)')).toBe('/admin/school-details');
  });

  it('refuses a relative path, which is not a screen we can name', () => {
    expect(returnPath('admin/money')).toBe('/admin/school-details');
    expect(returnPath('../admin/money')).toBe('/admin/school-details');
  });
});
