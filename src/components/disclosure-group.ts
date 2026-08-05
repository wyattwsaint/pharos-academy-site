/**
 * `<disclosure-group>` — the page's one answer to "how does a panel open".
 *
 * #21 AC 6 exists because the prototype had two: the class descriptions and
 * the H.O.P.E. row were near-identical IIFEs, and two behaviours that are
 * *almost* the same on one page is how a client finds the inconsistent one.
 * Both surfaces now instantiate this element, so they cannot drift.
 *
 * The contract, unchanged from the prototype:
 *
 *   - hover opens
 *   - click or tap *sticks* it open
 *   - Escape, or a click outside the group, closes
 *   - the trigger is a real focusable control, and focus opens too
 *   - one panel open at a time
 *
 * `stuck` is the load-bearing part. Without it a mouse user gets the panel on
 * hover and their click — which is how anyone would expect to *open* it —
 * reads as a second toggle and shuts the panel they meant to open.
 *
 * Markup contract (attributes, not classes, so styling stays free):
 *
 *   <disclosure-group data-disclosure-group="hope">
 *     <div data-disclosure-cell>
 *       <button data-disclosure-trigger aria-expanded="false" aria-controls="x">…</button>
 *       <div data-disclosure-panel id="x">…</div>
 *     </div>
 *   </disclosure-group>
 *
 * The open cell carries `data-open`; CSS reveals the panel from that. Nothing
 * here sets inline styles, because the two surfaces reveal their panels
 * differently — one expands inside its cell, one floats over the band — and
 * that is a layout decision, not a behavioural one.
 */

const CELL = '[data-disclosure-cell]';
const TRIGGER = '[data-disclosure-trigger]';

export class DisclosureGroup extends HTMLElement {
  /** The cell currently showing its panel, if any. */
  #open: HTMLElement | null = null;

  /** Whether that cell was opened on purpose rather than merely hovered. */
  #stuck = false;

  #onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.#close();
  };

  #onDocumentPointerdown = (event: Event) => {
    // Only a stuck panel survives long enough for an outside click to matter;
    // a hovered one has already closed by the time the pointer is elsewhere.
    if (!this.#stuck) return;
    const target = event.target;
    if (target instanceof Node && this.contains(target)) return;
    this.#close();
  };

  connectedCallback() {
    for (const cell of this.#cells()) {
      const trigger = cell.querySelector<HTMLElement>(TRIGGER);
      if (!trigger) continue;

      cell.addEventListener('mouseenter', () => {
        if (!this.#stuck) this.#show(cell, false);
      });
      cell.addEventListener('mouseleave', () => {
        if (this.#open === cell && !this.#stuck) this.#close();
      });

      trigger.addEventListener('focus', () => {
        if (!this.#stuck) this.#show(cell, false);
      });
      // `focusout` on the cell rather than `blur` on the trigger, because a
      // panel may itself hold a link — the class descriptions on `/classes`
      // each carry one to that class's own page. Closing on the trigger's blur
      // would hide that link at the exact moment Tab reached it, and focus
      // would fall on the floor. Focus leaving the *cell* is the real signal.
      cell.addEventListener('focusout', (event) => {
        const next = (event as FocusEvent).relatedTarget;
        if (next instanceof Node && cell.contains(next)) return;
        if (this.#open === cell && !this.#stuck) this.#close();
      });

      trigger.addEventListener('click', () => {
        if (this.#open === cell && this.#stuck) this.#close();
        else this.#show(cell, true);
      });
    }

    document.addEventListener('keydown', this.#onDocumentKeydown);
    // `click`, not `pointerdown`: a pointerdown on the trigger itself would
    // race the trigger's own click handler and close what it just opened.
    document.addEventListener('click', this.#onDocumentPointerdown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onDocumentKeydown);
    document.removeEventListener('click', this.#onDocumentPointerdown);
  }

  #cells(): HTMLElement[] {
    // Direct descendants only: nesting a group inside a group is not a thing
    // this page does, and a broad query would let one steal the other's cells.
    return [...this.querySelectorAll<HTMLElement>(CELL)].filter(
      (cell) => cell.closest('disclosure-group') === this,
    );
  }

  #show(cell: HTMLElement, stuck: boolean) {
    if (this.#open !== cell) this.#close();
    cell.dataset.open = '';
    cell.querySelector(TRIGGER)?.setAttribute('aria-expanded', 'true');
    this.#open = cell;
    this.#stuck = stuck;
  }

  #close() {
    if (this.#open) {
      delete this.#open.dataset.open;
      this.#open.querySelector(TRIGGER)?.setAttribute('aria-expanded', 'false');
      this.#open = null;
    }
    this.#stuck = false;
  }
}

if (!customElements.get('disclosure-group')) {
  customElements.define('disclosure-group', DisclosureGroup);
}
