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
        <div class="bdg-monthbar">
          <button class="bdg-nav" data-nav="prev">‹</button>
          <span class="bdg-month">${label(month)}</span>
          <button class="bdg-nav" data-nav="next">›</button>
        </div>
        <div class="txn-toolbar">
          <span class="txn-count">${txns.length} txns${uncat ? ` · ${uncat} uncategorised` : ''}</span>
          <button class="fin-add" data-act="import">Import CSV</button>
        </div>
        ${txns.length ? txns.map(t => `
          <div class="txn-row ${t.category_id ? '' : 'uncat'}" data-id="${t.id}">
            <div class="txn-main">
              <div class="txn-desc">${t.description}</div>
              <div class="txn-meta">${t.date}${t.category_name ? ` · <span class="txn-chip">${t.category_name}</span>` : ' · <span class="txn-chip none">Uncategorised</span>'}</div>
            </div>
            <div class="txn-amt ${t.amount < 0 ? 'neg' : ''}">${gbp(t.amount)}</div>
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
      overlay.className = 'fin-modal-overlay';
      overlay.innerHTML = `
        <div class="fin-modal">
          <div class="fin-modal-title">Categorise</div>
          <div class="fin-modal-body">
            <p class="fin-hint">${txn.description} · ${gbp(txn.amount)}</p>
            <div class="cat-grid">
              ${cats.map(c => `<button class="cat-pick" data-cat="${c.id}">${c.name}</button>`).join('')}
              ${txn.category_id ? `<button class="cat-pick none" data-cat="">Uncategorise</button>` : ''}
            </div>
            ${matches.length > 1 ? `<label class="fin-field fin-check" style="margin-top:14px">
              <input type="checkbox" id="cat-all" checked /> Apply to all ${matches.length} uncategorised "${txn.description}"
            </label>` : ''}
            <div class="fin-modal-actions"><button class="fin-btn-ghost" data-act="cancel">Cancel</button></div>
          </div>
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