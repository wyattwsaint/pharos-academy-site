import type { Page } from '@playwright/test';

/**
 * Ask the server for a preview from a browser that has scripting on (#264).
 *
 * The application page's preview button lives in `<noscript>` — a family with
 * scripting has no need of it, because the totals follow their choices. But two
 * things a browser cannot do for itself still need the round trip: the clash
 * warnings, which need the timetable that is deliberately kept out of the
 * bundle, and what the POST actually carried, which is the only proof that a
 * row the family dropped was dropped.
 *
 * `submit()` and not a click: it posts with no submitter, so the hidden field
 * added here is what names the intent — `intent=check`, the same request the
 * `<noscript>` button makes, which re-renders the totals, the warnings and the
 * greyed send and **writes no row**. That is what makes every test using this
 * safe against a real deployment.
 */
export async function previewTotals(page: Page): Promise<void> {
  await page.evaluate(() => {
    const form = document.querySelector('form');
    const intent = document.createElement('input');
    intent.type = 'hidden';
    intent.name = 'intent';
    intent.value = 'check';
    form?.append(intent);
    form?.submit();
  });
}
