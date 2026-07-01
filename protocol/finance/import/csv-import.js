// finance/import/csv-import.js — ESM CSV import wizard
// Pure parse functions ported from protocol/csv-import.js + new match-review UI.

import { esc, overlay as baseOverlay } from '../components/ui.js';

// ── Pure parsing functions ────────────────────────────────────────────────────

/** RFC 4180 CSV parser. Returns array of rows (each row = array of field strings). */
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, ''); // strip BOM
  const rows = []; let row = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** Parse a money string to float. Handles £1,234.56, (100), $-50, etc. */
export function parseAmount(s) {
  s = String(s ?? '').trim();
  if (s === '') return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[£$€,\s]/g, '');
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}

/** Normalise a date string to ISO YYYY-MM-DD. fmt: 'DMY' | 'MDY' | 'YMD'. */
export function normaliseDate(s, fmt) {
  s = String(s).trim();
  let y, m, d, mt;
  if (fmt === 'YMD') {
    mt = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    if (mt) [, y, m, d] = mt;
  } else {
    mt = s.match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/);
    if (mt) {
      const [, a, b, c] = mt;
      if (fmt === 'MDY') { m = a; d = b; } else { d = a; m = b; }
      y = c; if (y.length === 2) y = '20' + y;
    }
  }
  if (!y) return null;
  const mm = String(m).padStart(2,'0'), dd = String(d).padStart(2,'0');
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
  return `${y}-${mm}-${dd}`;
}

/** Apply a column mapping to parsed CSV rows. Returns { rows, errors }. */
export function buildRows(parsed, map) {
  const out = [], errors = [];
  for (let i = 1; i < parsed.length; i++) {
    const r = parsed[i];
    const date = normaliseDate(r[map.dateCol] || '', map.dateFmt);
    const description = (r[map.descCol] || '').trim();
    let amount;
    if (map.mode === 'split') {
      const pin = parseAmount(r[map.inCol] || '0'), pout = parseAmount(r[map.outCol] || '0');
      amount = (isNaN(pin) ? 0 : pin) - (isNaN(pout) ? 0 : pout);
    } else {
      const raw = (r[map.amountCol] || '').trim();
      if (raw === '') { errors.push(i + 1); continue; }
      amount = parseAmount(raw);
      if (map.flip) amount = -amount;
    }
    if (!date || isNaN(amount) || !description) { errors.push(i + 1); continue; }
    out.push({ date, description, amount });
  }
  return { rows: out, errors };
}

// ── Bank profile persistence (localStorage) ──────────────────────────────────

const STORE = 'finance-bank-profiles';
const loadProfiles = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const saveProfile  = (name, map) => { const p = loadProfiles(); p[name] = map; localStorage.setItem(STORE, JSON.stringify(p)); };

// ── Import wizard ─────────────────────────────────────────────────────────────

const cls = 'w-full border border-ink/12 rounded-[3px] px-3 py-2 bg-paper text-ink text-sm';

/**
 * Open the CSV import wizard.
 * @param {Array}    accounts   List of account objects { id, nickname }
 * @param {function} onImport   Called with { rows, account_id, bank, filename, period_month } on success
 */
