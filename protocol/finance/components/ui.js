// finance/components/ui.js — shared low-level UI primitives (escaping, overlay
// chrome, loading/error states, text-action buttons) used across finance views.

/** Escape HTML entities in values. Single source of truth — do not duplicate. */
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Standard "loading…" placeholder shown while a view's data is being fetched. */
export function loadingState(label = '') {
  return `<div class="animate-pulse p-4 text-sm text-stone">Loading${label ? ' ' + label : ''}…</div>`;
}

/** Standard error placeholder shown when a view's load/action fails. */
export function errorState(err) {
  return `<div class="p-4 text-sm text-signal">${esc(err?.message ?? err)}</div>`;
}

/**
 * Base overlay chrome shared by all modal-style dialogs: backdrop, centred
 * panel, header with title + close button, and a body mount point. Callers
 * own everything below the header (footer buttons, extra sections, etc).
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.maxWidth='max-w-lg']  Tailwind max-width class for the panel
 * @param {string} [opts.headerExtra='']       Extra markup placed in the header, before the close button
 * @param {string} [opts.bodyHtml='']          Initial body markup
 * @param {string} [opts.bodyClass='px-6 py-5']
 * @returns {{ overlay: HTMLElement, header: HTMLElement, body: HTMLElement, close: () => void }}
 */
export function overlay({ title, maxWidth = 'max-w-lg', headerExtra = '', bodyHtml = '', bodyClass = 'px-6 py-5' } = {}) {
  const el = document.createElement('div');
  el.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto';
  el.innerHTML = `
    <div class="w-full rounded-lg bg-paper shadow-2xl ${maxWidth} my-auto">
      <div class="sticky top-0 z-10 flex items-center justify-between border-b border-warm-light bg-paper px-6 py-4" data-header>
        <h2 class="font-display text-xl text-ink" data-title>${title ?? ''}</h2>
        <div class="flex items-center gap-3">
          ${headerExtra}
          <button data-act="close" class="text-xl leading-none text-stone hover:text-ink">&times;</button>
        </div>
      </div>
      <div class="${bodyClass}" data-body>${bodyHtml}</div>
    </div>`;

  const close = () => el.remove();
  el.querySelector('[data-act="close"]').onclick = close;
  document.body.appendChild(el);

  return {
    overlay: el,
    header: el.querySelector('[data-header]'),
    body: el.querySelector('[data-body]'),
    close,
  };
}

/**
 * A small underlined text-action button, e.g. "+ Add", "Edit", "Configure".
 * Pass `data` as an object of data-* attributes used for event delegation.
 *
 * @param {string} label
 * @param {object} [opts]
 * @param {object} [opts.data={}]      e.g. { act: 'edit', id: row.id }
 * @param {'xs'|'sm'} [opts.size='xs']
 * @param {'stone'|'warm'} [opts.tone='stone']
 * @param {string} [opts.class='']     Extra classes merged onto the button (call-site spacing/overrides)
 */
export function actionLink(label, { data = {}, size = 'xs', tone = 'stone', class: extra = '' } = {}) {
  const attrs = Object.entries(data)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(' ');
  const sizeCls = size === 'sm' ? 'text-sm' : 'text-xs';
  const toneCls = tone === 'warm' ? 'text-warm' : 'text-stone';
  return `<button ${attrs} class="${sizeCls} ${toneCls} underline hover:text-ink ${extra}">${label}</button>`;
}
