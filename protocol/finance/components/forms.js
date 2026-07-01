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
  `<label class="flex cursor-pointer items-center gap-2 text-sm">
     <input name="${name}" type="checkbox" ${checked ? 'checked' : ''} class="accent-warm">
     ${label}
   </label>`;

export const select = (name, options, val = '', attrs = '') => {
  const opts = options.map(([v, l]) =>
    `<option value="${esc(v)}" ${v === String(val) ? 'selected' : ''}>${l}</option>`
  ).join('');
  return `<select name="${name}" ${attrs} class="${cls}">${opts}</select>`;
};

export const field = (label, inputHtml, hint = '') =>
  `<div class="mb-4">
     <label class="mb-1 block font-mono text-[0.58rem] tracking-[0.2em] text-stone uppercase">${label}</label>
     ${inputHtml}
     ${hint ? `<p class="mt-1 text-xs text-stone">${hint}</p>` : ''}
   </div>`;

export const twoCol = (a, b) =>
  `<div class="grid grid-cols-2 gap-3">${a}${b}</div>`;

/** Open a modal overlay. Returns { overlay, close }. */
export function modal({ title, bodyHtml, onMount, onSubmit, submitLabel = 'Save' }) {
  const footerHtml = `
      <div class="flex justify-end gap-3 border-t border-ink/12 px-6 py-4">
        <button data-act="cancel" class="cursor-pointer px-4 py-2 font-mono text-[0.6rem] tracking-[0.15em] text-stone uppercase hover:text-ink">Cancel</button>
        <button data-act="submit" class="cursor-pointer rounded-[2px] bg-ink px-5 py-2.5 font-mono text-[0.62rem] tracking-[0.15em] text-paper uppercase hover:opacity-80">
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
          errEl.className = 'mt-3 font-mono text-xs text-signal';
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

