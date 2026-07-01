// finance/views/accounts.js — Accounts tab: balances, projections, net worth

import * as api from '../api/client.js';import { projectBalance, monthsBetween } from '../engine/projections.js';
import { penceToDisplay, penceToCompact } from '../models/money.js';
import { formatDate } from '../models/dates.js';
import { modal, field, textInput, numberInput, select, checkbox, twoCol, val, num, bool } from '../components/forms.js';
import { esc, loadingState, errorState, actionLink } from '../components/ui.js';

const TODAY = new Date().toISOString().slice(0, 10);

// Account type metadata
const TYPE_META = {
  current:      { label: 'Current accounts',   liability: false, defaultMode: 'manual' },
  savings:      { label: 'Savings',             liability: false, defaultMode: 'contribution' },
  isa:          { label: 'ISAs',                liability: false, defaultMode: 'contribution' },
  investment:   { label: 'Investments',         liability: false, defaultMode: 'contribution' },
  pension:      { label: 'Pensions',            liability: false, defaultMode: 'pension' },
  student_loan: { label: 'Student loans',       liability: true,  defaultMode: 'amortising' },
  mortgage:     { label: 'Mortgage',            liability: true,  defaultMode: 'amortising' },
  other:        { label: 'Other',               liability: false, defaultMode: 'manual' },
};
const GROUP_ORDER = ['mortgage','student_loan','pension','isa','savings','investment','current','other'];

export function mount(el) {
  el.innerHTML = loadingState('accounts');
  load(el);
}

async function load(el) {
  try {
    const accounts = await api.getAccounts();
    el.innerHTML = `
      <div class="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div id="net-worth"></div>
        <div id="account-groups" class="space-y-6"></div>
        <div class="border-t border-ink/12 pt-2">
          ${actionLink('+ Add account', { data: { act: 'add' }, size: 'sm' })}
        </div>
      </div>`;

    renderNetWorth(el.querySelector('#net-worth'), accounts);
    renderGroups(el.querySelector('#account-groups'), accounts);

    el.querySelector('[data-act="add"]').onclick = () => addAccountModal(accounts, () => load(el));
    el.querySelectorAll('[data-act="log"]').forEach(btn => {
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if (acc) btn.onclick = () => logBalanceModal(acc, () => load(el));
    });
    el.querySelectorAll('[data-act="configure"]').forEach(btn => {
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if (acc) btn.onclick = () => configureAccountModal(acc, accounts, () => load(el));
    });
  } catch (err) {
    el.innerHTML = errorState(err);
  }
}

// ── Net worth ─────────────────────────────────────────────────────────────────

function renderNetWorth(el, accounts) {
  const assets      = accounts.filter(a => !a.is_liability).map(a => projected(a)).reduce((s,v) => s+v, 0);
  const liabilities = accounts.filter(a =>  a.is_liability).map(a => projected(a)).reduce((s,v) => s+v, 0);
  const net = assets - liabilities;

  el.innerHTML = `
    <div class="rounded-[4px] border border-ink/12 bg-white px-6 py-4">
      <div class="flex items-baseline justify-between">
        <span class="font-mono text-sm tracking-[0.16em] text-stone uppercase">Net worth</span>
        <span class="font-display text-2xl font-light tracking-tight tabular-nums ${net >= 0 ? 'text-ink' : 'text-signal'}">${penceToCompact(net)}</span>
      </div>
      <div class="mt-2 flex gap-6 font-mono text-sm tracking-[0.06em] text-stone">
        <span>Assets <strong class="text-ink tabular-nums">${penceToCompact(assets)}</strong></span>
        <span>Liabilities <strong class="text-ink tabular-nums">${penceToCompact(liabilities)}</strong></span>
      </div>
    </div>`;
}

// ── Account groups ────────────────────────────────────────────────────────────

