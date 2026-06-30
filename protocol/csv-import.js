// protocol/csv-import.js
(function (global) {
  const STORE = 'finance-bank-profiles';

  // --- pure parsing ---
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], field = '', i = 0, q = false;
    while (i < text.length) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
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

  function parseAmount(s) {
    s = String(s ?? '').trim();
    if (s === '') return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[£$€,\s]/g, '');
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    const n = parseFloat(s);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }

  function normaliseDate(s, fmt) {
    s = String(s).trim();
    let y, m, d, mt;
    if (fmt === 'YMD') { mt = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); if (mt) [, y, m, d] = mt; }
    else {
      mt = s.match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/);
      if (mt) { const a = mt[1], b = mt[2], c = mt[3]; if (fmt === 'MDY') { m = a; d = b; } else { d = a; m = b; } y = c; if (y.length === 2) y = '20' + y; }
    }
    if (!y) return null;
    const mm = String(m).padStart(2, '0'), dd = String(d).padStart(2, '0');
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
    return `${y}-${mm}-${dd}`;
  }

  function buildRows(parsed, map) {
    const out = [], errors = [];
    for (let i = 1; i < parsed.length; i++) {
      const r = parsed[i];
      const date = normaliseDate(r[map.dateCol] || '', map.dateFmt);
      const description = (r[map.descCol] || '').trim();
      let amount;
      if (map.mode === 'split') {
        const pin = parseAmount(r[map.inCol] || '0'), pout = parseAmount(r[map.outCol] || '0');
        amount = (isNaN(pin) ? 0 : pin) - (isNaN(pout) ? 0 : pout);   // out reduces balance
      } else {
        const raw = (r[map.amountCol] || '').trim();
        if (raw === '') { errors.push(i + 1); continue; }
        amount = parseAmount(raw); if (map.flip) amount = -amount;
      }
      if (!date || isNaN(amount) || !description) { errors.push(i + 1); continue; }
      out.push({ date, description, amount });
    }
    return { rows: out, errors };
  }

  const profiles = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const saveProfile = (name, map) => { const p = profiles(); p[name] = map; localStorage.setItem(STORE, JSON.stringify(p)); };

  // --- wizard UI ---
  function startImport(finance, accounts, onDone) {
    if (!accounts.length) { alert('Add an account first — statements import into an account.'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'fin-modal-overlay';
    overlay.innerHTML = `<div class="fin-modal"><div class="fin-modal-title">Import statement</div><div class="fin-modal-body" id="imp-body"></div></div>`;
    document.body.appendChild(overlay);
    const body = overlay.querySelector('#imp-body');
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    let parsed = null;
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.csv,text/csv';
    fileInput.onchange = () => {
      const f = fileInput.files[0]; if (!f) return;
      const rdr = new FileReader();
      rdr.onload = () => { parsed = parseCSV(rdr.result); stepMap(f.name); };
      rdr.readAsText(f);
    };
    body.innerHTML = `<p class="fin-hint">Choose a CSV export from your bank.</p>`;
    const pick = document.createElement('button'); pick.className = 'fin-btn'; pick.textContent = 'Choose file';
    pick.onclick = () => fileInput.click(); body.appendChild(pick);

    function colOptions(sel) {
      return parsed[0].map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${h || `Column ${i + 1}`}</option>`).join('');
    }

    function stepMap(filename, pre = {}) {
      const profs = profiles();
      const names = Object.keys(profs);
      body.innerHTML = `
        ${names.length ? `<label class="fin-field">Saved bank profile
          <select id="imp-profile"><option value="">— new mapping —</option>${names.map(n => `<option>${n}</option>`).join('')}</select></label>` : ''}
        <label class="fin-field">Account
          <select id="imp-acct">${accounts.map(a => `<option value="${a.id}">${a.nickname}</option>`).join('')}</select></label>
        <label class="fin-field">Bank name <input id="imp-bank" placeholder="e.g. Monzo" value="${pre.bank || ''}" /></label>
        <label class="fin-field">Date column <select id="imp-date">${colOptions(pre.dateCol)}</select></label>
        <label class="fin-field">Date format
          <select id="imp-datefmt">
            <option value="DMY" ${pre.dateFmt === 'DMY' ? 'selected' : ''}>DD/MM/YYYY</option>
            <option value="MDY" ${pre.dateFmt === 'MDY' ? 'selected' : ''}>MM/DD/YYYY</option>
            <option value="YMD" ${pre.dateFmt === 'YMD' ? 'selected' : ''}>YYYY-MM-DD</option>
          </select></label>
        <label class="fin-field">Description column <select id="imp-desc">${colOptions(pre.descCol)}</select></label>
        <label class="fin-field">Amount style
          <select id="imp-mode">
            <option value="single" ${pre.mode !== 'split' ? 'selected' : ''}>One signed column</option>
            <option value="split" ${pre.mode === 'split' ? 'selected' : ''}>Separate in / out columns</option>
          </select></label>
        <div id="imp-amount-fields"></div>
        <div class="fin-modal-actions">
          <button class="fin-btn-ghost" id="imp-cancel">Cancel</button>
          <button class="fin-btn" id="imp-preview">Preview</button>
        </div>`;
      const modeSel = body.querySelector('#imp-mode');
      const amtWrap = body.querySelector('#imp-amount-fields');
      const drawAmt = () => {
        amtWrap.innerHTML = modeSel.value === 'split'
          ? `<label class="fin-field">Money in column <select id="imp-in">${colOptions(pre.inCol)}</select></label>
             <label class="fin-field">Money out column <select id="imp-out">${colOptions(pre.outCol)}</select></label>`
          : `<label class="fin-field">Amount column <select id="imp-amt">${colOptions(pre.amountCol)}</select></label>
             <label class="fin-field fin-check"><input type="checkbox" id="imp-flip" ${pre.flip ? 'checked' : ''}/> My bank lists debits as positive (flip signs)</label>`;
      };
      modeSel.onchange = drawAmt; drawAmt();

      const profSel = body.querySelector('#imp-profile');
      if (profSel) profSel.onchange = () => { if (profSel.value) stepMap(filename, profs[profSel.value]); };

      body.querySelector('#imp-cancel').onclick = close;
      body.querySelector('#imp-preview').onclick = () => {
        const map = {
          dateCol: +body.querySelector('#imp-date').value,
          dateFmt: body.querySelector('#imp-datefmt').value,
          descCol: +body.querySelector('#imp-desc').value,
          mode: modeSel.value,
        };
        if (map.mode === 'split') { map.inCol = +body.querySelector('#imp-in').value; map.outCol = +body.querySelector('#imp-out').value; }
        else { map.amountCol = +body.querySelector('#imp-amt').value; map.flip = body.querySelector('#imp-flip').checked; }
        const account_id = body.querySelector('#imp-acct').value;
        const bank = body.querySelector('#imp-bank').value.trim();
        stepPreview(filename, map, account_id, bank);
      };
    }

    function stepPreview(filename, map, account_id, bank) {
      const { rows, errors } = buildRows(parsed, map);
      body.innerHTML = `
        <p class="fin-hint">${rows.length} transactions parsed${errors.length ? ` · ${errors.length} rows skipped (unreadable)` : ''}.</p>
        <div class="imp-preview">
          ${rows.slice(0, 8).map(r => `<div class="imp-prow"><span>${r.date}</span><span class="imp-pdesc">${r.description}</span><span class="${r.amount < 0 ? 'neg' : ''}">${r.amount.toFixed(2)}</span></div>`).join('')}
          ${rows.length > 8 ? `<div class="imp-more">+ ${rows.length - 8} more</div>` : ''}
        </div>
        <div class="fin-modal-actions">
          <button class="fin-btn-ghost" id="imp-back">Back</button>
          <button class="fin-btn" id="imp-go" ${rows.length ? '' : 'disabled'}>Import ${rows.length}</button>
        </div>`;
      body.querySelector('#imp-back').onclick = () => stepMap(filename, { ...map, bank });
      body.querySelector('#imp-go').onclick = async () => {
        const go = body.querySelector('#imp-go'); go.disabled = true; go.textContent = 'Importing…';
        try {
          const res = await finance.api('/transactions/import', {
            method: 'POST', body: JSON.stringify({ account_id, bank, filename, rows }),
          });
          if (bank) saveProfile(bank, map);   // remember this bank's layout
          stepResult(res);
        } catch (e) { go.disabled = false; go.textContent = 'Import'; alert('Import failed: ' + e.message); }
      };
    }

    function stepResult(res) {
      body.innerHTML = `
        <div class="imp-result">
          <div class="imp-result-big">${res.imported}</div>
          <div class="fin-hint">imported${res.skipped ? ` · ${res.skipped} already present (duplicates skipped)` : ''}</div>
          <p class="fin-hint">Transactions are filed by their own date — switch months to find any from earlier periods.</p>
        </div>
        <div class="fin-modal-actions"><button class="fin-btn" id="imp-done">Done</button></div>`;
      body.querySelector('#imp-done').onclick = () => { close(); onDone?.(); };
    }
  }

  global.createCsvImport = function () { return { startImport, parseCSV, buildRows, parseAmount, normaliseDate }; };
})(window);