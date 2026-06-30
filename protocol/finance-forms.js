// protocol/finance-forms.js
(function attachFinanceForms(global) {
  function createFinanceForms(finance, onChange) {
    const TYPES = [
      ['current', 'Current'], ['savings', 'Savings'], ['isa', 'ISA'],
      ['investment', 'Investment'], ['pension', 'Pension'],
      ['student_loan', 'Student Loan'], ['mortgage', 'Mortgage'], ['other', 'Other'],
    ];
    const LIABILITY = new Set(['student_loan', 'mortgage']);
    const today = () => new Date().toISOString().slice(0, 10);

    function modal(title, bodyHtml, onSubmit, onMount) {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-[rgba(40,35,30,0.4)] flex items-end justify-center z-[1000]';
      overlay.innerHTML = `
        <div class="bg-paper w-full max-w-[440px] rounded-t-[12px] px-5 pt-6 pb-7">
          <div class="font-display text-[1.4rem] font-light mb-[18px]">${title}</div>
          <div class="fin-modal-body">${bodyHtml}</div>
          <div class="flex gap-2 mt-1.5">
            <button class="flex-1 bg-transparent border border-ink/12 rounded-[4px] py-3 font-mono text-[0.65rem] cursor-pointer" data-act="cancel">Cancel</button>
            <button class="flex-1 bg-warm text-white border-0 rounded-[4px] py-3 font-mono text-[0.65rem] tracking-[0.1em] cursor-pointer" data-act="save">Save</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      overlay.querySelector('[data-act="cancel"]').onclick = close;
      overlay.querySelector('[data-act="save"]').onclick = async () => {
        const btn = overlay.querySelector('[data-act="save"]');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          await onSubmit(overlay); close(); onChange?.();
        } catch (e) {
          btn.disabled = false; btn.textContent = 'Save';
          let err = overlay.querySelector('.fin-modal-error');
          if (!err) {
            err = document.createElement('div'); err.className = 'text-signal-light text-[0.7rem] font-mono mt-1';
            overlay.querySelector('.fin-modal-body').appendChild(err);
          }
          err.textContent = e.message;
        }
      };
      if (onMount) onMount(overlay, close);
    }

    function addAccount() {
      modal('Add account', `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Type
          <select name="type">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Name
          <input name="nickname" placeholder="e.g. Joint Current" />
        </label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Provider <span class="ml-1 normal-case tracking-normal text-stone opacity-70">optional</span>
          <input name="provider" placeholder="e.g. Monzo" />
        </label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Current balance <span class="ml-1 normal-case tracking-normal text-stone opacity-70">optional</span>
          <input name="balance" type="number" inputmode="decimal" placeholder="0" />
        </label>`,
        async (root) => {
          const val = n => root.querySelector(`[name="${n}"]`).value.trim();
          const type = val('type'), nickname = val('nickname'), bal = val('balance');
          if (!nickname) throw new Error('Name is required');
          await finance.api('/accounts', {
            method: 'POST',
            body: JSON.stringify({
              type, nickname,
              provider: val('provider') || null,
              is_liability: LIABILITY.has(type),
              balance: bal === '' ? null : Number(bal),
            }),
          });
        });
    }

    function updateBalance(account) {
      modal(`Update — ${account.nickname}`, `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">New balance
          <input name="balance" type="number" inputmode="decimal" value="${account.balance ?? ''}" />
        </label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">As of
          <input name="as_of_date" type="date" value="${today()}" />
        </label>`,
        async (root) => {
          const bal = root.querySelector('[name="balance"]').value.trim();
          if (bal === '') throw new Error('Enter a balance');
          await finance.api('/snapshots', {
            method: 'POST',
            body: JSON.stringify({
              account_id: account.id,
              balance: Number(bal),
              as_of_date: root.querySelector('[name="as_of_date"]').value,
            }),
          });
        });
    }

    function addCategory() {
      modal('Add budget category', `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Name <input name="name" placeholder="e.g. Groceries" /></label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Type
          <select name="kind"><option value="expense">Expense</option><option value="income">Income</option></select>
        </label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Planned monthly
          <input name="planned" type="number" inputmode="decimal" placeholder="0" /></label>`,
        async (root) => {
          const v = n => root.querySelector(`[name="${n}"]`).value.trim();
          if (!v('name')) throw new Error('Name is required');
          await finance.api('/categories', {
            method: 'POST', body: JSON.stringify({
              name: v('name'), kind: v('kind'),
              planned_monthly: v('planned') === '' ? 0 : Number(v('planned')),
            })
          });
        });
    }

    function editCategory(cat) {
      modal(`Edit — ${cat.name}`, `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Name <input name="name" value="${cat.name}" /></label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Planned monthly
          <input name="planned" type="number" inputmode="decimal" value="${cat.planned_monthly}" /></label>
        <label class="flex items-center gap-2 text-[0.56rem] text-stone mb-3.5 normal-case tracking-normal cursor-pointer">
          <input name="rollover" type="checkbox" ${cat.rollover_enabled ? 'checked' : ''} style="width:auto;margin:0" />
          Roll unspent budget into next month
        </label>
        <button class="w-full bg-transparent border border-signal-light text-signal-light rounded-[4px] py-2.5 mt-1.5 font-mono text-[0.62rem] cursor-pointer" data-act="delete">Delete category</button>`,
        async (root) => {
          await finance.api(`/categories/${cat.id}`, {
            method: 'PATCH', body: JSON.stringify({
              name: root.querySelector('[name="name"]').value.trim(),
              planned_monthly: Number(root.querySelector('[name="planned"]').value || 0),
              rollover_enabled: root.querySelector('[name="rollover"]').checked,
            })
          });
        },
        (overlay, close) => {
          overlay.querySelector('[data-act="delete"]').onclick = async () => {
            if (!confirm(`Delete "${cat.name}"? Its transactions stay but become uncategorised.`)) return;
            await finance.api(`/categories/${cat.id}`, { method: 'DELETE' });
            close(); onChange?.();
          };
        });
    }

    const curMonth = () => new Date().toISOString().slice(0, 7);

    function entryFields(pre = {}) {
      const v = x => x ?? '';
      return `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Effective from
          <input name="effective_from" type="month" value="${(pre.effective_from || '').slice(0,7) || curMonth()}" /></label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Gross monthly
          <input name="gross_monthly" type="number" inputmode="decimal" value="${v(pre.gross_monthly)}" /></label>
        <div class="grid grid-cols-2 gap-x-2.5">
          <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Income tax <input name="income_tax" type="number" inputmode="decimal" value="${v(pre.income_tax)}" /></label>
          <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">NI <input name="national_insurance" type="number" inputmode="decimal" value="${v(pre.national_insurance)}" /></label>
          <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Pension (you) <input name="pension_employee" type="number" inputmode="decimal" value="${v(pre.pension_employee)}" /></label>
          <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Student loan <input name="student_loan" type="number" inputmode="decimal" value="${v(pre.student_loan)}" /></label>
          <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Other <input name="other_deductions" type="number" inputmode="decimal" value="${v(pre.other_deductions)}" /></label>
          <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Pension (employer) <input name="pension_employer" type="number" inputmode="decimal" value="${v(pre.pension_employer)}" /></label>
        </div>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Net monthly <span class="ml-1 normal-case tracking-normal text-stone opacity-70">auto from above, editable</span>
          <input name="net_monthly" type="number" inputmode="decimal" value="${v(pre.net_monthly)}" /></label>`;
    }

    function wireAutoNet(root) {
      const get = n => Number(root.querySelector(`[name="${n}"]`).value || 0);
      const net = root.querySelector('[name="net_monthly"]');
      let touched = false;
      net.addEventListener('input', () => { touched = true; });
      const recalc = () => {
        if (touched) return;
        net.value = (get('gross_monthly') - get('income_tax') - get('national_insurance')
          - get('pension_employee') - get('student_loan') - get('other_deductions')).toFixed(2);
      };
      ['gross_monthly','income_tax','national_insurance','pension_employee','student_loan','other_deductions']
        .forEach(n => root.querySelector(`[name="${n}"]`).addEventListener('input', recalc));
    }

    function readEntry(root) {
      const num = n => { const x = root.querySelector(`[name="${n}"]`).value.trim(); return x === '' ? 0 : Number(x); };
      const ef = root.querySelector('[name="effective_from"]').value;
      if (!ef) throw new Error('Effective month required');
      const gross = num('gross_monthly'), net = num('net_monthly');
      if (!gross && !net) throw new Error('Enter gross or net');
      return {
        effective_from: ef + '-01', gross_monthly: gross, net_monthly: net,
        income_tax: num('income_tax'), national_insurance: num('national_insurance'),
        pension_employee: num('pension_employee'), pension_employer: num('pension_employer'),
        student_loan: num('student_loan'), other_deductions: num('other_deductions'),
      };
    }

    function addPerson() {
      modal('Add person', `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Name <input name="name" placeholder="e.g. Partner's name" /></label>
        <label class="flex items-center gap-2 text-[0.56rem] text-stone mb-3.5 normal-case tracking-normal cursor-pointer"><input name="earner" type="checkbox" checked style="width:auto;margin:0" /> Earns income</label>`,
        async (root) => {
          const name = root.querySelector('[name="name"]').value.trim();
          if (!name) throw new Error('Name is required');
          await finance.api('/people', { method: 'POST', body: JSON.stringify({
            display_name: name, is_earner: root.querySelector('[name="earner"]').checked })});
        });
    }

    function addIncomeSource(person) {
      modal(`Income for ${person.name}`, `
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Source name <input name="name" placeholder="e.g. Acme Ltd salary" /></label>
        <label class="fin-field block text-[0.56rem] tracking-[0.14em] uppercase text-stone mb-3.5">Type
          <select name="kind">
            <option value="employment">Employment</option>
            <option value="self_employment">Self-employment</option>
            <option value="rental">Rental</option>
            <option value="benefits">Benefits</option>
            <option value="other">Other</option>
          </select></label>
        ${entryFields()}`,
        async (root) => {
          const name = root.querySelector('[name="name"]').value.trim();
          if (!name) throw new Error('Source name is required');
          await finance.api('/income-sources', { method: 'POST', body: JSON.stringify({
            person_id: person.id, name, kind: root.querySelector('[name="kind"]').value,
            entry: readEntry(root) })});
        },
        (overlay) => wireAutoNet(overlay));
    }

    function setIncomeValue(source) {
      modal(`Update — ${source.name}`, `
        <p class="text-[0.66rem] text-stone leading-[1.5] mb-3">Enter the new figures. They apply from the chosen month onward — past months keep their old values.</p>
        ${entryFields()}
        <div class="inc-history" id="inc-history">Loading history…</div>`,
        async (root) => {
          await finance.api('/income-entries', { method: 'POST', body: JSON.stringify({
            income_source_id: source.id, ...readEntry(root) })});
        },
        async (overlay) => {
          wireAutoNet(overlay);
          try {
            const hist = await finance.api(`/income-sources/${source.id}/history`);
            const box = overlay.querySelector('#inc-history');
            box.innerHTML = hist.length
              ? `<div class="text-[0.52rem] tracking-[0.16em] uppercase text-stone mb-1.5">Previous values</div>` + hist.map(e =>
                  `<div class="flex justify-between font-mono text-[0.62rem] text-stone py-[3px] tabular-nums"><span>${e.effective_from.slice(0,7)}</span><span>${new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(e.net_monthly)}/mo net</span></div>`).join('')
              : '';
          } catch { overlay.querySelector('#inc-history').innerHTML = ''; }
        });
    }

    return { addAccount, updateBalance, addCategory, editCategory, addPerson, addIncomeSource, setIncomeValue };
  }
  global.createFinanceForms = createFinanceForms;
})(window);