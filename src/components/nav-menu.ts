/**
 * `<nav-menu>` — the header's navigation on a phone (#139).
 *
 * Below 860px `.site-nav` is `display: none`, and until this element there was
 * nothing behind it: the majority of visitors had a header with a wordmark, one
 * call to action, and no route to About, Classes, Admissions or Current
 * Families except the footer.
 *
 * The contract:
 *
 *   - a real `<button>` toggles the panel, so Enter and Space are free
 *   - `aria-expanded` on that button is the state, and it is the only state a
 *     screen reader is given
 *   - Escape closes and returns focus to the toggle
 *   - Tab and Shift+Tab cycle within the toggle and the panel's links
 *   - the page behind cannot scroll while it is open
 *   - choosing a destination closes it
 *
 * Two of those are less obvious than they read.
 *
 * **The panel carries the `hidden` attribute, not just a CSS rule.** A panel
 * hidden by CSS alone is still in the accessibility tree for anything that
 * ignores the stylesheet, and its links are still tabbable — which is how a
 * keyboard visitor on a desktop ends up tabbing through a second copy of the
 * nav that nobody can see. `hidden` also keeps Playwright's role queries (and
 * the desktop specs that use them) from matching two "Current Families" links.
 *
 * **Widening the window closes it.** The toggle is `display: none` above the
 * breakpoint, so a menu left open through a rotate or a desktop resize would
 * leave the scroll lock on with nothing on screen able to release it.
 */

const TOGGLE = '[data-nav-menu-toggle]';
const PANEL = '[data-nav-menu-panel]';

/** Matches the `max-width` the header's nav is hidden below in `beacon.css`. */
const SMALL = '(max-width: 860px)';

/** Set on `<html>` while the menu is open; `beacon.css` locks the scroll from it. */
const LOCK = 'nav-menu-open';

export class NavMenu extends HTMLElement {
  #toggle: HTMLButtonElement | null = null;
  #panel: HTMLElement | null = null;
  #small = matchMedia(SMALL);

  #onDocumentKeydown = (event: KeyboardEvent) => {
    if (!this.#open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss();
      return;
    }
    if (event.key === 'Tab') this.#trap(event);
  };

  #onViewportChange = () => {
    if (!this.#small.matches) this.close();
  };

  connectedCallback() {
    this.#toggle = this.querySelector<HTMLButtonElement>(TOGGLE);
    this.#panel = this.querySelector<HTMLElement>(PANEL);
    if (!this.#toggle || !this.#panel) return;

    this.#toggle.addEventListener('click', () => {
      if (this.#open) this.dismiss();
      else this.open();
    });

    // Delegated rather than bound per link: the panel's contents are server
    // rendered and never change, but a handler per link is a handler to forget
    // when one is added.
    this.#panel.addEventListener('click', (event) => {
      const target = event.target;
      // `close`, not `dismiss`: the browser is already moving focus with the
      // navigation, and pulling it back to the toggle would fight that.
      if (target instanceof Element && target.closest('a')) this.close();
    });

    document.addEventListener('keydown', this.#onDocumentKeydown);
    this.#small.addEventListener('change', this.#onViewportChange);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onDocumentKeydown);
    this.#small.removeEventListener('change', this.#onViewportChange);
    // Leaving the lock behind would freeze a page that no longer has a menu.
    document.documentElement.classList.remove(LOCK);
  }

  get #open(): boolean {
    return this.#toggle?.getAttribute('aria-expanded') === 'true';
  }

  open() {
    if (!this.#toggle || !this.#panel) return;
    this.#toggle.setAttribute('aria-expanded', 'true');
    this.#panel.hidden = false;
    document.documentElement.classList.add(LOCK);
  }

  /** Shut the panel and leave focus where it is. */
  close() {
    if (!this.#toggle || !this.#panel) return;
    this.#toggle.setAttribute('aria-expanded', 'false');
    this.#panel.hidden = true;
    document.documentElement.classList.remove(LOCK);
  }

  /**
   * Shut it the way a visitor does — Escape, or the toggle again — and put
   * focus back on the toggle, which is the control they were last on and the
   * only one still on screen.
   */
  dismiss() {
    this.close();
    this.#toggle?.focus();
  }

  /** The toggle plus the panel's links, in the order Tab would visit them. */
  #focusable(): HTMLElement[] {
    const links = [...(this.#panel?.querySelectorAll<HTMLElement>('a[href]') ?? [])];
    return this.#toggle ? [this.#toggle, ...links] : links;
  }

  #trap(event: KeyboardEvent) {
    const stops = this.#focusable();
    if (stops.length === 0) return;

    const active = document.activeElement;
    const index = stops.findIndex((stop) => stop === active);
    // Focus somewhere else entirely — the address bar, or a click on the page
    // behind. Pull it back to the first stop rather than letting Tab walk on.
    if (index === -1) {
      event.preventDefault();
      stops[0].focus();
      return;
    }

    const last = stops.length - 1;
    if (event.shiftKey && index === 0) {
      event.preventDefault();
      stops[last].focus();
    } else if (!event.shiftKey && index === last) {
      event.preventDefault();
      stops[0].focus();
    }
  }
}

if (!customElements.get('nav-menu')) {
  customElements.define('nav-menu', NavMenu);
}
