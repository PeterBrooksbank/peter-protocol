// finance/views/dashboard.js — Dashboard tab: cashflow, net worth, budget-vs-actual, cliffs, nudges

import * as api from '../api/client.js';
import { computePersonIncome } from '../engine/tax-engine.js';
import { projectBalance, monthsBetween } from '../engine/projections.js';
import { penceToCompact, penceToDisplay } from '../models/money.js';
import { formatMonth } from '../models/dates.js';
import { groupedBarChart } from '../components/charts.js';
import { esc, loadingState, errorState } from '../components/ui.js';

const TODAY = new Date().toISOString().slice(0, 10);
const THIS_MONTH = TODAY.slice(0, 7);
const HISTORY_MONTHS = 6;

export function mount(el) {
  el.innerHTML = loadingState('dashboard');
  load(el);
}

async function load(el) {
  try {
    const months = lastNMonths(HISTORY_MONTHS);

    const [accounts, incomeThisMonth, budgetHistory] = await Promise.all([
      api.getAccounts(),
      api.getIncome(THIS_MONTH),
      Promise.all(months.map(m => api.getBudget(m).then(b => ({ month: m, ...b })))),
    ]);

    const householdSettings = {
      claim_child_benefit:     !!incomeThisMonth.settings.claim_child_benefit,
      num_children:            incomeThisMonth.settings.num_children ?? 0,
      uses_tax_free_childcare: !!incomeThisMonth.settings.uses_tax_free_childcare,
    };

    // Compute net income per person via the engine
    let totalNetIncome = 0;
    const allCliffs = [];
    for (const person of incomeThisMonth.people) {
      if (!person.is_earner || !person.sources.length) continue;
      const result = computePersonIncome(
        person,
        person.sources.map(toEngineSource),
        person.events,
        householdSettings,
        TODAY,
      );
      totalNetIncome += result.total_net_monthly_pence;
      for (const c of result.cliff_edges) allCliffs.push({ ...c, person: person.display_name });
    }

    // Planned expenses (this month)
    const thisMonthBudget = budgetHistory[budgetHistory.length - 1];
    const plannedExpense = sumPlanned(thisMonthBudget, 'expense');
    const actualExpense  = sumActual(thisMonthBudget, 'expense');
    const uncategorised  = thisMonthBudget.uncategorised_count ?? 0;

    // Net worth
    const projectedAccounts = accounts.map(a => ({ ...a, projected: projected(a) }));
    const assets      = projectedAccounts.filter(a => !a.is_liability).reduce((s,a) => s+a.projected, 0);
    const liabilities = projectedAccounts.filter(a =>  a.is_liability).reduce((s,a) => s+a.projected, 0);
    const netWorth = assets - liabilities;

    const mortgage = sumByType(projectedAccounts, 'mortgage');
    const pension  = sumByType(projectedAccounts, 'pension');
    const savings  = sumByType(projectedAccounts, ['savings','isa','investment']);

    // Stale accounts (>60 days since snapshot)
    const staleAccounts = accounts.filter(a =>
      a.snapshot_date && monthsBetween(a.snapshot_date, TODAY) >= 2
    );

    // Budget-vs-actual chart data
    const chartData = budgetHistory.map(b => ({
      label: fmtMonthShort(b.month),
      planned: sumPlanned(b, 'expense'),
      actual:  sumActual(b, 'expense'),
    }));

    el.innerHTML = `
      <div class="mx-auto max-w-2xl @container @4xl:max-w-4xl px-4 py-6">
        <div class="space-y-5">
          <div class="grid grid-cols-1 gap-5 @2xl:grid-cols-2">
            ${renderCashflowHero(totalNetIncome, plannedExpense, actualExpense)}
            ${renderNetWorthStrip(netWorth, assets, liabilities, mortgage, pension, savings)}
          </div>
          ${renderBudgetChart(chartData)}
          ${renderAlerts(renderCliffs(allCliffs), renderNudges(uncategorised, staleAccounts))}
        </div>
      </div>`;

    el.querySelectorAll('[data-goto]').forEach(btn => {
      btn.onclick = () => window.showFinanceView?.(btn.dataset.goto);
    });
  } catch (err) {
    el.innerHTML = errorState(err);
  }
}

