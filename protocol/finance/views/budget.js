// finance/views/budget.js — Budget tab: categories, lines, planned vs actual, import

import * as api from '../api/client.js';
import { autoMatch, deriveRule } from '../engine/budget-match.js';
import { penceToDisplay, penceToCompact } from '../models/money.js';
import { formatMonth } from '../models/dates.js';
import { openImportWizard } from '../import/csv-import.js';
import { modal, field, textInput, select, twoCol, val, bool } from '../components/forms.js';
import { esc, loadingState, errorState, actionLink, overlay as baseOverlay } from '../components/ui.js';

export function mount(el) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  el.dataset.month = thisMonth;
  el.innerHTML = loadingState('budget');
  load(el, thisMonth);
}

async function load(el, month) {
  try {
    const [{ categories, uncategorised_count }, accounts, lines] = await Promise.all([
      api.getBudget(month),
      api.getAccounts(),
      api.getBudgetLines(),
    ]);

    const totals = computeTotals(categories);

    el.innerHTML = `
      <div class="mx-auto max-w-2xl px-4 py-6">
        <!-- Month nav + import -->
        <div class="mb-6 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button data-act="prev-month" class="px-2 text-stone hover:text-ink">←</button>
            <span class="font-medium text-ink">${formatMonth(month, { month: 'long' })}</span>
            <button data-act="next-month" class="px-2 text-stone hover:text-ink">→</button>
          </div>
          <div class="flex items-center gap-3">
            ${uncategorised_count > 0
              ? actionLink(`Review ${uncategorised_count} unmatched`, { data: { act: 'review' }, tone: 'warm' })
              : ''}
            <button data-act="import" class="rounded border border-warm-light px-3 py-1.5 text-sm text-ink hover:bg-warm-light">
              Import statement
            </button>
          </div>
        </div>

        <!-- Summary bar -->
        ${renderSummary(totals)}

        <!-- Categories -->
        <div id="cat-list" class="mt-6 space-y-6">
          ${categories.length === 0
            ? '<p class="py-8 text-center text-sm text-stone">No budget categories yet.</p>'
            : categories.map(c => renderCategory(c, month)).join('')}
        </div>

        <!-- Add category -->
        <div class="mt-6 border-t border-warm-light pt-4">
          ${actionLink('+ Add category', { data: { act: 'add-cat' }, size: 'sm' })}
        </div>
      </div>`;

    bindHandlers(el, month, categories, lines, accounts, () => load(el, month));
  } catch (err) {
    el.innerHTML = errorState(err);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderSummary(totals) {
  const surplus = totals.plannedIncome - totals.plannedExpense;
  return `
    <div class="rounded-lg border border-warm-light px-5 py-4">
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <div class="mb-1 text-xs tracking-wide text-stone uppercase">Planned in</div>
          <div class="font-medium text-ink">${penceToCompact(totals.plannedIncome)}</div>
          ${totals.actualIncome > 0 ? `<div class="text-xs text-stone">actual ${penceToCompact(totals.actualIncome)}</div>` : ''}
        </div>
        <div>
          <div class="mb-1 text-xs tracking-wide text-stone uppercase">Planned spend</div>
          <div class="font-medium text-ink">${penceToCompact(totals.plannedExpense)}</div>
          ${totals.actualExpense > 0 ? `<div class="text-xs ${totals.actualExpense > totals.plannedExpense ? 'text-signal' : 'text-stone'}">actual ${penceToCompact(totals.actualExpense)}</div>` : ''}
        </div>
        <div>
          <div class="mb-1 text-xs tracking-wide text-stone uppercase">Surplus</div>
          <div class="font-medium ${surplus >= 0 ? 'text-ink' : 'text-signal'}">${penceToCompact(surplus)}</div>
        </div>
      </div>
    </div>`;
}

function renderCategory(cat, month) {
  const catPlanned = cat.lines.reduce((s, l) => s + (l.planned_monthly_pence ?? 0), 0);
  const catActual  = cat.lines.reduce((s, l) => s + (l.actual_pence ?? 0), 0);
  const over = catActual > catPlanned && catPlanned > 0;

  return `
    <div data-cat="${cat.id}">
      <div class="mb-2 flex items-baseline justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium tracking-wide text-stone uppercase">${esc(cat.name)}</span>
          <span class="text-xs text-stone">${cat.kind}</span>
          ${actionLink('edit', { data: { act: 'edit-cat', id: cat.id } })}
        </div>
        <div class="text-sm ${over ? 'text-signal font-medium' : 'text-stone'}">
          ${catActual > 0 ? `${penceToCompact(catActual)} / ` : ''}${penceToCompact(catPlanned)}
        </div>
      </div>
      <div class="divide-y divide-warm-light rounded-lg border border-warm-light">
        ${cat.lines.map(l => renderLine(l, cat)).join('')}
        <div class="px-4 py-2.5">
          ${actionLink('+ Add line', { data: { act: 'add-line', cat: cat.id } })}
        </div>
      </div>
    </div>`;
}

function renderLine(line, cat) {
  const planned = line.planned_monthly_pence ?? 0;
  const actual  = line.actual_pence ?? 0;
  const pct     = planned > 0 ? Math.min(100, Math.round(actual / planned * 100)) : (actual > 0 ? 100 : 0);
  const over    = actual > planned && planned > 0;

  return `
    <div class="flex items-center gap-3 px-4 py-2.5" data-line="${line.id}">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-sm text-ink">${esc(line.name)}</span>
          ${line.match_rule ? `<span class="font-mono text-xs text-stone">${esc(line.match_rule)}</span>` : ''}
          ${actionLink('edit', { data: { act: 'edit-line', id: line.id } })}
        </div>
        ${planned > 0 ? `
        <div class="mt-1 h-1 overflow-hidden rounded bg-warm-light">
          <div class="h-full rounded ${over ? 'bg-signal' : 'bg-warm'}" style="width:${pct}%"></div>
        </div>` : ''}
      </div>
      <div class="shrink-0 text-right">
        ${actual > 0
          ? `<span class="text-sm ${over ? 'text-signal font-medium' : 'text-ink'}">${penceToDisplay(actual)}</span>
             ${planned > 0 ? `<span class="text-xs text-stone"> / ${penceToDisplay(planned)}</span>` : ''}`
          : `<span class="text-sm text-stone">${penceToDisplay(planned)}</span>`}
        ${line.txn_count > 0 ? `<div class="text-xs text-stone">${line.txn_count} txn${line.txn_count > 1 ? 's' : ''}</div>` : ''}
      </div>
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindHandlers(el, month, categories, lines, accounts, reload) {
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'prev-month')  gotoMonth(el, month, -1, reload);
    if (act === 'next-month')  gotoMonth(el, month, +1, reload);
    if (act === 'add-cat')     addCategoryModal(reload);
    if (act === 'edit-cat')    editCategoryModal(categories.find(c => c.id === btn.dataset.id), reload);
    if (act === 'add-line')    addLineModal(btn.dataset.cat, categories, reload);
    if (act === 'edit-line')   editLineModal(lines.find(l => l.id === btn.dataset.id), categories, reload);
    if (act === 'import')      importStatement(accounts, lines, month, reload);
    if (act === 'review')      reviewTransactions(month, lines, categories, reload);
  });
}

function gotoMonth(el, current, delta, reload) {
  const [y, m] = current.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  el.dataset.month = next;
  el.innerHTML = loadingState();
  load(el, next);
}

// ── Category modals ───────────────────────────────────────────────────────────

function addCategoryModal(reload) {
  modal({
    title: 'Add category',
    bodyHtml: `
      ${field('Name', textInput('name', '', 'e.g. Bills'))}
      ${field('Kind', select('kind', [['expense','Expense'],['income','Income']], 'expense'))}`,
    submitLabel: 'Add',
    async onSubmit(o, close) {
      const name = val(o, 'name');
      if (!name) throw new Error('Name required');
      await api.addBudgetCategory({ name, kind: val(o, 'kind') });
      close(); reload();
    },
  });
}

function editCategoryModal(cat, reload) {
  modal({
    title: `Edit: ${cat.name}`,
    bodyHtml: `
      ${field('Name', textInput('name', cat.name))}
      ${field('Kind', select('kind', [['expense','Expense'],['income','Income']], cat.kind))}`,
    submitLabel: 'Save',
    async onSubmit(o, close) {
      await api.patchBudgetCategory(cat.id, { name: val(o, 'name'), kind: val(o, 'kind') });
      close(); reload();
    },
  });
}

// ── Line modals ───────────────────────────────────────────────────────────────

function addLineModal(catId, categories, reload) {
  const catOptions = categories.map(c => [c.id, `${c.name} (${c.kind})`]);
  modal({
    title: 'Add budget line',
    bodyHtml: `
      ${field('Name', textInput('name', '', 'e.g. Netflix'))}
      ${twoCol(
        field('Planned amount (£/mo)', textInput('planned', '', 'e.g. 10.99')),
        field('Match rule', textInput('match_rule', '', 'e.g. NETFLIX'))
      )}
      ${field('Category', select('category_id', catOptions, catId))}`,
    submitLabel: 'Add line',
    async onSubmit(o, close) {
      const name = val(o, 'name');
      if (!name) throw new Error('Name required');
      const plannedStr = val(o, 'planned');
      const plannedPence = plannedStr ? Math.round(parseFloat(plannedStr) * 100) : 0;
      await api.addBudgetLine({
        name, category_id: val(o, 'category_id'),
        planned_monthly_pence: plannedPence,
        match_rule: val(o, 'match_rule') || null,
      });
      close(); reload();
    },
  });
}

function editLineModal(line, categories, reload) {
  if (!line) return;
  const catOptions = categories.map(c => [c.id, `${c.name} (${c.kind})`]);
  modal({
    title: `Edit: ${line.name}`,
    bodyHtml: `
      ${field('Name', textInput('name', line.name))}
      ${twoCol(
        field('Planned (£/mo)', textInput('planned', line.planned_monthly_pence ? (line.planned_monthly_pence / 100).toFixed(2) : '')),
        field('Match rule', textInput('match_rule', line.match_rule ?? ''))
      )}
      ${field('Category', select('category_id', catOptions, line.category_id))}`,
    submitLabel: 'Save',
    async onSubmit(o, close) {
      const plannedStr = val(o, 'planned');
      await api.patchBudgetLine(line.id, {
        name:                  val(o, 'name'),
        planned_monthly_pence: plannedStr ? Math.round(parseFloat(plannedStr) * 100) : 0,
        match_rule:            val(o, 'match_rule') || null,
        category_id:           val(o, 'category_id'),
      });
      close(); reload();
    },
  });
}

// ── Import + review ───────────────────────────────────────────────────────────

async function importStatement(accounts, budgetLines, month, reload) {
  openImportWizard(accounts, async ({ rows, account_id, bank, filename, period_month }) => {
    const result = await fetch('/api/finance/statements/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id, bank, filename, period_month: period_month || month, rows }),
    }).then(r => r.json());
    if (result.error) throw new Error(result.error);
    // Auto-open review screen for the imported statement
    const txns = await api.getBudgetLines; // get fresh lines
    reload();
    // Open review for the month
    const allLines = await fetch('/api/finance/budget-lines').then(r => r.json());
    const newTxns  = await fetch(`/api/finance/transactions?statement_id=${result.statement_id}`).then(r => r.json());
    reviewTransactionsFromImport(newTxns, allLines, reload);
  });
}

function reviewTransactions(month, budgetLines, categories, reload) {
  fetch(`/api/finance/transactions?month=${month}`)
    .then(r => r.json())
    .then(txns => reviewTransactionsFromImport(txns, budgetLines, reload));
}

function reviewTransactionsFromImport(txns, budgetLines, reload) {
  const matched  = autoMatch(txns, budgetLines);
  const unmatched = matched.filter(t => !t.budget_line_id && !t.matched_line && t.txn_class !== 'transfer' && t.txn_class !== 'ignore');
  const autoable  = matched.filter(t => !t.budget_line_id && t.matched_line);
  const alreadyDone = matched.filter(t => t.budget_line_id || t.txn_class === 'transfer' || t.txn_class === 'ignore');

  const lineOpts = budgetLines.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');

  const { overlay, close: closeOverlay } = baseOverlay({
    title: 'Review transactions',
    maxWidth: 'max-w-2xl',
    headerExtra: `
          <span class="text-xs text-stone">${unmatched.length} need review</span>
          <button id="rev-save" class="rounded bg-ink px-4 py-1.5 text-sm text-paper hover:bg-stone">Done</button>`,
    bodyClass: 'px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto',
    bodyHtml: `
        ${autoable.length ? `
          <div>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-medium tracking-wide text-stone uppercase">Auto-matched (${autoable.length})</h3>
              <button id="rev-apply-auto" class="text-xs text-warm underline hover:text-ink">Apply all matches</button>
            </div>
            <div class="divide-y divide-warm-light rounded border border-warm-light">
              ${autoable.map(t => `
                <div class="flex items-center gap-3 px-3 py-2 text-xs">
                  <span class="flex-1 truncate font-mono text-ink">${esc(t.description)}</span>
                  <span class="${t.amount_pence < 0 ? 'text-signal' : 'text-ink'} shrink-0">${penceToDisplay(Math.abs(t.amount_pence))}</span>
                  <span class="shrink-0 text-stone">→ ${esc(t.matched_line?.name ?? '')}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}

        ${unmatched.length ? `
          <div>
            <h3 class="mb-2 text-xs font-medium tracking-wide text-stone uppercase">Needs action (${unmatched.length})</h3>
            <div class="space-y-2">
              ${unmatched.map(t => `
                <div class="rounded border border-warm/50 px-3 py-2" data-txn="${t.id}">
                  <div class="mb-2 flex items-start gap-2">
                    <span class="flex-1 truncate font-mono text-xs text-ink">${esc(t.description)}</span>
                    <span class="text-xs ${t.amount_pence < 0 ? 'text-signal' : 'text-ink'} shrink-0">${penceToDisplay(Math.abs(t.amount_pence))}</span>
                    <span class="shrink-0 text-xs text-stone">${t.date}</span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <select data-role="line" class="rounded border border-warm-light bg-paper px-2 py-1 text-xs">
                      <option value="">Assign to line…</option>
                      ${lineOpts}
                    </select>
                    <button data-role="new-line" class="rounded border border-warm-light px-2 py-1 text-xs hover:bg-warm-light">New line</button>
                    <button data-role="income"   class="rounded border border-warm-light px-2 py-1 text-xs hover:bg-warm-light ${t.txn_class === 'income'   ? 'bg-warm-light' : ''}">Income</button>
                    <button data-role="transfer" class="rounded border border-warm-light px-2 py-1 text-xs hover:bg-warm-light ${t.txn_class === 'transfer' ? 'bg-warm-light' : ''}">Transfer</button>
                    <button data-role="ignore"   class="rounded border border-warm-light px-2 py-1 text-xs hover:bg-warm-light ${t.txn_class === 'ignore'   ? 'bg-warm-light' : ''}">Ignore</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>` : '<p class="py-4 text-center text-sm text-stone">All transactions matched ✓</p>'}

        ${alreadyDone.length ? `
          <div>
            <h3 class="mb-2 text-xs font-medium tracking-wide text-stone uppercase">Already categorised (${alreadyDone.length})</h3>
            <div class="text-xs text-stone">Showing ${Math.min(alreadyDone.length, 3)} of ${alreadyDone.length}…</div>
          </div>` : ''}`,
  });

  const close = () => { closeOverlay(); reload(); };
  overlay.querySelector('[data-act="close"]').onclick = close;

  overlay.querySelector('#rev-apply-auto')?.addEventListener('click', async () => {
    const assignments = autoable.map(t => ({
      id:             t.id,
      budget_line_id: t.matched_line.id,
      category_id:    t.matched_line.category_id,
      txn_class:      t.amount_pence < 0 ? 'expense' : 'income',
    }));
    await fetch('/api/finance/transactions/match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    close();
  });

  // Tag buttons
  overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-role]');
    if (!btn) return;
    const row = btn.closest('[data-txn]');
    if (!row) return;
    const role = btn.dataset.role;
    if (role === 'income' || role === 'transfer' || role === 'ignore') {
      btn.classList.toggle('bg-warm-light');
      row.dataset.class = role;
    }
    if (role === 'new-line') {
      const description = row.querySelector('.font-mono').textContent;
      const suggestedRule = deriveRule(description);
      modal({
        title: 'Promote to budget line',
        bodyHtml: `
          ${field('Line name', textInput('line_name', suggestedRule))}
          ${field('Match rule', textInput('match_rule', suggestedRule))}
          ${field('Planned amount (£/mo)', textInput('planned', ''))}
          ${field('Category', select('cat_id', budgetLines.filter((v,i,a) => a.findIndex(x=>x.category_id===v.category_id)===i).map(l => [l.category_id, l.category_name])))}`,
        submitLabel: 'Create line',
        async onSubmit(o, c) {
          const name = val(o, 'line_name');
          if (!name) throw new Error('Name required');
          const plannedStr = val(o, 'planned');
          const { id: lineId, category_id: catId } = await api.addBudgetLine({
            name,
            category_id: val(o, 'cat_id'),
            planned_monthly_pence: plannedStr ? Math.round(parseFloat(plannedStr) * 100) : 0,
            match_rule: val(o, 'match_rule') || null,
          });
          // Update the row's select to show this new line
          row.dataset.lineId = lineId;
          row.dataset.catId  = catId ?? val(o, 'cat_id');
          c();
        },
      });
    }
  });

  // Line select change
  overlay.querySelectorAll('[data-role="line"]').forEach(sel => {
    sel.onchange = () => {
      const row = sel.closest('[data-txn]');
      if (row) row.dataset.lineId = sel.value;
    };
  });

  // Save all decisions
  overlay.querySelector('#rev-save').onclick = async () => {
    const assignments = [];
    overlay.querySelectorAll('[data-txn]').forEach(row => {
      const id      = row.dataset.txn;
      const lineId  = row.dataset.lineId || row.querySelector('[data-role="line"]')?.value || null;
      const cls     = row.dataset.class ?? (lineId ? 'expense' : null);
      if (lineId || cls) {
        assignments.push({
          id,
          budget_line_id: lineId || null,
          category_id:    row.dataset.catId || null,
          txn_class:      cls ?? 'expense',
        });
      }
    });
    if (assignments.length) {
      await fetch('/api/finance/transactions/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      });
    }
    close();
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeTotals(categories) {
  let plannedExpense = 0, actualExpense = 0, plannedIncome = 0, actualIncome = 0;
  for (const cat of categories) {
    for (const l of cat.lines) {
      if (cat.kind === 'expense') {
        plannedExpense += l.planned_monthly_pence ?? 0;
        actualExpense  += l.actual_pence ?? 0;
      } else {
        plannedIncome += l.planned_monthly_pence ?? 0;
        actualIncome  += l.actual_pence ?? 0;
      }
    }
  }
  return { plannedExpense, actualExpense, plannedIncome, actualIncome };
}
