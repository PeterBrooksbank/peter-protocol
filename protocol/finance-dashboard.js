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
      <div class="dsh-hero">
        <div class="dsh-hero-label">Net worth</div>
        <div class="dsh-hero-value ${nw < 0 ? 'neg' : ''}">${gbp(nw)}</div>
        <div class="dsh-hero-split"><span>Assets ${gbp(assets)}</span><span class="dsh-liab">Liabilities ${gbp(liabilities)}</span></div>
      </div>
      <div class="dsh-grid">
        <div class="dsh-card" data-go="income"><div class="dsh-card-label">Income this month</div><div class="dsh-card-val">${gbp(incomeNet)}</div></div>
        <div class="dsh-card" data-go="budget"><div class="dsh-card-label">Spent this month</div><div class="dsh-card-val">${gbp(spend)}</div></div>
      </div>
      <div class="dsh-cashflow ${cashflow < 0 ? 'neg' : 'pos'}" data-go="budget">
        <div class="dsh-cf-label">${cashflow >= 0 ? 'Net saved this month' : 'Overspent this month'}</div>
        <div class="dsh-cf-val">${cashflow >= 0 ? '+' : '−'}${gbp(Math.abs(cashflow))}</div>
        <div class="dsh-cf-sub">${gbp(incomeNet)} in · ${gbp(spend)} out</div>
      </div>
      <div class="dsh-budget" data-go="budget">
        <div class="dsh-budget-head"><span class="dsh-card-label">Budget · ${monthLabel(month)}</span><span class="dsh-budget-fig ${spend > plannedSpend ? 'neg' : ''}">${gbp(spend)} / ${gbp(plannedSpend)}</span></div>
        <div class="bdg-bar"><div class="bdg-bar-fill ${spend > plannedSpend ? 'over' : ''}" style="width:${spendPct}%"></div></div>
        ${overCats ? `<div class="dsh-budget-warn">${overCats} categor${overCats === 1 ? 'y' : 'ies'} over budget</div>` : ''}
      </div>
      ${uncategorised ? `<div class="dsh-nudge" data-go="transactions"><span>${uncategorised} transaction${uncategorised === 1 ? '' : 's'} need categorising</span><span class="dsh-arrow">→</span></div>` : ''}
      ${hasDrift ? `<div class="dsh-nudge drift" data-go="accounts">
        <div><div class="dsh-nudge-title">Balances likely moved since your last update</div>
        <div class="dsh-nudge-sub">${pensionDrift > 0 ? `Pensions ~+${gbp(pensionDrift)}` : ''}${pensionDrift > 0 && loanDrift > 0 ? ' · ' : ''}${loanDrift > 0 ? `Student loan ~−${gbp(loanDrift)}` : ''} — log fresh balances</div></div>
        <span class="dsh-arrow">→</span></div>` : ''}`;

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