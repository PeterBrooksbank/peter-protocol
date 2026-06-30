// protocol/finance-transactions.js
(function (global) {
  const gbp = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(n ?? 0);
  const pad = n => String(n).padStart(2, '0');
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const shift = (ym, dx) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + dx, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const label = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

  global.createFinanceTransactions = function (finance) {
    let el, month = curMonth(), txns = [], cats = [];

    async function draw() {
      el.innerHTML = '<div class="fin-loading">Loading…</div>';
      try {
        [txns, cats] = await Promise.all([finance.api(`/transactions?month=${month}`), finance.api('/categories')]);
        render();
      } catch (e) { el.innerHTML = `<div class="fin-error">Couldn't load transactions: ${e.message}</div>`; }
    }

    function render() {
      const uncat = txns.filter(t => !t.category_id).length;
      el.innerHTML = `
        <div class="flex items-center justify-center gap-[18px] mb-5">
          <button class="bg-transparent border border-ink/12 rounded-[4px] size-8 text-base text-ink cursor-pointer" data-nav="prev">‹</button>
          <span class="font-display text-[1.3rem] font-light min-w-[150px] text-center">${label(month)}</span>
          <button class="bg-transparent border border-ink/12 rounded-[4px] size-8 text-base text-ink cursor-pointer" data-nav="next">›</button>
        </div>
        <div class="flex justify-between items-center mb-3.5">
          <span class="text-[0.58rem] tracking-[0.1em] uppercase text-stone">${txns.length} txns${uncat ? ` · ${uncat} uncategorised` : ''}</span>
          <button class="bg-warm text-white border-0 rounded-[4px] px-[14px] py-2 font-mono text-[0.6rem] tracking-[0.1em] cursor-pointer" data-act="import">Import CSV</button>
        </div>
        ${txns.length ? txns.map(t => `
          <div class="flex justify-between items-center gap-3 bg-white rounded-[4px] px-[13px] py-[11px] mb-1.5 cursor-pointer border border-ink/12${t.category_id ? '' : ' border-l-[3px] border-l-warm'}" data-id="${t.id}">
            <div>
              <div class="text-[0.78rem]">${t.description}</div>
              <div class="text-[0.56rem] text-stone mt-[3px]">${t.date}${t.category_name ? ` · <span class="text-ink">${t.category_name}</span>` : ' · <span class="text-warm">Uncategorised</span>'}</div>
            </div>
            <div class="font-mono text-[0.8rem] whitespace-nowrap tabular-nums ${t.amount < 0 ? 'text-signal-light' : ''}">${gbp(t.amount)}</div>
          </div>`).join('') : '<div class="fin-empty">No transactions this month. Import a statement to get started.</div>'}`;

      el.querySelector('[data-nav="prev"]').onclick = () => { month = shift(month, -1); draw(); };
      el.querySelector('[data-nav="next"]').onclick = () => { month = shift(month, 1); draw(); };
      el.querySelector('[data-act="import"]').onclick = async () => {
        const accounts = await finance.api('/accounts');
        createCsvImport().startImport(finance, accounts, draw);
      };
      el.querySelectorAll('[data-id]').forEach(row =>
        row.onclick = () => categorise(txns.find(t => t.id === row.dataset.id)));
    }

    function categorise(txn) {
      const matches = txns.filter(t => !t.category_id && norm(t.description) === norm(txn.description));
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-[rgba(40,35,30,0.4)] flex items-end justify-center z-[1000]';
      overlay.innerHTML = `
        <div class="bg-paper w-full max-w-[440px] rounded-t-[12px] px-5 pt-6 pb-7">
          <div class="font-display text-[1.4rem] font-light mb-[18px]">Categorise</div>
          <p class="text-[0.66rem] text-stone leading-[1.5] mb-3">${txn.description} · ${gbp(txn.amount)}</p>
          <div class="grid grid-cols-2 gap-2">
            ${cats.map(c => `<button class="bg-white border border-ink/12 rounded-[4px] py-3 px-2 text-[0.72rem] cursor-pointer" data-cat="${c.id}">${c.name}</button>`).join('')}
            ${txn.category_id ? `<button class="col-span-full bg-white border border-ink/12 rounded-[4px] py-3 px-2 text-[0.72rem] cursor-pointer text-stone" data-cat="">Uncategorise</button>` : ''}
          </div>
          ${matches.length > 1 ? `<label class="flex items-center gap-2 text-[0.56rem] text-stone mt-3.5 cursor-pointer">
            <input type="checkbox" id="cat-all" checked /> Apply to all ${matches.length} uncategorised "${txn.description}"
          </label>` : ''}
          <div class="flex gap-2 mt-1.5"><button class="flex-1 bg-transparent border border-ink/12 rounded-[4px] py-3 font-mono text-[0.65rem] cursor-pointer" data-act="cancel">Cancel</button></div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      overlay.querySelector('[data-act="cancel"]').onclick = close;
      overlay.querySelectorAll('[data-cat]').forEach(btn => btn.onclick = async () => {
        const category_id = btn.dataset.cat || null;
        const applyAll = overlay.querySelector('#cat-all')?.checked;
        const ids = applyAll ? matches.map(t => t.id) : [txn.id];
        try {
          await finance.api('/transactions/categorise', { method: 'POST', body: JSON.stringify({ ids, category_id }) });
          close(); draw();
        } catch (e) { alert('Failed: ' + e.message); }
      });
    }

    return { mount(container) { el = container; month = curMonth(); draw(); } };
  };
})(window);