// ── Sections ──────────────────────────────────────────────────────────────────
// Typographic/border/radius language mirrors the Checklist/Supplements tabs:
// rounded-[4px] hairline `ink/12` borders, tracking-[0.2em] mono eyebrow
// labels, font-display for hero figures.

function renderCashflowHero(netIncome, plannedExpense, actualExpense) {
  const surplus = netIncome - plannedExpense;
  return `
    <div class="cursor-pointer rounded-[4px] border border-ink/12 bg-white px-6 py-5 transition-colors hover:border-warm" data-goto="income">
      <div class="mb-3 font-mono text-sm tracking-[0.16em] text-stone uppercase">This month</div>
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <div class="mb-1 font-mono text-sm tracking-[0.06em] text-stone uppercase">Net income</div>
          <div class="font-display text-xl font-light text-ink tabular-nums">${penceToCompact(netIncome)}</div>
        </div>
        <div>
          <div class="mb-1 font-mono text-sm tracking-[0.06em] text-stone uppercase">Planned spend</div>
          <div class="font-display text-xl font-light text-ink tabular-nums">${penceToCompact(plannedExpense)}</div>
          ${actualExpense > 0 ? `<div class="text-sm text-stone tabular-nums">actual ${penceToCompact(actualExpense)}</div>` : ''}
        </div>
        <div>
          <div class="mb-1 font-mono text-sm tracking-[0.06em] text-stone uppercase">Surplus</div>
          <div class="font-display text-xl font-light tabular-nums ${surplus >= 0 ? 'text-moss' : 'text-signal'}">${penceToCompact(surplus)}</div>
        </div>
      </div>
    </div>`;
}

function renderNetWorthStrip(netWorth, assets, liabilities, mortgage, pension, savings) {
  return `
    <div class="cursor-pointer rounded-[4px] border border-ink/12 bg-white px-6 py-5 transition-colors hover:border-warm" data-goto="accounts">
      <div class="mb-3 flex items-baseline justify-between">
        <span class="font-mono text-sm tracking-[0.16em] text-stone uppercase">Net worth</span>
        <span class="font-display text-2xl font-light tracking-tight tabular-nums ${netWorth >= 0 ? 'text-ink' : 'text-signal'}">${penceToCompact(netWorth)}</span>
      </div>
      <div class="grid grid-cols-3 divide-x divide-ink/12 border-t border-ink/12 pt-3 text-center">
        <div class="pr-2">
          <div class="mb-0.5 truncate font-mono text-sm tracking-[0.1em] text-stone uppercase">Mortgage</div>
          <div class="text-sm font-medium text-ink tabular-nums">${penceToCompact(mortgage)}</div>
        </div>
        <div class="px-2">
          <div class="mb-0.5 truncate font-mono text-sm tracking-[0.1em] text-stone uppercase">Pensions</div>
          <div class="text-sm font-medium text-ink tabular-nums">${penceToCompact(pension)}</div>
        </div>
        <div class="pl-2">
          <div class="mb-0.5 truncate font-mono text-sm tracking-[0.1em] text-stone uppercase">Savings</div>
          <div class="text-sm font-medium text-ink tabular-nums">${penceToCompact(savings)}</div>
        </div>
      </div>
    </div>`;
}

function renderBudgetChart(chartData) {
  return `
    <div class="cursor-pointer rounded-[4px] border border-ink/12 bg-white px-6 py-5 transition-colors hover:border-warm" data-goto="budget">
      <div class="mb-3 font-mono text-sm tracking-[0.16em] text-stone uppercase">Budget vs actual</div>
      ${groupedBarChart({ data: chartData })}
    </div>`;
}

function renderCliffs(cliffs) {
  if (!cliffs.length) return '';
  return `
    <div class="cursor-pointer rounded-[4px] border border-warm bg-warm/5 px-6 py-5 transition-colors hover:border-warm" data-goto="income">
      <div class="mb-2 font-mono text-sm tracking-[0.16em] text-stone uppercase">Cliff-edge alerts</div>
      <div class="space-y-1">
        ${cliffs.map(c => `
          <div class="text-sm text-ink">
            <strong class="font-medium">${esc(c.person)}</strong> — ${c.label}
            (${c.direction === 'approaching' ? penceToCompact(Math.abs(c.distance_pence)) + ' below' : penceToCompact(Math.abs(c.distance_pence)) + ' above'})
          </div>`).join('')}
      </div>
    </div>`;
}

