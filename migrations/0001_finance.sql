CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'GBP',
  tax_year_start TEXT NOT NULL DEFAULT '04-06',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  display_name TEXT NOT NULL,
  is_earner INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE memberships (
  household_id TEXT NOT NULL REFERENCES households(id),
  user_email TEXT NOT NULL,
  person_id TEXT REFERENCES people(id),
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (household_id, user_email)
);

CREATE TABLE income_sources (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'employment',
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE income_entries (
  id TEXT PRIMARY KEY,
  income_source_id TEXT NOT NULL REFERENCES income_sources(id),
  effective_from TEXT NOT NULL,             -- YYYY-MM-01
  gross_monthly REAL NOT NULL,
  income_tax REAL NOT NULL DEFAULT 0,
  national_insurance REAL NOT NULL DEFAULT 0,
  pension_employee REAL NOT NULL DEFAULT 0,
  pension_employer REAL NOT NULL DEFAULT 0,
  student_loan REAL NOT NULL DEFAULT 0,
  other_deductions REAL NOT NULL DEFAULT 0,
  net_monthly REAL NOT NULL,
  note TEXT
);
CREATE INDEX idx_income_entries_lookup
  ON income_entries(income_source_id, effective_from DESC);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  owner_person_id TEXT REFERENCES people(id),   -- NULL = joint
  type TEXT NOT NULL,        -- current|savings|isa|pension|investment|student_loan|mortgage|other
  is_liability INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  nickname TEXT NOT NULL,
  meta TEXT,                 -- JSON: APR, SL plan, ISA flavour, match %, etc.
  opened_date TEXT,
  closed_date TEXT
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  as_of_date TEXT NOT NULL,
  balance REAL NOT NULL,
  contribution_since_last REAL,   -- nullable; for later income-driven wiring
  note TEXT
);
CREATE INDEX idx_snapshots_account ON snapshots(account_id, as_of_date DESC);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,        -- income | expense
  planned_monthly REAL NOT NULL DEFAULT 0,
  rollover_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE statements (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  uploaded_by TEXT,
  bank TEXT,
  filename TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,             -- signed: negative = money out
  category_id TEXT REFERENCES categories(id),
  statement_id TEXT REFERENCES statements(id),
  reconciled INTEGER NOT NULL DEFAULT 0,
  dedupe_hash TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_txn_dedupe ON transactions(household_id, dedupe_hash);
CREATE INDEX idx_txn_month ON transactions(household_id, account_id, date);