// finance/components/forms.js — shared modal and field utilities

import { esc, overlay as baseOverlay } from './ui.js';

const cls = 'w-full border border-ink/12 rounded-[3px] px-3 py-2 bg-paper text-ink text-sm focus:outline-none focus:ring-1 focus:ring-warm';

export const textInput   = (name, val = '', ph = '', attrs = '') =>
  `<input name="${name}" type="text" value="${esc(val)}" placeholder="${ph}" ${attrs} class="${cls}">`;

export const numberInput = (name, val = '', ph = '', attrs = '') =>
  `<input name="${name}" type="number" step="any" value="${esc(String(val))}" placeholder="${ph}" ${attrs} class="${cls}">`;

export const monthInput  = (name, val = '', attrs = '') =>
  `<input name="${name}" type="month" value="${esc(val)}" ${attrs} class="${cls}">`;

export const checkbox = (name, checked, label) =>
  `<label class="flex h-lh cursor-pointer items-center gap-2 text-base sm:text-sm">
     <span class="group inline-grid size-5 shrink-0 grid-cols-1 sm:size-4">
       <input name="${name}" type="checkbox" ${checked ? 'checked' : ''}
         class="checked:border-warm checked:bg-warm focus-visible:outline-warm col-start-1 row-start-1 appearance-none rounded-sm border border-ink/25 bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 disabled:border-ink/12 disabled:bg-ink/5 disabled:checked:bg-ink/5 forced-colors:appearance-auto">
       <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-7/8 self-center justify-self-center stroke-white group-has-disabled:stroke-ink/25">
         <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-not-has-checked:opacity-0"/>
       </svg>
     </span>
     ${label}
   </label>`;

export const select = (name, options, val = '', attrs = '') => {
  const opts = options.map(([v, l]) =>
    `<option value="${esc(v)}" ${v === String(val) ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `
    <span class="grid grid-cols-[1fr_--spacing(8)] items-center">
      <select name="${name}" ${attrs} class="${cls} col-span-full row-start-1 appearance-none pr-8">${opts}</select>
      <svg viewBox="0 0 8 5" width="8" height="5" fill="none" class="pointer-events-none col-start-2 row-start-1 mr-3 place-self-center stroke-stone">
        <path d="M.5.5 4 4 7.5.5" stroke="currentcolor"/>
      </svg>
    </span>`;
};

/** Auto-associate a <label> with its input/select via the `name` attribute
 *  already present in `inputHtml` — avoids threading an explicit id through
 *  every call site. */
export const field = (label, inputHtml, hint = '') => {
  const m = inputHtml.match(/name="([^"]+)"/);
  const id = m ? m[1] : null;
  const hasId = id && new RegExp(`id="${id}"`).test(inputHtml);
  const withId = id && !hasId
    ? inputHtml.replace(/(<(?:input|select|textarea)\b)/, `$1 id="${id}"`)
    : inputHtml;
  return `<div class="mb-4">
     <label ${id ? `for="${id}"` : ''} class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">${label}</label>
     ${withId}
     ${hint ? `<p class="mt-1 text-sm text-stone">${hint}</p>` : ''}
   </div>`;
};

export const twoCol = (a, b) =>
  `<div class="grid grid-cols-2 gap-3">${a}${b}</div>`;

/** Open a modal overlay. Returns { overlay, close }. */
export function modal({ title, bodyHtml, onMount, onSubmit, submitLabel = 'Save' }) {
  const footerHtml = `
      <div class="flex justify-end gap-3 border-t border-ink/12 px-6 py-4">
        <button type="button" data-act="cancel" class="cursor-pointer px-4 py-2 font-mono text-sm tracking-[0.1em] text-stone uppercase hover:text-ink">Cancel</button>
        <button type="button" data-act="submit" class="cursor-pointer rounded-[3px] bg-ink px-4 py-2 font-mono text-sm tracking-[0.1em] text-paper uppercase hover:opacity-80">
          ${submitLabel}
        </button>
      </div>`;

  const { overlay, close } = baseOverlay({
    title,
    bodyClass: '',
    bodyHtml: `<div class="px-6 py-5" data-form-body>${bodyHtml ?? ''}</div>${footerHtml}`,
  });
  const body = overlay.querySelector('[data-form-body]');
  overlay.querySelector('[data-act="cancel"]').onclick = close;

  const btn = overlay.querySelector('[data-act="submit"]');
  if (onSubmit) {
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await onSubmit(overlay, close);
      } catch (err) {
        let errEl = overlay.querySelector('[data-error]');
        if (!errEl) {
          errEl = Object.assign(document.createElement('p'), { dataset: { error: '' } });
          errEl.className = 'mt-3 font-mono text-sm text-signal';
          body.appendChild(errEl);
        }
        errEl.textContent = err.message;
        btn.disabled = false; btn.textContent = submitLabel;
      }
    };
  }

  if (onMount) onMount(overlay, close);
  return { overlay, close };
}

/** Read a named form value from inside an overlay. */
export const val  = (overlay, name) => overlay.querySelector(`[name="${name}"]`)?.value?.trim() ?? '';
export const num  = (overlay, name) => Number(overlay.querySelector(`[name="${name}"]`)?.value ?? 0);
export const bool = (overlay, name) => !!(overlay.querySelector(`[name="${name}"]`)?.checked);

