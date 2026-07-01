-- Finance rewrite: drop old schema, create clean integer-pence schema
-- All monetary values stored as INTEGER pence (1/100 of £1)

-- ── Drop old tables (order respects FK deps) ────────────────────────────────
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS statements;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS income_entries;
DROP TABLE IF EXISTS income_sources;
-- keep households, people, memberships — wipe data via household delete

-- ── Households ──────────────────────────────────────────────────────────────
-- Add cliff-edge settings columns to households
ALTER TABLE households ADD COLUMN claim_child_benefit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE households ADD COLUMN num_children INTEGER NOT NULL DEFAULT 0;
ALTER TABLE households ADD COLUMN uses_tax_free_childcare INTEGER NOT NULL DEFAULT 0;

-- ── People ───────────────────────────────────────────────────────────────────
ALTER TABLE people ADD COLUMN marriage_allowance_partner_id TEXT REFERENCES people(id);

-- ── Income sources ──────────────────────────────────────────────────────────
CREATE TABLE income_sources (
  id                  TEXT    PRIMARY KEY,
  person_id           TEXT    NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name                TEXT    NOT NULL,
  -- employment | self_employment | rental | dividends | benefits | other
  kind                TEXT    NOT NULL DEFAULT 'employment',
  -- Tax code: e.g. '1257L', 'BR', 'D0', 'D1', '0T', 'NT', 'K500'
  tax_code            TEXT    NOT NULL DEFAULT '1257L',
  -- Optional: the exact allowance in pence when the code alone isn't precise enough.
  -- e.g. 1288L computes £12,880 but HMRC may have set it to £12,882 — store 1288200 here.
  tax_code_allowance_pence INTEGER DEFAULT NULL,
  -- 1 = personal allowance applied here (taper too); only one source per person
  is_primary          INTEGER NOT NULL DEFAULT 0,
  -- salary_sacrifice | net_pay | relief_at_source | none
  pension_method      TEXT    NOT NULL DEFAULT 'none',
  -- pct | fixed
  pension_ee_type     TEXT    NOT NULL DEFAULT 'pct',
  -- if pct: e.g. 500 = 5.00%; if fixed: pence per month
  pension_ee_value    INTEGER NOT NULL DEFAULT 0,
  pension_er_type     TEXT    NOT NULL DEFAULT 'pct',
  pension_er_value    INTEGER NOT NULL DEFAULT 0,
  -- none | 1 | 2 | 4 | 5 | pg
  student_loan_plan   TEXT    NOT NULL DEFAULT 'none',
  is_active           INTEGER NOT NULL DEFAULT 1
);

-- ── Income entries (point-in-time recurring salary snapshots) ───────────────
-- Computed breakdown persisted when entry is saved (frozen point-in-time).
CREATE TABLE income_entries (
  id                  TEXT    PRIMARY KEY,
  income_source_id    TEXT    NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  effective_from      TEXT    NOT NULL, -- YYYY-MM-01
  -- All values in pence per month
  gross_monthly_pence INTEGER NOT NULL,
  income_tax_pence    INTEGER NOT NULL DEFAULT 0,
  ni_pence            INTEGER NOT NULL DEFAULT 0,
  pension_ee_pence    INTEGER NOT NULL DEFAULT 0,
  pension_er_pence    INTEGER NOT NULL DEFAULT 0,
  student_loan_pence  INTEGER NOT NULL DEFAULT 0,
  net_monthly_pence   INTEGER NOT NULL,
  -- Whether user overrode any computed fields
  has_overrides       INTEGER NOT NULL DEFAULT 0,
  note                TEXT
);
CREATE INDEX idx_income_entries_lookup
  ON income_entries(income_source_id, effective_from DESC);

-- ── Income events (one-off: bonuses, irregular dividends) ───────────────────
CREATE TABLE income_events (
  id                  TEXT    PRIMARY KEY,
  person_id           TEXT    NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  -- optional link to the source (for PAYE bonuses); NULL for standalone dividends
  income_source_id    TEXT    REFERENCES income_sources(id),
  event_date          TEXT    NOT NULL, -- YYYY-MM-DD
  -- bonus | dividend | other
  kind                TEXT    NOT NULL DEFAULT 'bonus',
  gross_pence         INTEGER NOT NULL,
  -- Computed and persisted at save time
  tax_pence           INTEGER NOT NULL DEFAULT 0,
  ni_pence            INTEGER NOT NULL DEFAULT 0,
  net_pence           INTEGER NOT NULL,
  note                TEXT
);
CREATE INDEX idx_income_events_person ON income_events(person_id, event_date DESC);

