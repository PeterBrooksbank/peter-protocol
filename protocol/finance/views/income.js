// finance/views/income.js — Income tab: per-person breakdowns with live UK tax engine

import * as api from '../api/client.js';
import { computePersonIncome } from '../engine/tax-engine.js';
import { penceToDisplay, penceToCompact, parsePence, annualToMonthly } from '../models/money.js';
import { formatMonth } from '../models/dates.js';
import { modal, field, textInput, numberInput, monthInput, select, checkbox, twoCol, val, num, bool } from '../components/forms.js';
import { esc, loadingState, errorState, overlay as baseOverlay, actionLink } from '../components/ui.js';

const TODAY = new Date().toISOString().slice(0, 10);
const THIS_MONTH = TODAY.slice(0, 7);

export function mount(el, { onRefresh } = {}) {
  el.innerHTML = loadingState('income');
  load(el, onRefresh);
}

async function load(el, onRefresh) {
  try {
    const { settings, people } = await api.getIncome(THIS_MONTH);
    const householdSettings = {
      claim_child_benefit:      !!settings.claim_child_benefit,
      num_children:             settings.num_children ?? 0,
      uses_tax_free_childcare:  !!settings.uses_tax_free_childcare,
    };

    el.innerHTML = `
      <div class="mx-auto max-w-2xl space-y-8 px-4 py-6">
        ${people.length === 0 ? emptyState() : ''}
        <div id="income-people"></div>
      </div>`;

    const container = el.querySelector('#income-people');
    for (const person of people) {
      const engineResult = person.is_earner && person.sources.length
        ? computePersonIncome(person, person.sources.map(toEngineSource), person.events, householdSettings, TODAY)
        : null;
      container.insertAdjacentHTML('beforeend', renderPerson(person, engineResult));
    }

    bindHandlers(el, people, householdSettings, () => load(el, onRefresh));
  } catch (err) {
    el.innerHTML = errorState(err);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function emptyState() {
  return `<p class="py-8 text-center text-sm text-stone">
    No people yet — add them in Settings (⚙) to get started.
  </p>`;
}

function renderPerson(person, engine) {
  const net = engine?.total_net_monthly_pence;
  const gross = engine?.total_gross_monthly_pence;
  return `
    <div class="overflow-hidden rounded-lg border border-warm-light" data-person="${person.id}">
      <!-- Person header -->
      <div class="flex items-baseline justify-between bg-warm-light/30 px-5 py-4">
        <h2 class="font-display text-xl text-ink">${esc(person.display_name)}</h2>
        ${net != null ? `
          <div class="text-right">
            <span class="text-lg font-medium text-ink">${penceToCompact(net)}<span class="text-sm text-stone">/mo</span></span>
            <span class="ml-2 text-xs text-stone">gross ${penceToCompact(gross)}</span>
          </div>` : ''}
      </div>

      <!-- Cliff-edge alerts -->
      ${engine?.cliff_edges?.length ? renderCliffs(engine.cliff_edges) : ''}

      <!-- Sources -->
      <div class="divide-y divide-warm-light">
        ${person.sources.map(src => {
          const srcEngine = engine?.sources?.find(s => s.source_id === src.id);
          return renderSource(src, srcEngine);
        }).join('')}
      </div>

      <!-- Add source -->
      <div class="border-t border-warm-light bg-paper px-5 py-3">
        ${actionLink('+ Add income source', { data: { act: 'add-source', person: person.id } })}
      </div>

      <!-- One-off events -->
      ${renderEvents(person)}
    </div>`;
}

function renderCliffs(cliffs) {
  return `<div class="space-y-1 border-b border-warm-light bg-warm/10 px-5 py-3">
    ${cliffs.map(c => {
      const dir = c.direction === 'approaching' ? '↑' : '↗';
      const dist = Math.abs(c.distance_pence);
      const msg = c.direction === 'approaching'
        ? `${penceToCompact(dist)} below`
        : `${penceToCompact(dist)} above`;
      return `<div class="flex items-start gap-2 text-xs text-ink">
        <span class="shrink-0 text-warm">${dir}</span>
        <span><strong>${c.label}</strong> — ${msg}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderSource(src, engine) {
  const entry = src.entry;
  if (!entry) {
    return `
      <div class="flex items-center justify-between px-5 py-4" data-source="${src.id}">
        <div>
          <span class="text-sm font-medium text-ink">${esc(src.name)}</span>
          <span class="ml-2 text-xs text-stone">${kindLabel(src.kind)}</span>
          <span class="ml-1 text-xs text-stone">— no entry yet</span>
        </div>
        <div class="flex gap-3 text-xs text-stone">
          ${actionLink('Set salary', { data: { act: 'add-entry', source: src.id } })}
          ${actionLink('Configure', { data: { act: 'configure', source: src.id } })}
        </div>
      </div>`;
  }

  const rows = [
    { label: 'Gross',        value: engine?.gross_monthly_pence ?? entry.gross_monthly_pence },
    engine?.pension_ee_monthly_pence ? { label: `Pension (${src.pension_method === 'salary_sacrifice' ? 'SS' : 'you'})`, value: -(engine.pension_ee_monthly_pence), sign: '−' } : null,
    { label: 'Income tax',   value: -(engine?.income_tax_monthly_pence  ?? entry.income_tax_pence),  sign: '−' },
    { label: 'NI',           value: -(engine?.ni_monthly_pence           ?? entry.ni_pence),          sign: '−' },
    entry.student_loan_pence ? { label: 'Student loan', value: -(engine?.student_loan_monthly_pence ?? entry.student_loan_pence), sign: '−' } : null,
  ].filter(Boolean);

  const net = engine?.net_monthly_pence ?? entry.net_monthly_pence;

  return `
    <div class="px-5 py-4" data-source="${src.id}">
      <div class="mb-3 flex items-start justify-between">
        <div>
          <span class="text-sm font-medium text-ink">${esc(src.name)}</span>
          <span class="ml-2 text-xs text-stone">${src.tax_code}${src.is_primary ? ' · primary' : ''}</span>
          <span class="ml-1 text-xs text-stone">${kindLabel(src.kind)}</span>
          <span class="ml-2 text-xs text-stone">from ${formatMonth(entry.effective_from)}</span>
          ${entry.has_overrides ? '<span class="ml-2 text-xs text-warm">overrides</span>' : ''}
        </div>
        <div class="ml-4 flex shrink-0 gap-3 text-xs text-stone">
          ${actionLink('Edit', { data: { act: 'edit-entry', source: src.id } })}
          ${actionLink('History', { data: { act: 'history', source: src.id } })}
          ${actionLink('Configure', { data: { act: 'configure', source: src.id } })}
        </div>
      </div>

      <!-- Waterfall breakdown -->
      <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-stone">
        ${rows.map((r, i) => `
          <span class="${i > 0 ? 'text-stone/60' : 'text-ink'} whitespace-nowrap">
            ${i > 0 ? (r.sign ?? '−') + ' ' : ''}${r.label} <strong class="text-ink">${penceToDisplay(Math.abs(r.value))}</strong>
          </span>`).join('<span class="text-stone/40">→</span>')}
        <span class="text-stone/40">→</span>
        <span class="whitespace-nowrap">Net <strong class="text-ink">${penceToDisplay(net)}/mo</strong></span>
      </div>

      ${src.pension_method !== 'none' && engine?.pension_er_monthly_pence ? `
        <div class="mt-1 text-xs text-stone">
          Employer pension: ${penceToDisplay(engine.pension_er_monthly_pence)}/mo
        </div>` : ''}
    </div>`;
}

function renderEvents(person) {
  const evts = person.events ?? [];
  return `
    <div class="border-t border-warm-light px-5 py-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium tracking-wide text-stone uppercase">One-off events this year</span>
        ${actionLink('+ Add', { data: { act: 'add-event', person: person.id } })}
      </div>
      ${evts.length === 0
        ? '<p class="text-xs text-stone">None recorded.</p>'
        : `<ul class="space-y-1">${evts.map(e => `
            <li class="flex items-center justify-between text-xs">
              <span class="text-ink">${e.event_date} · ${e.kind} · ${penceToDisplay(e.gross_pence)} gross</span>
              <span class="text-stone">${penceToDisplay(e.net_pence)} net</span>
            </li>`).join('')}</ul>`
      }
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindHandlers(el, people, householdSettings, reload) {
  const person = (id) => people.find(p => p.id === id);
  const source = (sid) => people.flatMap(p => p.sources).find(s => s.id === sid);

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'add-source')  addSourceModal(person(btn.dataset.person), people, reload);
    if (act === 'add-entry')   entryModal(null, source(btn.dataset.source), person_for_source(source(btn.dataset.source), people), householdSettings, reload);
    if (act === 'edit-entry')  {
      const src = source(btn.dataset.source);
      entryModal(src?.entry ?? null, src, person_for_source(src, people), householdSettings, reload);
    }
    if (act === 'configure')   configureModal(source(btn.dataset.source), reload);
    if (act === 'history')     historyModal(source(btn.dataset.source));
    if (act === 'add-event')   addEventModal(person(btn.dataset.person), people, reload);
  });
}

function person_for_source(src, people) {
  return people.find(p => p.sources.some(s => s.id === src?.id));
}

// ── Modals ────────────────────────────────────────────────────────────────────

const TAX_CODE_KINDS = [
  ['employment',     'Employment (PAYE)'],
  ['self_employment','Self-employment'],
  ['rental',        'Rental income'],
  ['dividends',     'Dividends'],
  ['benefits',      'Benefits/other'],
];

const PENSION_METHODS = [
  ['none',              'None'],
  ['salary_sacrifice',  'Salary sacrifice'],
  ['net_pay',           'Net pay arrangement'],
  ['relief_at_source',  'Relief at source'],
];

const SL_PLANS = [
  ['none','None'],
  ['1','Plan 1'],['2','Plan 2'],['4','Plan 4'],['5','Plan 5'],['pg','Postgrad'],
];

function addSourceModal(person, allPeople, reload) {
  const isPrimary = person.sources.length === 0; // first source is primary by default
  modal({
    title: `Add income source — ${person.display_name}`,
    bodyHtml: `
      ${field('Source name', textInput('name', '', 'e.g. Acme Ltd salary'))}
      ${field('Kind', select('kind', TAX_CODE_KINDS, 'employment'))}
      ${twoCol(
        field('Tax code', textInput('tax_code', '1257L', '1257L')),
        field('Actual allowance (£/yr, optional)',
          textInput('allowance_override', '', 'e.g. 12882'),
          'Leave blank to use code value')
      )}
      ${checkbox('is_primary', isPrimary, 'Primary job (personal allowance applied here)')}`,
    submitLabel: 'Add source',
    async onSubmit(o, close) {
      const name = val(o, 'name');
      if (!name) throw new Error('Name required');
      const allowStr = val(o, 'allowance_override');
      const allowP   = allowStr ? parsePence(allowStr) : null;
      await api.addIncomeSource({
        person_id: person.id,
        name, kind: val(o, 'kind'),
        tax_code: val(o, 'tax_code') || '1257L',
        tax_code_allowance_pence: allowP ?? null, // parsePence gives pence directly
        is_primary: bool(o, 'is_primary'),
        pension_method: 'none', pension_ee_type: 'pct', pension_ee_value: 0,
        pension_er_type: 'pct', pension_er_value: 0, student_loan_plan: 'none',
      });
      close(); reload();
    },
  });
}

function configureModal(src, reload) {
  modal({
    title: `Configure: ${src.name}`,
    bodyHtml: `
      ${twoCol(
        field('Tax code', textInput('tax_code', src.tax_code ?? '1257L')),
        field('Actual allowance (£/yr)',
          textInput('allowance_override',
            src.tax_code_allowance_pence ? (src.tax_code_allowance_pence / 100).toFixed(2) : '',
            'e.g. 12882'))
      )}
      ${checkbox('is_primary', src.is_primary, 'Primary job (personal allowance)')}
      ${field('Pension method', select('pension_method', PENSION_METHODS, src.pension_method ?? 'none'))}
      <div id="pension-detail" class="${src.pension_method === 'none' ? 'hidden' : ''}">
        ${twoCol(
          field('Employee contribution', pensionContribInput('pension_ee', src.pension_ee_type, src.pension_ee_value)),
          field('Employer contribution', pensionContribInput('pension_er', src.pension_er_type, src.pension_er_value))
        )}
      </div>
      ${field('Student loan plan', select('student_loan_plan', SL_PLANS, src.student_loan_plan ?? 'none'))}`,

    submitLabel: 'Save',
    onMount(o) {
      o.querySelector('[name="pension_method"]').addEventListener('change', e => {
        o.querySelector('#pension-detail').classList.toggle('hidden', e.target.value === 'none');
      });
    },
    async onSubmit(o, close) {
      const allowStr = val(o, 'allowance_override');
      const allowP   = allowStr ? parsePence(allowStr) : null;
      const readContrib = (prefix) => ({
        type:  val(o, `${prefix}_type`),
        value: Math.round(parseFloat(o.querySelector(`[name="${prefix}_val"]`)?.value || '0') * 100),
      });
      const ee = readContrib('pension_ee');
      const er = readContrib('pension_er');
      await api.patchIncomeSource(src.id, {
        tax_code: val(o, 'tax_code') || '1257L',
        tax_code_allowance_pence: allowP ?? null,
        is_primary: bool(o, 'is_primary'),
        pension_method: val(o, 'pension_method'),
        pension_ee_type: ee.type, pension_ee_value: ee.value,
        pension_er_type: er.type, pension_er_value: er.value,
        student_loan_plan: val(o, 'student_loan_plan'),
      });
      close(); reload();
    },
  });
}

function entryModal(existingEntry, src, person, householdSettings, reload) {
  const isEdit = !!existingEntry;
  const grossPounds = existingEntry ? (existingEntry.gross_monthly_pence * 12 / 100).toFixed(2) : '';

  modal({
    title: isEdit ? `Edit entry: ${src.name}` : `Set salary: ${src.name}`,
    bodyHtml: `
      ${twoCol(
        field('Effective from', monthInput('effective_from', existingEntry?.effective_from?.slice(0,7) ?? THIS_MONTH)),
        field('Annual gross (£)', textInput('annual_gross', grossPounds, 'e.g. 105000'))
      )}
      <div id="preview" class="space-y-1 rounded-lg bg-warm-light/30 px-4 py-3 text-sm">
        <p class="text-xs text-stone">Enter gross above to see breakdown</p>
      </div>
      <details class="mt-4">
        <summary class="cursor-pointer text-xs text-stone hover:text-ink">Override computed values</summary>
        <div class="mt-3 grid grid-cols-2 gap-3">
          ${field('Income tax (£/mo)', textInput('override_tax', '', '', 'data-override'))}
          ${field('NI (£/mo)', textInput('override_ni', '', '', 'data-override'))}
          ${field('Pension employee (£/mo)', textInput('override_pension_ee', '', '', 'data-override'))}
          ${field('Student loan (£/mo)', textInput('override_sl', '', '', 'data-override'))}
          ${field('Net pay (£/mo)', textInput('override_net', '', '', 'data-override'))}
        </div>
      </details>
      ${field('Note (optional)', textInput('note', existingEntry?.note ?? ''))}`,
    submitLabel: isEdit ? 'Update' : 'Save',
    onMount(o, close) {
      const previewEl = o.querySelector('#preview');
      function updatePreview() {
        const annualGrossStr = val(o, 'annual_gross');
        const annualGrossPence = parsePence(annualGrossStr);
        if (!annualGrossPence || annualGrossPence <= 0) {
          previewEl.innerHTML = '<p class="text-xs text-stone">Enter gross above to see breakdown</p>';
          return;
        }
        const monthlyGross = annualToMonthly(annualGrossPence);
        const tempSrc = toEngineSource({ ...src, gross_monthly_pence: monthlyGross });
        try {
          const result = computePersonIncome(
            { id: person?.id ?? 'preview' },
            [tempSrc], [],
            householdSettings, TODAY
          );
          const s = result.sources[0];
          previewEl.innerHTML = `
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span class="text-stone">Gross/mo</span>
              <span class="text-right font-mono text-ink">${penceToDisplay(s.gross_monthly_pence)}</span>
              ${s.pension_ee_monthly_pence ? `
              <span class="text-stone">Pension (you)</span>
              <span class="text-right font-mono text-ink">−${penceToDisplay(s.pension_ee_monthly_pence)}</span>` : ''}
              <span class="text-stone">Income tax</span>
              <span class="text-right font-mono text-ink">−${penceToDisplay(s.income_tax_monthly_pence)}</span>
              <span class="text-stone">NI</span>
              <span class="text-right font-mono text-ink">−${penceToDisplay(s.ni_monthly_pence)}</span>
              ${s.student_loan_monthly_pence ? `
              <span class="text-stone">Student loan</span>
              <span class="text-right font-mono text-ink">−${penceToDisplay(s.student_loan_monthly_pence)}</span>` : ''}
              <span class="border-t border-warm-light pt-1 font-medium text-ink">Net/mo</span>
              <span class="border-t border-warm-light pt-1 text-right font-mono font-medium text-ink">
                ${penceToDisplay(s.net_monthly_pence)}
              </span>
            </div>`;
        } catch { previewEl.innerHTML = '<p class="text-xs text-signal">Calculation error</p>'; }
      }
      o.querySelector('[name="annual_gross"]').addEventListener('input', updatePreview);
      if (grossPounds) updatePreview();
    },
    async onSubmit(o, close) {
      const annualGrossPence = parsePence(val(o, 'annual_gross'));
      if (!annualGrossPence) throw new Error('Annual gross required');
      const monthlyGross = annualToMonthly(annualGrossPence);
      const effectiveFrom = val(o, 'effective_from') + '-01';
      if (!effectiveFrom.match(/^\d{4}-\d{2}-01$/)) throw new Error('Effective from required');

      // Compute engine values
      const tempSrc = toEngineSource({ ...src, gross_monthly_pence: monthlyGross });
      const result = computePersonIncome({ id: person?.id ?? 'p' }, [tempSrc], [], householdSettings, TODAY);
      const s = result.sources[0];

      // Check for overrides
      const ovTaxStr = val(o, 'override_tax');
      const ovNiStr  = val(o, 'override_ni');
      const ovEeStr  = val(o, 'override_pension_ee');
      const ovSlStr  = val(o, 'override_sl');
      const ovNetStr = val(o, 'override_net');
      const hasOverrides = !!(ovTaxStr || ovNiStr || ovEeStr || ovSlStr || ovNetStr);

      const entry = {
        income_source_id: src.id,
        effective_from:   effectiveFrom,
        gross_monthly_pence:    monthlyGross,
        income_tax_pence:       ovTaxStr  ? parsePence(ovTaxStr)  : s.income_tax_monthly_pence,
        ni_pence:               ovNiStr   ? parsePence(ovNiStr)   : s.ni_monthly_pence,
        pension_ee_pence:       ovEeStr   ? parsePence(ovEeStr)   : s.pension_ee_monthly_pence,
        pension_er_pence:       s.pension_er_monthly_pence,
        student_loan_pence:     ovSlStr   ? parsePence(ovSlStr)   : s.student_loan_monthly_pence,
        net_monthly_pence:      ovNetStr  ? parsePence(ovNetStr)  : s.net_monthly_pence,
        has_overrides:          hasOverrides,
        note:                   val(o, 'note') || null,
      };

      if (isEdit) {
        await api.patchIncomeEntry(existingEntry.id, entry);
      } else {
        await api.addIncomeEntry(entry);
      }
      close(); reload();
    },
  });
}

function historyModal(src) {
  const { body } = baseOverlay({
    title: `History: ${esc(src.name)}`,
    bodyClass: 'px-6 py-4 max-h-96 overflow-y-auto',
    bodyHtml: '<p class="text-sm text-stone">Loading…</p>',
  });

  api.getSourceHistory(src.id).then(entries => {
    if (!entries.length) { body.innerHTML = '<p class="text-sm text-stone">No entries yet.</p>'; return; }
    body.innerHTML = `<table class="w-full font-mono text-xs">
      <thead><tr class="border-b border-warm-light text-left text-stone">
        <th class="pb-2">From</th><th class="pb-2">Gross/mo</th>
        <th class="pb-2">Tax</th><th class="pb-2">NI</th><th class="pb-2">Net/mo</th>
      </tr></thead>
      <tbody class="divide-y divide-warm-light">
        ${entries.map(e => `<tr class="py-1">
          <td class="py-1">${formatMonth(e.effective_from)}</td>
          <td class="py-1">${penceToDisplay(e.gross_monthly_pence)}</td>
          <td class="py-1">${penceToDisplay(e.income_tax_pence)}</td>
          <td class="py-1">${penceToDisplay(e.ni_pence)}</td>
          <td class="py-1 font-medium">${penceToDisplay(e.net_monthly_pence)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  });
}

function addEventModal(person, allPeople, reload) {
  const sources = person.sources.filter(s => s.kind === 'employment' || s.kind === 'self_employment');
  modal({
    title: `Add one-off event — ${person.display_name}`,
    bodyHtml: `
      ${field('Kind', select('kind', [['bonus','Bonus'],['dividend','Dividend'],['other','Other']]))}
      ${twoCol(
        field('Date', `<input name="event_date" type="date" value="${TODAY}"
          class="w-full rounded border border-warm-light bg-paper px-3 py-2 text-sm">`),
        field('Gross amount (£)', textInput('gross', '', 'e.g. 10000'))
      )}
      ${sources.length ? field('Linked source (optional)',
        select('source_id', [['','None'], ...sources.map(s => [s.id, s.name])])) : ''}
      ${field('Note (optional)', textInput('note', ''))}`,
    submitLabel: 'Add event',
    async onSubmit(o, close) {
      const grossPence = parsePence(val(o, 'gross'));
      if (!grossPence) throw new Error('Amount required');
      const kind = val(o, 'kind');
      // Simple tax estimate for bonus: employment PAYE at higher rate
      // For now store 0 computed values; user can see cliff alerts and override later
      await api.addIncomeEvent({
        person_id: person.id,
        income_source_id: val(o, 'source_id') || null,
        event_date: val(o, 'event_date'),
        kind,
        gross_pence: grossPence,
        tax_pence: 0, ni_pence: 0, // TODO: compute from engine with full context
        net_pence: grossPence,
        note: val(o, 'note') || null,
      });
      close(); reload();
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toEngineSource(s) {
  return {
    id:   s.id,
    name: s.name,
    kind: s.kind,
    tax_code: s.tax_code ?? '1257L',
    tax_code_allowance_pence: s.tax_code_allowance_pence ?? null,
    is_primary: s.is_primary,
    pension_method:    s.pension_method    ?? 'none',
    pension_ee_type:   s.pension_ee_type   ?? 'pct',
    pension_ee_value:  s.pension_ee_value  ?? 0,
    pension_er_type:   s.pension_er_type   ?? 'pct',
    pension_er_value:  s.pension_er_value  ?? 0,
    student_loan_plan: s.student_loan_plan ?? 'none',
    gross_monthly_pence: s.entry?.gross_monthly_pence ?? s.gross_monthly_pence ?? 0,
  };
}

const kindLabel = (k) => ({ employment:'PAYE', self_employment:'Self-emp', rental:'Rental',
  dividends:'Dividends', benefits:'Benefits', other:'Other' }[k] ?? k);

/**
 * Render a paired number input + % / £/mo select for pension contributions.
 * Stored value is always in basis points (pct) or pence (fixed), both divided by 100 for display.
 */
function pensionContribInput(namePrefix, existingType = 'pct', existingValue = 0) {
  const displayVal = existingValue ? (existingValue / 100).toString() : '';
  const isCls = 'border border-warm-light rounded px-3 py-2 bg-paper text-ink text-sm focus:outline-none focus:ring-1 focus:ring-warm';
  return `<div class="flex gap-2">
    <input name="${namePrefix}_val" type="number" step="0.01" min="0"
      value="${displayVal}" placeholder="5"
      class="min-w-0 flex-1 ${isCls}">
    <select name="${namePrefix}_type" class="shrink-0 ${isCls}">
      <option value="pct"   ${existingType === 'pct'   ? 'selected' : ''}>%</option>
      <option value="fixed" ${existingType === 'fixed' ? 'selected' : ''}>£/mo</option>
    </select>
  </div>`;
}

