/**
 * The accessibility bar, in one place.
 *
 * Every suite that runs axe holds the same screens to the same tags, and a
 * second copy of this array is how one of them quietly stops doing that — the
 * admin specs and the empty-lists specs both claim to measure "the same bar",
 * so they read it from here rather than each declaring it.
 */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * A violation rendered so a CI failure names the rule and the element.
 *
 * Here for the same reason the tags are: a suite that renders violations its
 * own way is a suite whose failures read differently from everybody else's,
 * and the whole value of this line is that somebody reading a CI log knows
 * what it means without opening the spec that printed it.
 */
export function describeViolation(violation: {
  id: string;
  impact?: string | null;
  nodes: { target: unknown[] }[];
}): string {
  return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.nodes
    .map((node) => node.target.join(' '))
    .join(', ')}`;
}
