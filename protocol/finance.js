// protocol/finance.js
(function attachFinance(global) {
    const TYPE_META = {
        current: { label: 'Current', liability: false },
        savings: { label: 'Savings', liability: false },
        isa: { label: 'ISA', liability: false },
        investment: { label: 'Investment', liability: false },
        pension: { label: 'Pension', liability: false },
        student_loan: { label: 'Student Loans', liability: true },
        mortgage: { label: 'Mortgage', liability: true },
        other: { label: 'Other', liability: false },
    };
    const GROUP_ORDER = ['current', 'savings', 'isa', 'investment', 'pension', 'student_loan', 'mortgage', 'other'];

    const gbp = n => new Intl.NumberFormat('en-GB',
        { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n ?? 0);

    async function api(path, opts = {}) {
        const res = await fetch(`/api/finance${path}`, {
            headers: { 'Content-Type': 'application/json' }, ...opts
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
        return res.json();
    }

    // assets add, liabilities subtract → true net worth
    function computeNetWorth(accounts) {
        return accounts.reduce((sum, a) => {
            const bal = a.balance ?? 0;
            return sum + (a.is_liability ? -bal : bal);
        }, 0);
    }

    function groupByType(accounts) {
        const groups = {};
        for (const a of accounts) (groups[a.type] ??= []).push(a);
        return GROUP_ORDER
            .filter(t => groups[t]?.length)
            .map(type => {
                const items = groups[type];
                const signed = items.reduce((s, a) =>
                    s + (a.is_liability ? -(a.balance ?? 0) : (a.balance ?? 0)), 0);
                return { type, label: TYPE_META[type]?.label ?? type, items, subtotal: signed };
            });
    }

    async function load(container, handlers = {}) {
        container.innerHTML = '<div class="fin-loading">Loading…</div>';
        try {
            render(container, await api('/accounts'), handlers);
        } catch (e) {
            container.innerHTML = `<div class="fin-error">Couldn't load accounts: ${e.message}</div>`;
        }
    }

    function render(container, accounts, handlers = {}) {
        const net = computeNetWorth(accounts);
        const groups = groupByType(accounts);

        container.innerHTML = `
      <div class="flex items-start justify-between mb-7">
        <div>
          <div class="text-[0.55rem] tracking-[0.2em] uppercase text-stone mb-1.5">Net worth</div>
          <div class="font-display text-[2.6rem] font-light leading-none tabular-nums">${gbp(net)}</div>
        </div>
        <button class="bg-warm text-white border-0 rounded-[4px] px-[14px] py-2 font-mono text-[0.6rem] tracking-[0.1em] cursor-pointer" data-fin="add">+ Add</button>
      </div>
      <div>
        ${groups.map(g => `
          <div class="mb-[22px]">
            <div class="flex justify-between items-baseline mb-2">
              <span class="text-[0.56rem] tracking-[0.18em] uppercase text-stone">${g.label}</span>
              <span class="font-mono text-[0.72rem] tabular-nums ${g.subtotal < 0 ? 'text-signal-light' : 'text-ink'}">${gbp(g.subtotal)}</span>
            </div>
            ${g.items.map(a => `
              <div class="flex justify-between items-center bg-white border border-ink/12 rounded-[4px] px-[14px] py-3 mb-1.5 cursor-pointer" data-account-id="${a.id}">
                <div class="text-[0.8rem]">
                  ${a.nickname}${a.provider ? `<span class="block text-[0.58rem] text-stone mt-0.5">${a.provider}</span>` : ''}
                </div>
                <div class="font-mono text-[0.85rem] tabular-nums ${a.is_liability ? 'text-signal-light' : ''}">
                  ${a.is_liability ? '−' : ''}${gbp(a.balance ?? 0)}
                </div>
              </div>`).join('')}
          </div>`).join('')}
        ${groups.length === 0 ? '<div class="fin-empty">No accounts yet — add your first to see your net worth.</div>' : ''}
      </div>`;

        const addBtn = container.querySelector('[data-fin="add"]');
        if (addBtn && handlers.onAdd) addBtn.onclick = handlers.onAdd;
        container.querySelectorAll('[data-account-id]').forEach(row => {
            row.onclick = () => handlers.onUpdate?.(accounts.find(a => a.id === row.dataset.accountId));
        });
    }

    global.createFinance = function createFinance() {
        return { load, render, computeNetWorth, groupByType, api };
    };
})(window);