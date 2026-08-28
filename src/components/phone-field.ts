/**
 * The dashes, inserted as the parent types — the site's one answer to "how does
 * a phone box behave" (#311, #312).
 *
 * Two forms ask for a number now: the inquiry and the application. This is the
 * behaviour extracted rather than copied, for the reason `PHONE_PATTERN` lives
 * once in `forms.ts` — two copies of a keystroke handler is how one form comes
 * to auto-format what the other leaves alone, and a family who met the helpful
 * box first would then meet the unhelpful one at the point of applying.
 *
 * **An enhancement and not a dependency.** With scripting off a family types
 * the dashes themselves, the server applies the identical rule on POST, and the
 * inline error says what shape is wanted. What this buys is *not having to
 * guess the format*, which is the whole reason the field auto-formats.
 *
 * Bound by attribute rather than by id, because the inquiry form renders twice
 * on the home page.
 */
import { formatPhoneAsTyped } from '../lib/forms.js';

/**
 * Bind every `input[data-phone]` under `root`.
 *
 * The caret is remapped by counting *digits* rather than characters. Editing in
 * the middle of a number is the case a naive "put the caret at the end" gets
 * wrong, and a caret that jumps is worse than no auto-format at all.
 */
export function bindPhoneFields(root: ParentNode = document): void {
  for (const field of root.querySelectorAll<HTMLInputElement>('input[data-phone]')) {
    field.addEventListener('input', () => {
      const before = field.value;
      const caret = field.selectionStart ?? before.length;
      const digitsBefore = before.slice(0, caret).replace(/\D/g, '').length;

      const formatted = formatPhoneAsTyped(before);
      if (formatted === before) return;
      field.value = formatted;

      let seen = 0;
      let position = formatted.length;
      for (let index = 0; index < formatted.length; index += 1) {
        if (/\d/.test(formatted[index]!)) seen += 1;
        if (seen === digitsBefore) {
          position = index + 1;
          break;
        }
      }
      if (digitsBefore === 0) position = 0;
      field.setSelectionRange(position, position);
    });
  }
}
