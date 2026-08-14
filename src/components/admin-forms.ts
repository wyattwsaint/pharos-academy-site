/**
 * The two enhancements every admin form gets, delegated from the layout (#199).
 *
 * Both are enhancements in the strict sense: with scripts off the admin submits
 * exactly as it did before this file existed. Nothing here is required for a
 * save to land, and nothing here validates — it only tells the office what the
 * browser is already doing.
 *
 * **Saves visibly save.** A save that takes a second gives no sign it heard the
 * click, so Jill clicks again and the store tells her there is already one of
 * those. On submit the pressed button is disabled and relabeled, which both
 * answers the first click and makes the second one impossible.
 *
 * **Dirty forms warn.** Twenty minutes of typing a course description should
 * not die on a stray click into the nav. The guard arms on the first real edit
 * and never before: a form merely looked at must not nag on the way out.
 *
 * Delegated at the document, not bound per form, for the reason the whole
 * polish pass exists — a per-screen copy is a copy to forget on screen 23. It
 * also means the action forms scattered through Applications get the pending
 * button for free, and the leave-warning correctly ignores them: a form whose
 * only controls are hidden fields and a button can never fire `input`.
 */

/** What a submit button says while its POST is in flight. */
const PENDING = 'Saving…';

/** Per-button override, for the forms whose verb is not "save". */
const PENDING_LABEL = 'data-pending-label';

/** Where the original label is parked so `pageshow` can put it back. */
const IDLE_LABEL = 'data-idle-label';

/** Marks the hidden input that stands in for a disabled submitter's name. */
const STANDIN = 'data-pending-standin';

/** Set on a form from its first submit, so a second one can be refused. */
const PENDING_FORM = 'data-pending';

/**
 * Whether anything on any form has been edited since the page loaded.
 *
 * One flag for the document rather than one per form: the question
 * `beforeunload` asks is about the page, and every admin screen that can be
 * edited has exactly one editor form on it.
 */
let dirty = false;

/** The first edit arms the guard. Hidden fields and buttons never fire this. */
document.addEventListener('input', (event) => {
  if (isFormControl(event.target)) dirty = true;
});

/**
 * `input` covers typing and most controls, but a `<select>` changed by keyboard
 * and a file chooser both announce themselves with `change` alone in some
 * browsers. Listening to both costs nothing: the flag is idempotent.
 */
document.addEventListener('change', (event) => {
  if (isFormControl(event.target)) dirty = true;
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  // A second submit while the first is in flight. The button is already
  // disabled, so this is only reachable by Enter in a text field or by a
  // script — but "one click, one POST" has to be true for both.
  if (form.hasAttribute(PENDING_FORM)) {
    event.preventDefault();
    return;
  }
  if (event.defaultPrevented) return;

  // The submission itself is what discards the edits' claim on the page: the
  // navigation it causes must not be the thing we warn about.
  dirty = false;
  form.setAttribute(PENDING_FORM, '');

  const submitter = pressedButton(event, form);
  if (submitter) markPending(submitter, form);
});

/**
 * Coming back with the Back button.
 *
 * A restored page is a page whose form was submitted, which means its button is
 * still disabled and still says "Saving…" about a save that finished long ago.
 * Put it back the way it was drawn.
 */
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  dirty = false;

  for (const form of document.querySelectorAll('form')) form.removeAttribute(PENDING_FORM);
  for (const standin of document.querySelectorAll(`[${STANDIN}]`)) standin.remove();
  for (const button of document.querySelectorAll<HTMLButtonElement>(`button[${IDLE_LABEL}]`)) {
    button.textContent = button.getAttribute(IDLE_LABEL) ?? button.textContent;
    button.removeAttribute(IDLE_LABEL);
    button.disabled = false;
  }
});

window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  // The browser writes the wording; ours would not be shown. Both spellings,
  // because which one a browser honours has never been agreed.
  event.preventDefault();
  event.returnValue = '';
});

/** A control whose value a person can change — not a hidden field or a button. */
function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (!target.closest('form')) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'hidden';
}

/**
 * Which button submitted the form.
 *
 * `submitter` is the answer wherever it exists; the fallback is for a submit by
 * Enter in a browser that leaves it null, where the browser's own rule — the
 * form's first submit button — is the one to copy.
 */
function pressedButton(event: SubmitEvent, form: HTMLFormElement): HTMLButtonElement | null {
  const submitter = event.submitter;
  if (submitter instanceof HTMLButtonElement) return submitter;
  if (submitter) return null;
  return form.querySelector<HTMLButtonElement>('button:not([type=button]):not([type=reset])');
}

/**
 * Disable and relabel, without dropping what the button was going to send.
 *
 * A disabled control is left out of the submission, and some of these buttons
 * *are* the submission — `name="remove" value="1"` is how the events screen
 * hears which action was asked for. So the button's pair is copied into a
 * hidden field first, and only then is the button taken out of the form's data.
 */
function markPending(button: HTMLButtonElement, form: HTMLFormElement): void {
  if (button.name) {
    const standin = document.createElement('input');
    standin.type = 'hidden';
    standin.name = button.name;
    standin.value = button.value;
    standin.setAttribute(STANDIN, '');
    form.append(standin);
  }

  const label = button.getAttribute(PENDING_LABEL) ?? PENDING;
  button.setAttribute(IDLE_LABEL, button.textContent ?? '');
  button.textContent = label;
  button.disabled = true;
}

/**
 * Both enhancements are now listening.
 *
 * The only mark this file leaves on the page, and it is here for the browser
 * suite. The script is deferred, so between first paint and this line the admin
 * is the plain server-rendered form it is with scripts off — correct, and
 * indistinguishable from a broken enhancement unless something says when the
 * enhancement went live.
 */
document.documentElement.setAttribute('data-admin-forms', '');
