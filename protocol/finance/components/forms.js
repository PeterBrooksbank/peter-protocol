// finance/components/forms.js — shared modal and field utilities

import { esc, overlay as baseOverlay } from './ui.js';

const cls = 'w-full border border-warm-light rounded px-3 py-2 bg-paper text-ink text-sm focus:outline-none focus:ring-1 focus:ring-warm';

export const textInput   = (name, val = '', ph = '', attrs = '') =>
  `<input name="${name}" type="text" value="${esc(val)}" placeholder="${ph}" ${attrs} class="${cls}">`;

export const numberInput = (name, val = '', ph = '', attrs = '') =>
  `<input name="${name}" type="number" step="any" value="${esc(String(val))}" placeholder="${ph}" ${attrs} class="${cls}">`;

export const monthInput  = (name, val = '', attrs = '') =>
  `<input name="${name}" type="month" value="${esc(val)}" ${attrs} class="${cls}">`;

export const checkbox = (name, checked, label) =>
  `<label class="flex items-center gap-2 text-sm cursor-pointer">
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
     <label class="block text-xs font-medium text-stone uppercase tracking-wide mb-1">${label}</label>
     ${inputHtml}
     ${hint ? `<p class="text-xs text-stone mt-1">${hint}</p>` : ''}
   </div>`;

export const twoCol = (a, b) =>
  `<div class="grid grid-cols-2 gap-3">${a}${b}</div>`;

/** Open a modal overlay. Returns { overlay, close }. */
export function modal({ title, bodyHtml, onMount, onSubmit, submitLabel = 'Save' }) {
  const footerHtml = `
      <div class="flex justify-end gap-3 px-6 py-4 border-t border-warm-light">
        <button data-act="cancel" class="px-4 py-2 text-sm text-stone hover:text-ink">Cancel</button>
        <button data-act="submit" class="px-5 py-2 text-sm bg-ink text-paper rounded hover:bg-stone transition-colors">
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
          errEl.className = 'mt-3 text-sm text-signal';
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

