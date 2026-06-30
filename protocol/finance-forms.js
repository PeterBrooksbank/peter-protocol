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
      overlay.className = 'fin-modal-overlay';
      overlay.innerHTML = `
        <div class="fin-modal">
          <div class="fin-modal-title">${title}</div>
          <div class="fin-modal-body">${bodyHtml}</div>
          <div class="fin-modal-actions">
            <button class="fin-btn-ghost" data-act="cancel">Cancel</button>
            <button class="fin-btn" data-act="save">Save</button>
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
            err = document.createElement('div'); err.className = 'fin-modal-error';
            overlay.querySelector('.fin-modal-body').appendChild(err);
          }
          err.textContent = e.message;
        }
      };
      if (onMount) onMount(overlay, close);
    }

    function addAccount() {
      modal('Add account', `
        <label class="fin-field">Type
          <select name="type">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </label>
        <label class="fin-field">Name
          <input name="nickname" placeholder="e.g. Joint Current" />
        </label>
        <label class="fin-field">Provider <span class="fin-opt">optional</span>
          <input name="provider" placeholder="e.g. Monzo" />
        </label>
        <label class="fin-field">Current balance <span class="fin-opt">optional</span>
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
        <label class="fin-field">New balance
          <input name="balance" type="number" inputmode="decimal" value="${account.balance ?? ''}" />
        </label>
        <label class="fin-field">As of
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
        <label class="fin-field">Name <input name="name" placeholder="e.g. Groceries" /></label>
        <label class="fin-field">Type
          <select name="kind"><option value="expense">Expense</option><option value="income">Income</option></select>
        </label>
        <label class="fin-field">Planned monthly
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
        <label class="fin-field">Name <input name="name" value="${cat.name}" /></label>
        <label class="fin-field">Planned monthly
          <input name="planned" type="number" inputmode="decimal" value="${cat.planned_monthly}" /></label>
        <label class="fin-field fin-check">
          <input name="rollover" type="checkbox" ${cat.rollover_enabled ? 'checked' : ''} />
          Roll unspent budget into next month
        </label>
        <button class="fin-delete" data-act="delete">Delete category</button>`,
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

    return { addAccount, updateBalance, addCategory, editCategory };
  }
  global.createFinanceForms = createFinanceForms;
})(window);