-- ── Accounts ─────────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  id                      TEXT    PRIMARY KEY,
  household_id            TEXT    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_person_id         TEXT    REFERENCES people(id), -- NULL = joint
  -- current | savings | isa | investment | pension | student_loan | mortgage | other
  type                    TEXT    NOT NULL,
  is_liability            INTEGER NOT NULL DEFAULT 0,
  provider                TEXT,
  nickname                TEXT    NOT NULL,
  -- manual | pension | amortising | contribution
  projection_mode         TEXT    NOT NULL DEFAULT 'manual',
  -- For pension: links to income_sources for EE+ER contribution amounts
  linked_income_source_id TEXT    REFERENCES income_sources(id),
  -- For mortgage/savings: links to the budget line for the monthly payment
  linked_budget_line_id   TEXT,   -- FK added after budget_lines created
  -- Annual interest rate in basis points (e.g. 425 = 4.25%). For mortgage/savings.
  interest_rate_bps       INTEGER,
  -- Annual growth rate in bps (e.g. 700 = 7.00%). For pension/investments.
  growth_rate_bps         INTEGER,
  -- Fixed monthly contribution in pence (for savings/ISA if not linked to budget)
  monthly_contribution_pence INTEGER,
  opened_date             TEXT,
  closed_date             TEXT,
  meta                    TEXT    -- JSON for extra metadata
);

-- ── Account balance snapshots (manual anchors for projections) ───────────────
CREATE TABLE snapshots (
  id            TEXT    PRIMARY KEY,
  account_id    TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  as_of_date    TEXT    NOT NULL, -- YYYY-MM-DD
  balance_pence INTEGER NOT NULL,
  note          TEXT
);
CREATE INDEX idx_snapshots_account ON snapshots(account_id, as_of_date DESC);

-- ── Budget categories (groupings for rollup) ─────────────────────────────────
CREATE TABLE budget_categories (
  id           TEXT    PRIMARY KEY,
  household_id TEXT    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  -- income | expense
  kind         TEXT    NOT NULL DEFAULT 'expense',
  sort         INTEGER NOT NULL DEFAULT 0
);

-- ── Budget lines (specific recurring items with match rules) ─────────────────
CREATE TABLE budget_lines (
  id                    TEXT    PRIMARY KEY,
  household_id          TEXT    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id           TEXT    NOT NULL REFERENCES budget_categories(id),
  name                  TEXT    NOT NULL,
  planned_monthly_pence INTEGER NOT NULL DEFAULT 0,
  -- Substring match rule for auto-matching imported transactions (case-insensitive)
  match_rule            TEXT,
  -- Optional: who pays this line
  paid_by_person_id     TEXT    REFERENCES people(id),
  is_active             INTEGER NOT NULL DEFAULT 1
);

-- Add FK for accounts.linked_budget_line_id now that budget_lines exists
-- (SQLite doesn't support ADD CONSTRAINT; the column was defined without FK above —
--  application enforces referential integrity for this link)

-- ── Statements (imported CSV batches) ────────────────────────────────────────
CREATE TABLE statements (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  uploaded_by  TEXT,
  bank         TEXT,
  filename     TEXT,
  -- The month this statement covers, YYYY-MM
  period_month TEXT,
  imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE transactions (
  id                  TEXT    PRIMARY KEY,
  household_id        TEXT    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id          TEXT    NOT NULL REFERENCES accounts(id),
  statement_id        TEXT    REFERENCES statements(id),
  date                TEXT    NOT NULL,        -- YYYY-MM-DD
  description         TEXT    NOT NULL,
  amount_pence        INTEGER NOT NULL,        -- signed: negative = money out
  budget_line_id      TEXT    REFERENCES budget_lines(id),
  category_id         TEXT    REFERENCES budget_categories(id),
  -- expense | income | transfer | ignore
  txn_class           TEXT    NOT NULL DEFAULT 'expense',
  paid_by_person_id   TEXT    REFERENCES people(id),
  reconciled          INTEGER NOT NULL DEFAULT 0,
  -- SHA-256 of normalised date+amount+description, unique per household
  dedupe_hash         TEXT    NOT NULL
);
CREATE UNIQUE INDEX idx_txn_dedupe ON transactions(household_id, dedupe_hash);
CREATE INDEX idx_txn_month ON transactions(household_id, account_id, date);
CREATE INDEX idx_txn_budget_line ON transactions(household_id, budget_line_id, date);
