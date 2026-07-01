// finance/views/settings.js — gear Settings overlay

import * as api from '../api/client.js';
import { modal, field, textInput, select, checkbox, twoCol, val, num, bool } from '../components/forms.js';
import { esc, overlay as baseOverlay, actionLink, errorState } from '../components/ui.js';

/** Open the Settings overlay. Calls onClose() after save if anything changed. */
export function openSettings(onClose) {
  let settings = {}, people = [];
  let dirty = false;

  const { overlay, body, close: closeOverlay } = baseOverlay({
    title: 'Settings',
    bodyClass: 'px-6 py-5 space-y-6',
    bodyHtml: '<div data-loading class="text-sm text-stone">Loading…</div>',
  });

  const close = () => { closeOverlay(); if (dirty) onClose?.(); };
  overlay.querySelector('[data-act="close"]').onclick = close;

  async function load() {
    const [s, p] = await Promise.all([api.getSettings(), api.getPeople()]);
    settings = s; people = p;
    render();
  }

  function render() {
    body.innerHTML = `
      <!-- Household cliff-edge settings -->
      <section>
        <h3 class="mb-3 font-mono text-sm tracking-[0.16em] text-stone uppercase">Household</h3>
        <div class="space-y-3">
          ${field('Household name', textInput('name', settings.name ?? ''))}
          ${checkbox('claim_child_benefit', settings.claim_child_benefit,
            'Household claims Child Benefit')}
          <div id="cb-children" class="${settings.claim_child_benefit ? '' : 'hidden'} pl-6">
            ${field('Number of children',
              `<input name="num_children" type="number" min="0" value="${settings.num_children ?? 0}"
               class="w-24 rounded-[3px] border border-ink/12 bg-paper px-3 py-2 text-sm text-ink">`)}
          </div>
          ${checkbox('uses_tax_free_childcare', settings.uses_tax_free_childcare,
            'Uses tax-free childcare or 30-hour free hours')}
        </div>
      </section>

      <!-- People -->
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-mono text-sm tracking-[0.16em] text-stone uppercase">People</h3>
          <button type="button" data-act="add-person"
            class="cursor-pointer rounded-[2px] border border-ink/12 px-3 py-2 font-mono text-sm tracking-[0.1em] text-stone uppercase hover:border-warm hover:text-warm">
            + Add person
          </button>
        </div>
        <ul class="space-y-2" id="people-list" role="list">
          ${people.map(renderPersonRow).join('') || '<li class="text-sm text-stone">No people yet.</li>'}
        </ul>
      </section>

      <div class="flex justify-end pt-2">
        <button type="button" data-act="save"
          class="cursor-pointer rounded-[2px] bg-ink px-4 py-2 font-mono text-sm tracking-[0.1em] text-paper uppercase hover:opacity-80">
          Save settings
        </button>
      </div>
    `;

    // Toggle children field visibility
    body.querySelector('[name="claim_child_benefit"]').addEventListener('change', e => {
      body.querySelector('#cb-children').classList.toggle('hidden', !e.target.checked);
    });

    body.querySelector('[data-act="add-person"]').onclick = () => addPersonModal();
    body.querySelectorAll('[data-act="edit-person"]').forEach(btn => {
      btn.onclick = () => editPersonModal(people.find(p => p.id === btn.dataset.id));
    });
    body.querySelector('[data-act="save"]').onclick = saveSettings;
  }

  function renderPersonRow(p) {
    return `
      <li class="flex items-center justify-between border-b border-ink/12 py-2 last:border-0">
        <div>
          <span class="text-sm font-medium text-ink">${esc(p.display_name)}</span>
          ${p.is_earner ? '' : '<span class="ml-2 text-sm text-stone">(not earner)</span>'}
        </div>
        ${actionLink('Edit', { data: { act: 'edit-person', id: p.id } })}
      </li>`;
  }

  async function saveSettings() {
    const b = {
      name:                  body.querySelector('[name="name"]').value.trim(),
      claim_child_benefit:   bool(body, 'claim_child_benefit'),
      num_children:          num(body, 'num_children'),
      uses_tax_free_childcare: bool(body, 'uses_tax_free_childcare'),
    };
    try {
      await api.patchSettings(b);
      dirty = true;
    } catch (err) {
      alert(err.message);
    }
  }

  function addPersonModal() {
    modal({
      title: 'Add person',
      bodyHtml: `
        ${field('Name', textInput('display_name', '', 'e.g. Alice'))}
        ${checkbox('is_earner', true, 'Is an earner (has income)')}`,
      async onSubmit(o, close) {
        const name = val(o, 'display_name');
        if (!name) throw new Error('Name required');
        await api.addPerson({ display_name: name, is_earner: bool(o, 'is_earner') });
        dirty = true;
        close();
        const p = await api.getPeople(); people = p; render();
      },
    });
  }

  function editPersonModal(person) {
    const otherPeople = people.filter(p => p.id !== person.id);
    modal({
      title: `Edit: ${person.display_name}`,
      bodyHtml: `
        ${field('Name', textInput('display_name', person.display_name))}
        ${checkbox('is_earner', person.is_earner, 'Is an earner')}
        ${otherPeople.length ? field('Marriage allowance: transfer to',
          select('marriage_partner',
            [['', 'None'], ...otherPeople.map(p => [p.id, p.display_name])],
            person.marriage_allowance_partner_id ?? ''),
          'Set on the non-taxpayer who transfers £1,260 of allowance.') : ''}`,
      submitLabel: 'Update',
      async onSubmit(o, close) {
        const b = {
          display_name: val(o, 'display_name'),
          is_earner: bool(o, 'is_earner'),
        };
        if (otherPeople.length) {
          b.marriage_allowance_partner_id = val(o, 'marriage_partner') || null;
        }
        await api.patchPerson(person.id, b);
        dirty = true;
        close();
        const p = await api.getPeople(); people = p; render();
      },
    });
  }

  load().catch(err => { body.innerHTML = errorState(err); });
}
