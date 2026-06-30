// protocol/finance-income.js
(function (global) {
  const gbp = (n, dp = 0) => new Intl.NumberFormat('en-GB',
    { style: 'currency', currency: 'GBP', maximumFractionDigits: dp }).format(n ?? 0);
  const pad = n => String(n).padStart(2, '0');
  const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const shift = (ym, dx) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + dx, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const label = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };

  function aggregate(rows) {
    const people = new Map();
    for (const r of rows) {
      if (!people.has(r.person_id))
        people.set(r.person_id, { id: r.person_id, name: r.display_name, sources: [],
          net: 0, gross: 0, tax: 0, ni: 0, pensionEE: 0, pensionER: 0, sl: 0, other: 0 });
      const pp = people.get(r.person_id);
      if (r.source_id) {
        pp.sources.push(r);
        if (r.net_monthly != null) {
          pp.net += r.net_monthly; pp.gross += r.gross_monthly || 0;
          pp.tax += r.income_tax || 0; pp.ni += r.national_insurance || 0;
          pp.pensionEE += r.pension_employee || 0; pp.pensionER += r.pension_employer || 0;
          pp.sl += r.student_loan || 0; pp.other += r.other_deductions || 0;
        }
      }
    }
    return [...people.values()];
  }

  const sourceBlock = r => {
    if (r.net_monthly == null) return `
      <div class="inc-source unset" data-source='${JSON.stringify({ id: r.source_id, name: r.source_name, kind: r.kind })}'>
        <div class="inc-source-head"><span>${r.source_name}</span><span class="inc-unset">Not set — tap to add</span></div>
      </div>`;
    const ded = [
      ['Income tax', r.income_tax], ['NI', r.national_insurance],
      ['Pension', r.pension_employee], ['Student loan', r.student_loan], ['Other', r.other_deductions],
    ].filter(([, v]) => v);
    return `
      <div class="inc-source" data-source='${JSON.stringify({ id: r.source_id, name: r.source_name, kind: r.kind })}'>
        <div class="inc-source-head">
          <span>${r.source_name}</span>
          <span class="inc-net">${gbp(r.net_monthly)}<span class="inc-permo">/mo</span></span>
        </div>
        <div class="inc-waterfall">
          <span class="inc-w-gross">Gross ${gbp(r.gross_monthly)}</span>
          ${ded.map(([k, v]) => `<span class="inc-w-ded">− ${k} ${gbp(v)}</span>`).join('')}
          ${r.pension_employer ? `<span class="inc-w-er">+ Employer pension ${gbp(r.pension_employer)}</span>` : ''}
        </div>
      </div>`;
  };

  function render(el, rows, month, h) {
    const people = aggregate(rows);
    const tot = people.reduce((a, p) => ({
      net: a.net + p.net, gross: a.gross + p.gross, tax: a.tax + p.tax + p.ni,
      pension: a.pension + p.pensionEE + p.pensionER,
    }), { net: 0, gross: 0, tax: 0, pension: 0 });

    el.innerHTML = `
      <div class="bdg-monthbar">
        <button class="bdg-nav" data-nav="prev">‹</button>
        <span class="bdg-month">${label(month)}</span>
        <button class="bdg-nav" data-nav="next">›</button>
      </div>
      <div class="bdg-summary">
        <div class="bdg-sum-cell"><div class="bdg-sum-label">Household net</div>
          <div class="bdg-sum-val">${gbp(tot.net)}<span class="inc-permo">/mo</span></div></div>
        <div class="bdg-sum-cell"><div class="bdg-sum-label">Gross</div>
          <div class="bdg-sum-val">${gbp(tot.gross)}<span class="inc-permo">/mo</span></div></div>
      </div>
      <div class="bdg-annual">Annualised · ${gbp(tot.net * 12)} net · ${gbp(tot.gross * 12)} gross · ${gbp(tot.tax * 12)} tax & NI · ${gbp(tot.pension * 12)} into pensions</div>

      ${people.map(p => `
        <div class="inc-person">
          <div class="inc-person-head">
            <span class="inc-person-name">${p.name}</span>
            <span class="inc-person-net">${gbp(p.net)}<span class="inc-permo">/mo net</span></span>
          </div>
          ${p.sources.length ? p.sources.map(sourceBlock).join('') : '<div class="inc-empty">No income sources</div>'}
          <button class="inc-addsrc" data-add-source="${p.id}" data-add-name="${p.name}">+ Income source</button>
        </div>`).join('')}

      <button class="fin-add inc-addperson" data-act="add-person">+ Person</button>`;

    el.querySelector('[data-nav="prev"]').onclick = () => h.setMonth(shift(month, -1));
    el.querySelector('[data-nav="next"]').onclick = () => h.setMonth(shift(month, 1));
    el.querySelector('[data-act="add-person"]').onclick = () => h.onAddPerson();
    el.querySelectorAll('[data-add-source]').forEach(b =>
      b.onclick = () => h.onAddSource({ id: b.dataset.addSource, name: b.dataset.addName }));
    el.querySelectorAll('[data-source]').forEach(row =>
      row.onclick = () => h.onSetValue(JSON.parse(row.dataset.source)));
  }

  global.createFinanceIncome = function (finance, forms) {
    let el, month = curMonth();
    async function draw() {
      el.innerHTML = '<div class="fin-loading">Loading…</div>';
      try {
        render(el, await finance.api(`/income?month=${month}`), month, {
          setMonth: m => { month = m; draw(); },
          onAddPerson: forms.addPerson,
          onAddSource: forms.addIncomeSource,
          onSetValue: forms.setIncomeValue,
        });
      } catch (e) { el.innerHTML = `<div class="fin-error">Couldn't load income: ${e.message}</div>`; }
    }
    return { mount(container) { el = container; month = curMonth(); draw(); } };
  };
})(window);