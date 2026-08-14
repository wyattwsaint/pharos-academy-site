/**
 * The accessibility bar, in one place.
 *
 * Every suite that runs axe holds the same screens to the same tags, and a
 * second copy of this array is how one of them quietly stops doing that — the
 * admin specs and the empty-lists specs both claim to measure "the same bar",
 * so they read it from here rather than each declaring it.
 */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
