// finance/index.js — Finance module entry point
// Loaded via <script type="module" src="/finance/index.js">
// Mounts the subnav, gear Settings, and lazy-loads each tab view.

import { mount as mountIncome   } from './views/income.js';
import { mount as mountAccounts } from './views/accounts.js';
import { mount as mountBudget   } from './views/budget.js';
import { mount as mountDashboard} from './views/dashboard.js';
import { openSettings } from './views/settings.js';

const TABS = ['dashboard', 'income', 'budget', 'accounts'];

/** Show a finance tab by name. Called from index.html showFinanceView(). */
export function showFinanceView(name) {
  // Update subnav active state
  document.querySelectorAll('.fin-subtab').forEach(btn => {
    btn.classList.toggle('fin-subtab--active', btn.dataset.view === name);
  });

  // Hide all panes, show the requested one
  document.querySelectorAll('.fin-view').forEach(el => el.style.display = 'none');
  const pane = document.getElementById(`finance-${name}`);
  if (!pane) return;
  pane.style.display = '';

  // Lazy mount (only once per load, or always for tabs that refresh on show)
  mountTab(name, pane);
}

function mountTab(name, el) {
  if (name === 'income') {
    mountIncome(el, { onRefresh: () => mountIncome(el) });
    return;
  }
  if (name === 'budget') {
    mountBudget(el);
    return;
  }
  if (name === 'accounts') {
    mountAccounts(el);
    return;
  }
  if (name === 'dashboard') {
    mountDashboard(el);
    return;
  }
}

/** Wire up the gear icon to open the Settings overlay. */
export function initFinance() {
  const gear = document.getElementById('finance-settings-btn');
  if (gear) gear.onclick = () => openSettings(() => {
    // Refresh the active tab after settings change
    const active = document.querySelector('.fin-subtab--active')?.dataset?.view;
    if (active) showFinanceView(active);
  });
}

// Auto-initialise once the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFinance);
} else {
  initFinance();
}

// Expose for onclick="showFinanceView(...)" in index.html and cross-view navigation
window.showFinanceView = showFinanceView;