function renderNudges(uncategorised, staleAccounts) {
  if (!uncategorised && !staleAccounts.length) return '';
  return `
    <div class="space-y-2">
      ${uncategorised ? `
        <div class="flex cursor-pointer items-center justify-between rounded-[4px] border border-ink/12 bg-white px-6 py-4 transition-colors hover:border-warm" data-goto="budget">
          <span class="text-sm text-ink">${uncategorised} uncategorised transaction${uncategorised > 1 ? 's' : ''}</span>
          <span class="font-mono text-sm tracking-[0.1em] text-warm uppercase">Review →</span>
        </div>` : ''}
      ${staleAccounts.length ? `
        <div class="flex cursor-pointer items-center justify-between rounded-[4px] border border-ink/12 bg-white px-6 py-4 transition-colors hover:border-warm" data-goto="accounts">
          <span class="text-sm text-ink">${staleAccounts.length} balance${staleAccounts.length > 1 ? 's' : ''} need updating</span>
          <span class="font-mono text-sm tracking-[0.1em] text-warm uppercase">Log fresh balances →</span>
        </div>` : ''}
    </div>`;
}

// Places the cliffs alert and nudges stack side-by-side once the dashboard's
// container is wide enough for two columns; stacks them on narrow containers.
function renderAlerts(cliffsHtml, nudgesHtml) {
  if (!cliffsHtml && !nudgesHtml) return '';
  if (cliffsHtml && nudgesHtml) {
    return `<div class="grid grid-cols-1 gap-5 @2xl:grid-cols-2">${cliffsHtml}${nudgesHtml}</div>`;
  }
  return cliffsHtml || nudgesHtml;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastNMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function sumPlanned(budget, kind) {
  return budget.categories
    .filter(c => c.kind === kind)
    .flatMap(c => c.lines)
    .reduce((s, l) => s + (l.planned_monthly_pence ?? 0), 0);
}

function sumActual(budget, kind) {
  return budget.categories
    .filter(c => c.kind === kind)
    .flatMap(c => c.lines)
    .reduce((s, l) => s + (l.actual_pence ?? 0), 0);
}

function sumByType(accounts, types) {
  const list = Array.isArray(types) ? types : [types];
  return accounts.filter(a => list.includes(a.type)).reduce((s, a) => s + a.projected, 0);
}

function projected(a) {
  if (a.snapshot_balance_pence == null) return 0;
  const { balance_pence } = projectBalance({
    snapshotPence:       a.snapshot_balance_pence,
    snapshotDate:        a.snapshot_date ?? TODAY,
    toDate:              TODAY,
    mode:                a.projection_mode ?? 'manual',
    monthlyContribPence: a.projected_monthly_contrib_pence ?? a.monthly_contribution_pence ?? 0,
    monthlyPaymentPence: a.monthly_contribution_pence ?? 0,
    annualRateBps:       a.interest_rate_bps ?? a.growth_rate_bps ?? 0,
  });
  return balance_pence;
}

function toEngineSource(s) {
  return {
    id: s.id, name: s.name, kind: s.kind,
    tax_code: s.tax_code ?? '1257L',
    tax_code_allowance_pence: s.tax_code_allowance_pence ?? null,
    is_primary: s.is_primary,
    pension_method:    s.pension_method    ?? 'none',
    pension_ee_type:   s.pension_ee_type   ?? 'pct',
    pension_ee_value:  s.pension_ee_value  ?? 0,
    pension_er_type:   s.pension_er_type   ?? 'pct',
    pension_er_value:  s.pension_er_value  ?? 0,
    student_loan_plan: s.student_loan_plan ?? 'none',
    gross_monthly_pence: s.entry?.gross_monthly_pence ?? 0,
  };
}

const fmtMonthShort = (s) => formatMonth(s, { year: false });
