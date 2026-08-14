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
const SAVING = 'Saving…';

/** Per-button override, for the forms whose verb is not "save". */
const PENDING_LABEL = 'data-pending-label';

/** Where the original label is parked so `pageshow` can put it back. */
const IDLE_LABEL = 'data-idle-label';

/** Marks the hidden input that stands in for a disabled submitter's name. */
const STANDIN = 'data-pending-standin';

/** Set on a form from its first submit, so a second one can be refused. */
const PENDING_FORM = 'data-pending';

/**
 * The forms carrying edits nobody has saved yet.
 *
 * A set rather than one flag for the page, because a screen can hold more than
 * one form — Users has a row of them — and saving one of those is not a promise
 * about what was typed into another. Emptied a form at a time: the guard warns
 * while anything on the screen is still unsaved, and stops when nothing is.
 */
const unsaved = new Set<HTMLFormElement>();

/**
 * The first edit arms the guard, and nothing before it does: hidden fields and
 * buttons fire neither of these events, which is what keeps the action forms —
 * a hidden id, a hidden verb, a button — out of the set for good.
 *
 * Both events, because `input` covers typing and most controls but a `<select>`
 * driven by the keyboard and a file chooser announce themselves with `change`
 * alone in some browsers. Listening to both costs nothing: a set ignores a
 * second helping of the same form.
 */
for (const kind of ['input', 'change'] as const) {
  document.addEventListener(kind, (event) => {
    const form = editedForm(event.target);
    if (form) unsaved.add(form);
  });
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  // A second submit while the first is in flight. The button is already
  // disabled, so this is only reachable by Enter in a text field or by a
  // script — but "one click, one POST" has to be true for both.
  //
  // The mark is cleared by leaving the page, which is what a submission does.
  // A submission the office *stops* — Escape, or the browser's stop button —
  // leaves the form marked and needs a reload, and that is the trade this
  // takes deliberately: a save the school has to reload for is recoverable,
  // and the duplicate row it would otherwise create is not.
  if (form.hasAttribute(PENDING_FORM)) {
    event.preventDefault();
    return;
  }
  if (event.defaultPrevented) return;

  // Saving this form is what settles this form: the navigation the submission
  // causes must not be the thing the guard warns about. Anything typed into
  // another form on the screen is still unsaved, and still worth a warning.
  unsaved.delete(form);

  /*
   * And if something else on the screen *is* still unsaved, this submission is
   * about to be questioned — the guard below warns, and the office may answer
   * "stay", which cancels the navigation and the POST with it. A button
   * disabled and relabeled for a save that was then called off would be a lie
   * only a reload could clear, so this submission is left exactly as it is
   * with scripts off: not marked, not relabeled, not refused a second time.
   *
   * It costs the enhancement on a rare submit — one made from a screen with
   * unsaved typing in another of its forms — and it is the answer the file's
   * own rule gives: the enhancement may do nothing, and may never lie.
   */
  if (unsaved.size > 0) return;

  form.setAttribute(PENDING_FORM, '');

  const submitter = pressedButton(event, form);
  if (submitter) markPending(submitter, form);
});

/**
 * Coming back with the Back button.
 *
 * A restored page is one that was navigated away from, which for these forms
 * means submitted: its button is still disabled and still says "Saving…" about
 * a save that finished long ago. Put it back the way it was drawn.
 *
 * What is deliberately *not* touched is `unsaved`. A restored page comes back
 * with its typing intact and its script's own memory intact with it, so the
 * form the office was halfway through is still the form the office was halfway
 * through — clearing the set here would throw the warning away at exactly the
 * moment the edits came back.
 */
window.addEventListener('pageshow', (event) => {
  if (event.persisted) releasePending();
});

window.addEventListener('beforeunload', (event) => {
  if (unsaved.size === 0) return;

  // The browser writes the wording; ours would not be shown. Both spellings,
  // because which one a browser honours has never been agreed.
  event.preventDefault();
  event.returnValue = '';
});

/** Every pending button back to the button it was drawn as. */
function releasePending(): void {
  for (const form of document.querySelectorAll('form')) form.removeAttribute(PENDING_FORM);
  for (const standin of document.querySelectorAll(`[${STANDIN}]`)) standin.remove();
  for (const button of document.querySelectorAll<HTMLButtonElement>(`button[${IDLE_LABEL}]`)) {
    button.textContent = button.getAttribute(IDLE_LABEL) ?? button.textContent;
    button.removeAttribute(IDLE_LABEL);
    button.disabled = false;
  }
}

/**
 * The form an edit happened in, if the thing edited was a control a person can
 * change — not a hidden field, and not a button.
 */
function editedForm(target: EventTarget | null): HTMLFormElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const editable =
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && target.type !== 'hidden');
  return editable ? target.closest('form') : null;
}

/**
 * Which button submitted the form.
 *
 * `submitter` is the answer wherever it exists; the fallback is for a submit by
 * Enter in a browser that leaves it null, where the browser's own rule — the
 * form's first submit button — is the one to copy.
 *
 * A submitter that is not a `<button>` gets no pending state rather than a
 * wrong one: `<input type="submit">` carries its label in `value`, not in its
 * text, and the admin renders every one of its buttons through `AdminButton`.
 * The day one does not, this returns null and the form behaves as it does with
 * scripts off — which is the failure this whole file is allowed to have.
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

  const label = button.getAttribute(PENDING_LABEL) ?? SAVING;
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
