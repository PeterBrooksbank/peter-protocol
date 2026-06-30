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
      <div class="bg-white border border-ink/12 rounded-[4px] px-[14px] py-3 mb-2 cursor-pointer" data-cat-id="${c.id}">
        <div class="flex justify-between items-baseline mb-2">
          <span class="text-[0.82rem]">${c.name}</span>
          <span class="font-mono text-[0.78rem] tabular-nums">${gbp(c.actual)} <span class="text-stone">/ ${gbp(c.planned_monthly)}</span></span>
        </div>
        <div class="h-[5px] bg-ink/12 rounded-[3px] overflow-hidden"><div class="${over ? 'bg-signal-light' : 'bg-warm'} h-full rounded-[3px] [transition:width_0.3s]" style="width:${Math.min(pct, 1) * 100}%"></div></div>
        <div class="text-[0.58rem] mt-1.5 tracking-[0.04em] ${remaining < 0 ? 'text-signal-light' : 'text-stone'}">
          ${remaining >= 0 ? `${gbp(remaining)} left` : `${gbp(-remaining)} over`}
        </div>
      </div>`;
  };

  const incomeRow = c => `
      <div class="bg-white border border-ink/12 rounded-[4px] px-[14px] py-3 mb-2 cursor-pointer" data-cat-id="${c.id}">
        <div class="flex justify-between items-baseline">
          <span class="text-[0.82rem]">${c.name}</span>
          <span class="font-mono text-[0.78rem] tabular-nums">${gbp(c.actual)} <span class="text-stone">/ ${gbp(c.planned_monthly)}</span></span>
        </div>
      </div>`;

  function render(container, cats, month, handlers) {
    const t = totals(cats);
    const expenses = cats.filter(c => c.kind !== 'income');
    const income = cats.filter(c => c.kind === 'income');

    container.innerHTML = `
      <div class="flex items-center justify-center gap-[18px] mb-5">
        <button class="bg-transparent border border-ink/12 rounded-[4px] size-8 text-base text-ink cursor-pointer" data-nav="prev">‹</button>
        <span class="font-display text-[1.3rem] font-light min-w-[150px] text-center">${monthLabel(month)}</span>
        <button class="bg-transparent border border-ink/12 rounded-[4px] size-8 text-base text-ink cursor-pointer" data-nav="next">›</button>
      </div>
      <div class="flex gap-2.5 mb-1.5">
        <div class="flex-1 bg-white border border-ink/12 rounded-[4px] px-[14px] py-3">
          <div class="text-[0.52rem] tracking-[0.18em] uppercase text-stone mb-[5px]">Planned net</div>
          <div class="font-mono text-[1.05rem] tabular-nums ${t.plannedNet < 0 ? 'text-signal-light' : ''}">${gbp(t.plannedNet)}</div>
        </div>
        <div class="flex-1 bg-white border border-ink/12 rounded-[4px] px-[14px] py-3">
          <div class="text-[0.52rem] tracking-[0.18em] uppercase text-stone mb-[5px]">Actual net</div>
          <div class="font-mono text-[1.05rem] tabular-nums ${t.actualNet < 0 ? 'text-signal-light' : ''}">${gbp(t.actualNet)}</div>
        </div>
      </div>
      <div class="text-[0.58rem] text-stone tracking-[0.04em] text-center mb-6 tabular-nums">Annualised · ${gbp(t.plannedIncome * 12)}/yr income planned · net ${gbp(t.plannedNet * 12)}/yr</div>
      ${income.length ? `<div class="text-[0.54rem] tracking-[0.2em] uppercase text-stone mt-[22px] mb-2.5">Income</div>${income.map(incomeRow).join('')}` : ''}
      <div class="text-[0.54rem] tracking-[0.2em] uppercase text-stone mt-[22px] mb-2.5">Expenses</div>
      ${expenses.length ? expenses.map(expenseRow).join('') : '<div class="py-6 text-center font-display italic text-stone text-[0.9rem]">No categories yet — add one to start your budget.</div>'}
      <button class="mt-4 bg-warm text-white border-0 rounded-[4px] px-[14px] py-2 font-mono text-[0.6rem] tracking-[0.1em] cursor-pointer" data-act="add-cat">+ Category</button>`;

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