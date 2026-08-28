import type { Page } from '@playwright/test';

/**
 * The household's contact details on the Apply page (#312).
 *
 * Shared, because three specs fill in a sendable application and none of them
 * is about the phone or the address: `admin.spec.ts` twice and
 * `application.spec.ts` once. A fourth copy of five `fill` calls is how one of
 * them comes to be the copy that was not updated when the fields moved.
 *
 * The state is left alone deliberately — Pennsylvania is preselected, and a
 * test that checked it would be asserting the default by re-typing it.
 */
export const SUITE_ADDRESS = {
  phone: '717-555-0142',
  street: '12 Oak Lane',
  city: 'Gettysburg',
  state: 'PA',
  zip: '17325',
};

export async function fillContactDetails(page: Page): Promise<void> {
  await page.fill('#apply-phone', SUITE_ADDRESS.phone);
  await page.fill('#apply-street', SUITE_ADDRESS.street);
  await page.fill('#apply-city', SUITE_ADDRESS.city);
  await page.fill('#apply-zip', SUITE_ADDRESS.zip);
}
