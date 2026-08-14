/**
 * The gap either side of a link, judged on the page rather than in the source
 * (#184).
 *
 * `punctuation.ts` already reads this in the `.astro` files, and the reading it
 * makes there is the right one for a file: a newline and its indentation are
 * whitespace, so a link wrapped onto its own line is spaced correctly. What
 * #184 showed is that the *page* did not agree. Astro's `compressHTML` deleted
 * the newline between a line of prose and the `<a>` on the next line outright
 * rather than collapsing it to a space, and the live site read
 * "Pharos Academy meets at**Enola First Church of God**". The source was right;
 * the render was wrong; a rule that only reads source cannot see the
 * difference.
 *
 * So this module judges a link's neighbourhood as three strings — the text
 * before it, its own text, the text after it — taken from wherever they can be
 * taken from. `e2e/link-spacing.spec.ts` lifts them off the rendered DOM, which
 * is the only place the fault of #184 exists.
 *
 * The verdict lives here, and `punctuation.ts` is written to the same
 * conditions, so the two readings cannot come to different answers about
 * whether a sentence has a fault in it. What differs is what each can then say:
 * the source rule names the line and proposes the correction, and this one
 * names the page.
 */

/**
 * One link's neighbourhood: what is written immediately before it, the link's
 * own text, and what is written immediately after.
 *
 * Each side is the adjacent **text** and nothing else — no tag, no expression,
 * and no element. A side that holds none is `''`, which is read as "there is no
 * prose here to run into": a nav item, a footer link and a button-styled call
 * to action all arrive that way, and none of them has a gap to get wrong.
 */
export type LinkGap = { before: string; text: string; after: string };

/**
 * What can be wrong with one.
 *
 * `run-into-*` is the sentence reading as one long word — #184's fault, and the
 * one a family sees. `smuggled-*` is the same gap faked from inside the anchor,
 * where it renders as a space but underlines as part of the link; it is only a
 * fault when the anchor's space is the *only* space, because a space outside
 * the anchor is the one that survives the collapse (#171).
 */
export type LinkGapFault = 'run-into-before' | 'run-into-after' | 'smuggled-before' | 'smuggled-after';

/**
 * Marks a link may sit flush against on its right: the punctuation that closes
 * a sentence or a bracket, the possessive that hangs off a name, and the
 * entity a template writes a space or a dash as.
 */
export const FLUSH_AFTER = /^[,.;:!?)\]}"'’”…/\\&|–—-]/;

/** The same, on a link's left: what opens a bracket, a quotation or a path. */
export const FLUSH_BEFORE = /[([{"'“‘/\\&|$–—-]$/;

/**
 * Everything wrong with one link's spacing, or an empty list.
 *
 * A side with no prose beside it is not judged at all — that is what keeps
 * every link that is the whole of its own line out of the results, without a
 * list of elements to skip. Nor is a side flush against punctuation the link
 * may legitimately touch, or one where a space already renders.
 *
 * The *whether* here is `punctuation.ts`'s, condition for condition, including
 * the two it deliberately declines: `</a> .` and `( <a>` are a space beside a
 * mark, and the spacing rule already reports those. One fault, one finding, and
 * the two readings of this rule cannot disagree about which sentences have one.
 * The *which* is finer — the source rule proposes a correction and does not care
 * whether the missing space was absent or smuggled, and a browser cannot see
 * the difference at all until you ask what is underlined.
 */
export function linkGapFaults(gap: LinkGap): LinkGapFault[] {
  const faults: LinkGapFault[] = [];
  const { before, text, after } = gap;

  if (/\S/.test(before) && !/\s$/.test(before) && !FLUSH_BEFORE.test(before)) {
    faults.push(/^\s/.test(text) ? 'smuggled-before' : 'run-into-before');
  }

  if (/\S/.test(after)) {
    const outer = /^\s/.test(after);
    const inner = /\s$/.test(text);
    // With a space outside as well, the inner one is still the one that wins
    // the collapse, so it underlines; with none, anything but flush punctuation
    // is a word the link has run into.
    if (outer ? inner : !FLUSH_AFTER.test(after)) {
      faults.push(inner ? 'smuggled-after' : 'run-into-after');
    }
  }

  return faults;
}
