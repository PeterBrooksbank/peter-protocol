// protocol/finance-dashboard.js
(function (global) {
  const gbp = (n, dp = 0) => new Intl.NumberFormat('en-GB',
    { style: 'currency', currency: 'GBP', maximumFractionDigits: dp }).format(n ?? 0);
  const pad = n => String(n).padStart(2, '0');
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };

  const monthsBetween = (iso, ym) => {
    if (!iso) return 0;
    const [sy, sm] = iso.split('-').map(Number), [ny, nm] = ym.split('-').map(Number);
    return Math.max(0, (ny - sy) * 12 + (nm - sm));
  };

  // Projected drift since last snapshot, using current effective contributions.
  function projectionDrift(accounts, income, month) {
    const pension = {}, sl = {};
    for (const r of income) {
      if (r.net_monthly == null) continue;
      pension[r.person_id] = (pension[r.person_id] || 0) + (r.pension_employee || 0) + (r.pension_employer || 0);
      sl[r.person_id] = (sl[r.person_id] || 0) + (r.student_loan || 0);
    }
    let pensionDrift = 0, loanDrift = 0;
    for (const a of accounts) {
      if (!a.owner_person_id || a.as_of_date == null) continue;
      const months = monthsBetween(a.as_of_date, month);
      if (!months) continue;
      if (a.type === 'pension' && pension[a.owner_person_id]) pensionDrift += pension[a.owner_person_id] * months;
      if (a.type === 'student_loan' && sl[a.owner_person_id]) loanDrift += sl[a.owner_person_id] * months;
    }
    return { pensionDrift, loanDrift };
  }

  function render(el, d, month, h) {
    const { accounts, budget, income, uncategorised } = d;
    const assets = accounts.filter(a => !a.is_liability).reduce((s, a) => s + (a.balance ?? 0), 0);
    const liabilities = accounts.filter(a => a.is_liability).reduce((s, a) => s + (a.balance ?? 0), 0);
    const nw = assets - liabilities;

    const incomeNet = income.filter(r => r.net_monthly != null).reduce((s, r) => s + r.net_monthly, 0);
    const spend = budget.filter(c => c.kind !== 'income').reduce((s, c) => s + c.actual, 0);
    const plannedSpend = budget.filter(c => c.kind !== 'income').reduce((s, c) => s + c.planned_monthly, 0);
    const cashflow = incomeNet - spend;
    const overCats = budget.filter(c => c.kind !== 'income' && c.planned_monthly > 0 && c.actual > c.planned_monthly).length;
    const spendPct = plannedSpend > 0 ? Math.min(spend / plannedSpend, 1) * 100 : 0;
    const { pensionDrift, loanDrift } = projectionDrift(accounts, income, month);
    const hasDrift = pensionDrift > 0 || loanDrift > 0;

    el.innerHTML = `
      <div class="text-center py-5 pb-[26px]">
        <div class="text-[0.55rem] tracking-[0.22em] uppercase text-stone mb-2">Net worth</div>
        <div class="font-display text-[3.2rem] font-light leading-none tabular-nums ${nw < 0 ? 'text-signal-light' : 'text-ink'}">${gbp(nw)}</div>
        <div class="flex justify-center gap-4 mt-3 text-[0.6rem] text-stone font-mono tabular-nums"><span>Assets ${gbp(assets)}</span><span class="text-signal-light">Liabilities ${gbp(liabilities)}</span></div>
      </div>
      <div class="flex gap-2.5 mb-2.5">
        <div class="flex-1 bg-white border border-ink/12 rounded-[4px] p-[14px] cursor-pointer" data-go="income"><div class="text-[0.52rem] tracking-[0.16em] uppercase text-stone mb-1.5">Income this month</div><div class="font-mono text-[1.05rem] tabular-nums">${gbp(incomeNet)}</div></div>
        <div class="flex-1 bg-white border border-ink/12 rounded-[4px] p-[14px] cursor-pointer" data-go="budget"><div class="text-[0.52rem] tracking-[0.16em] uppercase text-stone mb-1.5">Spent this month</div><div class="font-mono text-[1.05rem] tabular-nums">${gbp(spend)}</div></div>
      </div>
      <div class="rounded-[6px] p-4 mb-2.5 cursor-pointer text-white ${cashflow < 0 ? 'bg-signal-light' : 'bg-warm'}" data-go="budget">
        <div class="text-[0.54rem] tracking-[0.16em] uppercase opacity-85">${cashflow >= 0 ? 'Net saved this month' : 'Overspent this month'}</div>
        <div class="font-display text-[2rem] font-light leading-[1.1] my-[2px] tabular-nums">${cashflow >= 0 ? '+' : '−'}${gbp(Math.abs(cashflow))}</div>
        <div class="text-[0.6rem] font-mono opacity-85 tabular-nums">${gbp(incomeNet)} in · ${gbp(spend)} out</div>
      </div>
      <div class="bg-white border border-ink/12 rounded-[4px] p-[14px] mb-2.5 cursor-pointer" data-go="budget">
        <div class="flex justify-between items-baseline mb-[9px]"><span class="text-[0.52rem] tracking-[0.16em] uppercase text-stone">Budget · ${monthLabel(month)}</span><span class="font-mono text-[0.74rem] tabular-nums ${spend > plannedSpend ? 'text-signal-light' : ''}">${gbp(spend)} / ${gbp(plannedSpend)}</span></div>
        <div class="h-[5px] bg-ink/12 rounded-[3px] overflow-hidden"><div class="${spend > plannedSpend ? 'bg-signal-light' : 'bg-warm'} h-full rounded-[3px] [transition:width_0.3s]" style="width:${spendPct}%"></div></div>
        ${overCats ? `<div class="text-[0.58rem] text-signal-light mt-2">${overCats} categor${overCats === 1 ? 'y' : 'ies'} over budget</div>` : ''}
      </div>
      ${uncategorised ? `<div class="flex justify-between items-center gap-3 bg-white border border-ink/12 border-l-[3px] border-l-warm rounded-[4px] py-[13px] px-[14px] mb-2 cursor-pointer text-[0.7rem]" data-go="transactions"><span>${uncategorised} transaction${uncategorised === 1 ? '' : 's'} need categorising</span><span class="text-warm font-mono">→</span></div>` : ''}
      ${hasDrift ? `<div class="flex justify-between items-center gap-3 bg-white border border-ink/12 border-l-[3px] border-l-stone rounded-[4px] py-[13px] px-[14px] mb-2 cursor-pointer text-[0.7rem]" data-go="accounts">
        <div><div class="text-[0.72rem]">Balances likely moved since your last update</div>
        <div class="text-[0.58rem] text-stone mt-[3px]">${pensionDrift > 0 ? `Pensions ~+${gbp(pensionDrift)}` : ''}${pensionDrift > 0 && loanDrift > 0 ? ' · ' : ''}${loanDrift > 0 ? `Student loan ~−${gbp(loanDrift)}` : ''} — log fresh balances</div></div>
        <span class="text-warm font-mono">→</span></div>` : ''}`;

    el.querySelectorAll('[data-go]').forEach(c => c.onclick = () => h.goTo(c.dataset.go));
  }

  global.createFinanceDashboard = function (finance) {
    let el, month = curMonth();
    async function draw() {
      el.innerHTML = '<div class="fin-loading">Loading…</div>';
      try {
        const [accounts, budget, income, txns] = await Promise.all([
          finance.api('/accounts'),
          finance.api(`/budget?month=${month}`),
          finance.api(`/income?month=${month}`),
          finance.api(`/transactions?month=${month}`),
        ]);
        render(el, { accounts, budget, income, uncategorised: txns.filter(t => !t.category_id).length },
          month, { goTo: v => global.showFinanceView?.(v) });
      } catch (e) { el.innerHTML = `<div class="fin-error">Couldn't load dashboard: ${e.message}</div>`; }
    }
    return { mount(container) { el = container; month = curMonth(); draw(); } };
  };
})(window);