function renderGroups(el, accounts) {
  const byType = {};
  for (const a of accounts) {
    (byType[a.type] ??= []).push(a);
  }

  for (const type of GROUP_ORDER) {
    const group = byType[type];
    if (!group?.length) continue;
    const meta = TYPE_META[type] ?? { label: type };
    const subtotal = group.reduce((s, a) => s + projected(a), 0);

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="mb-2 flex items-baseline justify-between">
        <h3 class="font-mono text-sm tracking-[0.16em] text-stone uppercase">${meta.label}</h3>
        <span class="text-sm font-medium text-ink tabular-nums">${penceToCompact(subtotal)}</span>
      </div>
      <div class="divide-y divide-ink/12 rounded-[4px] border border-ink/12 bg-white">
        ${group.map(a => renderAccount(a)).join('')}
      </div>`;
    el.appendChild(div);
  }
}

function renderAccount(a) {
  const bal    = projected(a);
  const months = a.snapshot_date ? monthsBetween(a.snapshot_date, TODAY) : 0;
  const stale  = months > 60; // > 5 months since last real snapshot
  const isProjected = months > 0 && a.projection_mode !== 'manual';

  const balLabel = isProjected ? `${penceToCompact(bal)} <span class="text-sm text-stone">(est)</span>` : penceToCompact(bal);
  const snapshotInfo = a.snapshot_date
    ? `Logged ${formatDate(a.snapshot_date)}${stale ? ' — <span class="text-warm">update needed</span>' : ''}`
    : '<span class="text-warm">No balance logged yet</span>';

  return `
    <div class="flex items-start justify-between px-4 py-3" data-account="${a.id}">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-sm font-medium text-ink">${esc(a.nickname)}</span>
          ${a.owner_name ? `<span class="text-sm text-stone">${esc(a.owner_name)}</span>` : ''}
          ${a.provider   ? `<span class="text-sm text-stone">· ${esc(a.provider)}</span>` : ''}
        </div>
        <div class="mt-0.5 text-sm text-stone">${projectionLabel(a)} · ${snapshotInfo}</div>
      </div>
      <div class="ml-4 shrink-0 text-right">
        <div class="text-sm font-medium text-ink tabular-nums">${balLabel}</div>
        <div class="mt-1 flex justify-end gap-3">
          ${actionLink('Log balance', { data: { act: 'log', id: a.id } })}
          ${actionLink('Configure', { data: { act: 'configure', id: a.id } })}
        </div>
      </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function projected(a) {
  if (!a.snapshot_balance_pence && a.snapshot_balance_pence !== 0) return 0;
  const { balance_pence } = projectBalance({
    snapshotPence:       a.snapshot_balance_pence,
    snapshotDate:        a.snapshot_date ?? TODAY,
    toDate:              TODAY,
    mode:                a.projection_mode ?? 'manual',
    monthlyContribPence: a.projected_monthly_contrib_pence ?? a.monthly_contribution_pence ?? 0,
    monthlyPaymentPence: a.monthly_contribution_pence ?? 0, // for amortising
    annualRateBps:       a.interest_rate_bps ?? a.growth_rate_bps ?? 0,
  });
  return balance_pence;
}

function projectionLabel(a) {
  switch (a.projection_mode) {
    case 'pension':      return `Pension · +${penceToDisplay(a.projected_monthly_contrib_pence ?? 0)}/mo`;
    case 'amortising':   return `Amortising · ${(a.interest_rate_bps ?? 0) / 100}% · −${penceToDisplay(a.monthly_contribution_pence ?? 0)}/mo`;
    case 'contribution': return `Saving · +${penceToDisplay(a.monthly_contribution_pence ?? 0)}/mo`;
    default:             return 'Manual';
  }
}

// ── Modals ────────────────────────────────────────────────────────────────────

const TYPES = Object.entries(TYPE_META).map(([v, m]) => [v, m.label.replace(/s$/, '')]);
const PROJ_MODES = [
  ['manual',       'Manual (no projection)'],
  ['pension',      'Pension (contributions from income source)'],
  ['amortising',   'Amortising (mortgage/loan)'],
  ['contribution', 'Savings/investment (regular contributions)'],
];

function addAccountModal(accounts, reload) {
  modal({
    title: 'Add account',
    bodyHtml: `
      ${twoCol(
        field('Nickname', textInput('nickname', '', 'e.g. Family mortgage')),
        field('Type', select('type', TYPES, 'current'))
      )}
      ${field('Provider', textInput('provider', '', 'e.g. HSBC (optional)'))}
      ${field('Opening balance (£)', textInput('opening_balance', '', 'e.g. 295000'))}
      <p class="mt-1 mb-4 text-sm text-stone">Configure projections after adding.</p>`,
    submitLabel: 'Add account',
    async onSubmit(o, close) {
      const nickname = val(o, 'nickname');
      const type     = val(o, 'type');
      if (!nickname) throw new Error('Nickname required');
      const balStr = val(o, 'opening_balance');
      const balP   = balStr ? Math.round(parseFloat(balStr.replace(/[£,]/g, '')) * 100) : null;
      const meta = TYPE_META[type] ?? {};
      await api.addAccount({
        nickname, type,
        provider: val(o, 'provider') || null,
        is_liability: meta.liability ? 1 : 0,
        projection_mode: meta.defaultMode ?? 'manual',
        opening_balance_pence: balP,
      });
      close(); reload();
    },
  });
}

function logBalanceModal(account, reload) {
  const today = TODAY;
  modal({
    title: `Log balance: ${account.nickname}`,
    bodyHtml: `
      ${twoCol(
        field('Real balance (£)', textInput('balance', '', 'e.g. 294250')),
        field('As of date', `<input name="as_of_date" type="date" value="${today}"
          class="w-full rounded-[3px] border border-ink/12 bg-paper px-3 py-2 text-sm">`)
      )}
      ${field('Note (optional)', textInput('note', ''))}`,
    submitLabel: 'Log balance',
    async onSubmit(o, close) {
      const balStr = val(o, 'balance');
      if (!balStr) throw new Error('Balance required');
      const balP = Math.round(parseFloat(balStr.replace(/[£,]/g, '')) * 100);
      await api.addSnapshot({
        account_id: account.id,
        balance_pence: balP,
        as_of_date: val(o, 'as_of_date') || today,
        note: val(o, 'note') || null,
      });
      close(); reload();
    },
  });
}

function configureAccountModal(account, allAccounts, reload) {
  // Gather income sources from accounts that are pensions (for linking)
  // We don't have people data here so we show a text field as fallback
  const mode = account.projection_mode ?? 'manual';

  modal({
    title: `Configure: ${account.nickname}`,
    bodyHtml: `
      ${twoCol(
        field('Nickname', textInput('nickname', account.nickname)),
        field('Provider', textInput('provider', account.provider ?? ''))
      )}
      ${field('Projection mode', select('proj_mode', PROJ_MODES, mode))}

      <div id="pension-cfg" class="${mode === 'pension' ? '' : 'hidden'}">
        ${field('Linked income source ID',
          textInput('linked_income_source_id', account.linked_income_source_id ?? ''),
          'Paste the income source ID to auto-derive monthly contributions')}
        ${field('Growth rate (% per year, optional)', textInput('growth_rate', account.growth_rate_bps ? (account.growth_rate_bps / 100).toFixed(2) : '', 'e.g. 7'))}
      </div>

      <div id="amortising-cfg" class="${mode === 'amortising' ? '' : 'hidden'}">
        ${twoCol(
          field('Monthly payment (£)', textInput('monthly_payment',
            account.monthly_contribution_pence ? (account.monthly_contribution_pence / 100).toFixed(2) : '')),
          field('Annual interest rate (%)', textInput('interest_rate',
            account.interest_rate_bps ? (account.interest_rate_bps / 100).toFixed(2) : ''))
        )}
      </div>

      <div id="contribution-cfg" class="${mode === 'contribution' ? '' : 'hidden'}">
        ${twoCol(
          field('Monthly contribution (£)', textInput('monthly_contrib',
            account.monthly_contribution_pence ? (account.monthly_contribution_pence / 100).toFixed(2) : '')),
          field('Growth rate (% per year)', textInput('growth_rate_contrib',
            account.growth_rate_bps ? (account.growth_rate_bps / 100).toFixed(2) : '', 'e.g. 5'))
        )}
      </div>`,
    submitLabel: 'Save',
    onMount(o) {
      o.querySelector('[name="proj_mode"]').addEventListener('change', e => {
        o.querySelector('#pension-cfg').classList.toggle('hidden',      e.target.value !== 'pension');
        o.querySelector('#amortising-cfg').classList.toggle('hidden',   e.target.value !== 'amortising');
        o.querySelector('#contribution-cfg').classList.toggle('hidden', e.target.value !== 'contribution');
      });
    },
    async onSubmit(o, close) {
      const projMode = val(o, 'proj_mode');
      const pct = (name) => {
        const s = val(o, name);
        return s ? Math.round(parseFloat(s) * 100) : null;
      };
      const pence = (name) => {
        const s = val(o, name);
        return s ? Math.round(parseFloat(s.replace(/[£,]/g, '')) * 100) : null;
      };

      const update = {
        nickname:          val(o, 'nickname') || account.nickname,
        provider:          val(o, 'provider') || null,
        projection_mode:   projMode,
      };

      if (projMode === 'pension') {
        update.linked_income_source_id = val(o, 'linked_income_source_id') || null;
        update.growth_rate_bps = pct('growth_rate');
      } else if (projMode === 'amortising') {
        update.monthly_contribution_pence = pence('monthly_payment');
        update.interest_rate_bps = pct('interest_rate');
      } else if (projMode === 'contribution') {
        update.monthly_contribution_pence = pence('monthly_contrib');
        update.growth_rate_bps = pct('growth_rate_contrib');
      }

      await api.patchAccount(account.id, update);
      close(); reload();
    },
  });
}
