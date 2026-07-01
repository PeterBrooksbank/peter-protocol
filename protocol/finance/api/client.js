// finance/api/client.js — fetch wrapper for all /api/finance/* endpoints

const BASE = '/api/finance';

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const get  = (path)       => request('GET',    path);
const post = (path, body) => request('POST',   path, body);
const patch= (path, body) => request('PATCH',  path, body);
const del  = (path)       => request('DELETE', path);

// ── Settings ─────────────────────────────────────────────────────────────────
export const getSettings    = ()    => get('/settings');
export const patchSettings  = (b)   => patch('/settings', b);

// ── People ────────────────────────────────────────────────────────────────────
export const getPeople      = ()    => get('/people');
export const addPerson      = (b)   => post('/people', b);
export const patchPerson    = (id, b) => patch(`/people/${id}`, b);
export const deletePerson   = (id)  => del(`/people/${id}`);

// ── Income ────────────────────────────────────────────────────────────────────
export const getIncome      = (month) => get(`/income?month=${month}`);

export const addIncomeSource    = (b)   => post('/income-sources', b);
export const patchIncomeSource  = (id, b) => patch(`/income-sources/${id}`, b);
export const getSourceHistory   = (id)  => get(`/income-sources/${id}/history`);

export const addIncomeEntry   = (b)   => post('/income-entries', b);
export const patchIncomeEntry = (id, b) => patch(`/income-entries/${id}`, b);

export const addIncomeEvent   = (b)   => post('/income-events', b);
export const patchIncomeEvent = (id, b) => patch(`/income-events/${id}`, b);
export const deleteIncomeEvent= (id)  => del(`/income-events/${id}`);

// ── Accounts (Phase 3) ────────────────────────────────────────────────────────
export const getAccounts    = ()    => get('/accounts');
export const addAccount     = (b)   => post('/accounts', b);
export const patchAccount   = (id, b) => patch(`/accounts/${id}`, b);
export const addSnapshot    = (b)   => post('/snapshots', b);

// ── Budget (Phase 4) ─────────────────────────────────────────────────────────
export const getBudget          = (month) => get(`/budget?month=${month}`);
export const getBudgetCategories= ()      => get('/budget-categories');
export const addBudgetCategory  = (b)     => post('/budget-categories', b);
export const patchBudgetCategory= (id, b) => patch(`/budget-categories/${id}`, b);
export const deleteBudgetCategory=(id)    => del(`/budget-categories/${id}`);
export const getBudgetLines     = ()      => get('/budget-lines');
export const addBudgetLine      = (b)     => post('/budget-lines', b);
export const patchBudgetLine    = (id, b) => patch(`/budget-lines/${id}`, b);
export const deleteBudgetLine   = (id)    => del(`/budget-lines/${id}`);
