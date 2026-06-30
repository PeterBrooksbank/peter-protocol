// protocol/finance-budget.js
(function attachFinanceBudget(global) {
  const gbp = n => new Intl.NumberFormat('en-GB',
    { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n ?? 0);
  const pad = n => String(n).padStart(2, '0');
  const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const shiftMonth = (ym, delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const monthLabel = ym => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  function totals(cats) {
    const t = { plannedExpense: 0, actualExpense: 0, plannedIncome: 0, actualIncome: 0 };
    for (const c of cats) {
      if (c.kind === 'income') { t.plannedIncome += c.planned_monthly; t.actualIncome += c.actual; }
      else { t.plannedExpense += c.planned_monthly; t.actualExpense += c.actual; }
    }
    t.plannedNet = t.plannedIncome - t.plannedExpense;
    t.actualNet = t.actualIncome - t.actualExpense;
    return t;
  }

  const expenseRow = c => {
    const pct = c.planned_monthly > 0 ? c.actual / c.planned_monthly : (c.actual > 0 ? 1 : 0);
    const over = c.planned_monthly > 0 && c.actual > c.planned_monthly;
    const remaining = c.planned_monthly - c.actual;
    return `
      <div class="bdg-cat" data-cat-id="${c.id}">
        <div class="bdg-cat-top">
          <span class="bdg-cat-name">${c.name}</span>
          <span class="bdg-cat-fig">${gbp(c.actual)} <span class="bdg-cat-planned">/ ${gbp(c.planned_monthly)}</span></span>
        </div>
        <div class="bdg-bar"><div class="bdg-bar-fill ${over ? 'over' : ''}" style="width:${Math.min(pct, 1) * 100}%"></div></div>
        <div class="bdg-cat-foot ${remaining < 0 ? 'neg' : ''}">
          ${remaining >= 0 ? `${gbp(remaining)} left` : `${gbp(-remaining)} over`}
        </div>
      </div>`;
  };

  const incomeRow = c => `
      <div class="bdg-cat" data-cat-id="${c.id}">
        <div class="bdg-cat-top">
          <span class="bdg-cat-name">${c.name}</span>
          <span class="bdg-cat-fig">${gbp(c.actual)} <span class="bdg-cat-planned">/ ${gbp(c.planned_monthly)}</span></span>
        </div>
      </div>`;

  function render(container, cats, month, handlers) {
    const t = totals(cats);
    const expenses = cats.filter(c => c.kind !== 'income');
    const income = cats.filter(c => c.kind === 'income');

    container.innerHTML = `
      <div class="bdg-monthbar">
        <button class="bdg-nav" data-nav="prev">‹</button>
        <span class="bdg-month">${monthLabel(month)}</span>
        <button class="bdg-nav" data-nav="next">›</button>
      </div>
      <div class="bdg-summary">
        <div class="bdg-sum-cell">
          <div class="bdg-sum-label">Planned net</div>
          <div class="bdg-sum-val ${t.plannedNet < 0 ? 'neg' : ''}">${gbp(t.plannedNet)}</div>
        </div>
        <div class="bdg-sum-cell">
          <div class="bdg-sum-label">Actual net</div>
          <div class="bdg-sum-val ${t.actualNet < 0 ? 'neg' : ''}">${gbp(t.actualNet)}</div>
        </div>
      </div>
      <div class="bdg-annual">Annualised · ${gbp(t.plannedIncome * 12)}/yr income planned · net ${gbp(t.plannedNet * 12)}/yr</div>
      ${income.length ? `<div class="bdg-section-label">Income</div>${income.map(incomeRow).join('')}` : ''}
      <div class="bdg-section-label">Expenses</div>
      ${expenses.length ? expenses.map(expenseRow).join('') : '<div class="fin-empty">No categories yet — add one to start your budget.</div>'}
      <button class="fin-add bdg-addcat" data-act="add-cat">+ Category</button>`;

    container.querySelector('[data-nav="prev"]').onclick = () => handlers.setMonth(shiftMonth(month, -1));
    container.querySelector('[data-nav="next"]').onclick = () => handlers.setMonth(shiftMonth(month, 1));
    container.querySelector('[data-act="add-cat"]').onclick = () => handlers.onAddCategory?.();
    container.querySelectorAll('[data-cat-id]').forEach(row => {
      row.onclick = () => handlers.onEditCategory?.(cats.find(c => c.id === row.dataset.catId));
    });
  }

  global.createFinanceBudget = function (finance) {
    let month = currentMonth(), el = null, ext = {};
    async function draw() {
      el.innerHTML = '<div class="fin-loading">Loading…</div>';
      try {
        const cats = await finance.api(`/budget?month=${month}`);
        render(el, cats, month, { ...ext, setMonth: m => { month = m; draw(); } });
      } catch (e) {
        el.innerHTML = `<div class="fin-error">Couldn't load budget: ${e.message}</div>`;
      }
    }
    return { mount(container, handlers) { el = container; ext = handlers || {}; draw(); } };
  };
})(window);