export function openImportWizard(accounts, onImport) {
  if (!accounts.length) { alert('Add an account first — statements import into an account.'); return; }

  const { overlay, body, close } = baseOverlay({ title: 'Import statement' });
  const title = overlay.querySelector('[data-title]');

  let parsed = null;

  // Step 1: File picker
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.csv,text/csv';
  fileInput.onchange = () => {
    const f = fileInput.files[0]; if (!f) return;
    const rdr = new FileReader();
    rdr.onload = () => { parsed = parseCSV(rdr.result); stepMap(f.name); };
    rdr.readAsText(f);
  };

  body.innerHTML = `
    <p class="mb-4 text-sm text-stone">Choose a CSV export from your bank.</p>
    <div id="file-area"></div>`;
  const pickBtn = Object.assign(document.createElement('button'), {
    className: 'cursor-pointer rounded-[2px] bg-ink px-4 py-2 font-mono text-sm tracking-[0.1em] text-paper uppercase hover:opacity-80',
    textContent: 'Choose CSV file',
    onclick: () => fileInput.click(),
  });
  body.querySelector('#file-area').appendChild(pickBtn);

  function colOptions(sel) {
    return parsed[0].map((h, i) =>
      `<option value="${i}" ${sel === i ? 'selected' : ''}>${h || `Column ${i+1}`}</option>`
    ).join('');
  }

  // Step 2: Column mapping
  function stepMap(filename, pre = {}) {
    title.textContent = 'Configure mapping';
    const profs = loadProfiles();
    const names = Object.keys(profs);
    body.innerHTML = `
      ${names.length ? `<div class="mb-4">
        <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Saved bank profile</label>
        <select id="wiz-profile" class="${cls}">
          <option value="">— new mapping —</option>
          ${names.map(n => `<option>${n}</option>`).join('')}
        </select></div>` : ''}
      <div class="mb-4">
        <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Account</label>
        <select id="wiz-acct" class="${cls}">${accounts.map(a => `<option value="${a.id}">${a.nickname}</option>`).join('')}</select>
      </div>
      <div class="mb-4">
        <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Statement month</label>
        <input id="wiz-month" type="month" value="${new Date().toISOString().slice(0,7)}" class="${cls}">
      </div>
      <div class="mb-4">
        <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Bank name</label>
        <input id="wiz-bank" placeholder="e.g. Monzo" value="${pre.bank || ''}" class="${cls}">
      </div>
      <div class="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Date column</label>
          <select id="wiz-date" class="${cls}">${colOptions(pre.dateCol ?? 0)}</select>
        </div>
        <div>
          <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Date format</label>
          <select id="wiz-datefmt" class="${cls}">
            <option value="DMY" ${pre.dateFmt === 'DMY' || !pre.dateFmt ? 'selected' : ''}>DD/MM/YYYY</option>
            <option value="MDY" ${pre.dateFmt === 'MDY' ? 'selected' : ''}>MM/DD/YYYY</option>
            <option value="YMD" ${pre.dateFmt === 'YMD' ? 'selected' : ''}>YYYY-MM-DD</option>
          </select>
        </div>
      </div>
      <div class="mb-4">
        <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Description column</label>
        <select id="wiz-desc" class="${cls}">${colOptions(pre.descCol ?? 1)}</select>
      </div>
      <div class="mb-4">
        <label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Amount style</label>
        <select id="wiz-mode" class="${cls}">
          <option value="single" ${pre.mode !== 'split' ? 'selected' : ''}>One signed column</option>
          <option value="split"  ${pre.mode === 'split'  ? 'selected' : ''}>Separate in / out columns</option>
        </select>
      </div>
      <div id="wiz-amt-fields" class="mb-4"></div>
      <div class="flex justify-end gap-3">
        <button type="button" id="wiz-cancel" class="cursor-pointer px-4 py-2 font-mono text-sm tracking-[0.1em] text-stone uppercase hover:text-ink">Cancel</button>
        <button type="button" id="wiz-preview" class="cursor-pointer rounded-[2px] bg-ink px-4 py-2 font-mono text-sm tracking-[0.1em] text-paper uppercase hover:opacity-80">Preview</button>
      </div>`;

    const modeSel = body.querySelector('#wiz-mode');
    const amtWrap = body.querySelector('#wiz-amt-fields');
    const drawAmt = () => {
      amtWrap.innerHTML = modeSel.value === 'split'
        ? `<div class="grid grid-cols-2 gap-3">
             <div><label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Money in column</label>
               <select id="wiz-in" class="${cls}">${colOptions(pre.inCol ?? 2)}</select></div>
             <div><label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Money out column</label>
               <select id="wiz-out" class="${cls}">${colOptions(pre.outCol ?? 3)}</select></div>
           </div>`
        : `<div class="grid grid-cols-2 gap-3">
             <div><label class="mb-1 block font-mono text-sm tracking-[0.16em] text-stone uppercase">Amount column</label>
               <select id="wiz-amt" class="${cls}">${colOptions(pre.amountCol ?? 2)}</select></div>
             <div class="flex items-end pb-2">
               <label class="flex cursor-pointer items-center gap-2 text-sm">
                 <input type="checkbox" id="wiz-flip" ${pre.flip ? 'checked' : ''} class="accent-warm">
                 Flip signs (debits shown as positive)
               </label>
             </div>
           </div>`;
    };
    modeSel.onchange = drawAmt; drawAmt();

    const profSel = body.querySelector('#wiz-profile');
    if (profSel) profSel.onchange = () => { if (profSel.value) stepMap(filename, profs[profSel.value]); };

    body.querySelector('#wiz-cancel').onclick = close;
    body.querySelector('#wiz-preview').onclick = () => {
      const map = {
        dateCol:  +body.querySelector('#wiz-date').value,
        dateFmt:   body.querySelector('#wiz-datefmt').value,
        descCol:  +body.querySelector('#wiz-desc').value,
        mode:      modeSel.value,
      };
      if (map.mode === 'split') {
        map.inCol  = +body.querySelector('#wiz-in').value;
        map.outCol = +body.querySelector('#wiz-out').value;
      } else {
        map.amountCol = +body.querySelector('#wiz-amt').value;
        map.flip = body.querySelector('#wiz-flip').checked;
      }
      const account_id   = body.querySelector('#wiz-acct').value;
      const bank         = body.querySelector('#wiz-bank').value.trim();
      const period_month = body.querySelector('#wiz-month').value;
      stepPreview(filename, map, account_id, bank, period_month);
    };
  }

  // Step 3: Preview
  function stepPreview(filename, map, account_id, bank, period_month) {
    title.textContent = 'Preview';
    const { rows, errors } = buildRows(parsed, map);
    const fmt = (n) => n < 0 ? `-£${Math.abs(n).toFixed(2)}` : `£${n.toFixed(2)}`;
    body.innerHTML = `
      <p class="mb-4 text-sm text-stone">
        ${rows.length} transactions${errors.length ? ` · <span class="text-warm">${errors.length} rows skipped</span>` : ''}
      </p>
      <div class="mb-5 max-h-56 divide-y divide-ink/12 overflow-y-auto rounded-[4px] border border-ink/12 font-mono text-sm">
        ${rows.slice(0, 10).map(r => `
          <div class="flex items-center gap-3 px-3 py-1.5">
            <span class="shrink-0 text-stone">${r.date}</span>
            <span class="flex-1 truncate text-ink">${esc(r.description)}</span>
            <span class="${r.amount < 0 ? 'text-signal' : 'text-ink'} shrink-0 tabular-nums">${fmt(r.amount)}</span>
          </div>`).join('')}
        ${rows.length > 10 ? `<div class="px-3 py-1.5 text-center text-stone">+ ${rows.length - 10} more</div>` : ''}
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" id="wiz-back" class="cursor-pointer px-4 py-2 font-mono text-sm tracking-[0.1em] text-stone uppercase hover:text-ink">Back</button>
        <button type="button" id="wiz-import" class="cursor-pointer rounded-[2px] bg-ink px-4 py-2 font-mono text-sm tracking-[0.1em] text-paper uppercase hover:opacity-80" ${rows.length ? '' : 'disabled'}>
          Import ${rows.length} transactions
        </button>
      </div>`;
    body.querySelector('#wiz-back').onclick = () => stepMap(filename, { ...map, bank });
    body.querySelector('#wiz-import').onclick = async () => {
      const btn = body.querySelector('#wiz-import');
      btn.disabled = true; btn.textContent = 'Importing…';
      try {
        if (bank) saveProfile(bank, map);
        await onImport({ rows, account_id, bank, filename, period_month });
        close();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = `Import ${rows.length} transactions`;
        body.insertAdjacentHTML('beforeend', `<p class="mt-2 text-sm text-signal">${esc(err.message)}</p>`);
      }
    };
  }
}
