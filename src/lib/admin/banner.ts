/**
 * What an admin screen says after an action, in the one shape every screen uses.
 *
 * Rendered by `src/components/AdminBanner.astro`. The type lives here rather
 * than in the component so a page can build one in its frontmatter — and so the
 * store's functions can hand one back — without importing a component to get a
 * type.
 */
export type Banner = {
  /** False also means the screen should offer whatever comes next, e.g. Retry. */
  ok: boolean;
  message: string;
};
