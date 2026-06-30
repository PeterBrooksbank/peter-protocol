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
      <div class="py-[9px] border-b border-ink/12 cursor-pointer opacity-70" data-source='${JSON.stringify({ id: r.source_id, name: r.source_name, kind: r.kind })}'>
        <div class="flex justify-between items-baseline"><span>${r.source_name}</span><span class="text-[0.6rem] text-warm">Not set — tap to add</span></div>
      </div>`;
    const ded = [
      ['Income tax', r.income_tax], ['NI', r.national_insurance],
      ['Pension', r.pension_employee], ['Student loan', r.student_loan], ['Other', r.other_deductions],
    ].filter(([, v]) => v);
    return `
      <div class="py-[9px] border-b border-ink/12 cursor-pointer last:border-b-0" data-source='${JSON.stringify({ id: r.source_id, name: r.source_name, kind: r.kind })}'>
        <div class="flex justify-between items-baseline">
          <span>${r.source_name}</span>
          <span class="font-mono text-[0.82rem] tabular-nums">${gbp(r.net_monthly)}<span class="text-[0.62em] text-stone tracking-[0.04em] ml-0.5">/mo</span></span>
        </div>
        <div class="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5">
          <span class="text-[0.56rem] text-ink">Gross ${gbp(r.gross_monthly)}</span>
          ${ded.map(([k, v]) => `<span class="text-[0.56rem] text-stone">− ${k} ${gbp(v)}</span>`).join('')}
          ${r.pension_employer ? `<span class="text-[0.56rem] text-warm">+ Employer pension ${gbp(r.pension_employer)}</span>` : ''}
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
      <div class="flex items-center justify-center gap-[18px] mb-5">
        <button class="bg-transparent border border-ink/12 rounded-[4px] size-8 text-base text-ink cursor-pointer" data-nav="prev">‹</button>
        <span class="font-display text-[1.3rem] font-light min-w-[150px] text-center">${label(month)}</span>
        <button class="bg-transparent border border-ink/12 rounded-[4px] size-8 text-base text-ink cursor-pointer" data-nav="next">›</button>
      </div>
      <div class="flex gap-2.5 mb-1.5">
        <div class="flex-1 bg-white border border-ink/12 rounded-[4px] px-[14px] py-3">
          <div class="text-[0.52rem] tracking-[0.18em] uppercase text-stone mb-[5px]">Household net</div>
          <div class="font-mono text-[1.05rem] tabular-nums">${gbp(tot.net)}<span class="text-[0.62em] text-stone tracking-[0.04em] ml-0.5">/mo</span></div>
        </div>
        <div class="flex-1 bg-white border border-ink/12 rounded-[4px] px-[14px] py-3">
          <div class="text-[0.52rem] tracking-[0.18em] uppercase text-stone mb-[5px]">Gross</div>
          <div class="font-mono text-[1.05rem] tabular-nums">${gbp(tot.gross)}<span class="text-[0.62em] text-stone tracking-[0.04em] ml-0.5">/mo</span></div>
        </div>
      </div>
      <div class="text-[0.58rem] text-stone tracking-[0.04em] text-center mb-6 tabular-nums">Annualised · ${gbp(tot.net * 12)} net · ${gbp(tot.gross * 12)} gross · ${gbp(tot.tax * 12)} tax & NI · ${gbp(tot.pension * 12)} into pensions</div>

      ${people.map(p => `
        <div class="bg-white border border-ink/12 rounded-[6px] p-[14px] mb-3">
          <div class="flex justify-between items-baseline pb-2.5 border-b border-ink/12 mb-2.5">
            <span class="font-display text-[1.25rem] font-light">${p.name}</span>
            <span class="font-mono text-[0.9rem] tabular-nums">${gbp(p.net)}<span class="text-[0.62em] text-stone tracking-[0.04em] ml-0.5">/mo net</span></span>
          </div>
          ${p.sources.length ? p.sources.map(sourceBlock).join('') : '<div class="text-[0.62rem] text-stone italic py-1.5">No income sources</div>'}
          <button class="mt-2.5 bg-transparent border border-dashed border-ink/12 rounded-[4px] py-2 w-full font-mono text-[0.58rem] text-stone cursor-pointer" data-add-source="${p.id}" data-add-name="${p.name}">+ Income source</button>
        </div>`).join('')}

      <button class="mt-2 bg-warm text-white border-0 rounded-[4px] px-[14px] py-2 font-mono text-[0.6rem] tracking-[0.1em] cursor-pointer" data-act="add-person">+ Person</button>`;

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