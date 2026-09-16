-- A v1 finance schema, with data, so the backfill can be verified.
--
-- NOT the application's schema and never run against a real database. This is
-- the subset of `db/schema.sql` that `028-finance-v2-backfill.sql` reads, plus
-- rows chosen to exercise every hazard the backfill has to report. Without it
-- the backfill could only be read, not run, and reading has already missed a
-- fatal defect in it once.
--
-- The rows are invented. No real figures belong in this repository.

-- ── Enums and helper ────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE transaction_type AS ENUM ('earning','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transaction_frequency AS ENUM ('daily','weekly','bi-weekly','monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE account_kind AS ENUM ('chequing','savings','credit','cash','investment','loan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE category_bucket AS ENUM ('income','need','want','save','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_settings (
  user_id UUID PRIMARY KEY, base_currency CHAR(3) NOT NULL DEFAULT 'CAD',
  home_currency CHAR(3),
  needs_target_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  wants_target_pct NUMERIC(5,2) NOT NULL DEFAULT 30,
  save_target_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  runway_target_months NUMERIC(4,1) NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS fx_rates (
  base CHAR(3) NOT NULL, quote CHAR(3) NOT NULL, as_of DATE NOT NULL,
  rate NUMERIC(20,10) NOT NULL, source TEXT, PRIMARY KEY (base, quote, as_of));

CREATE TABLE IF NOT EXISTS finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  name TEXT NOT NULL, kind account_kind NOT NULL DEFAULT 'chequing',
  currency CHAR(3) NOT NULL, institution TEXT,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_date DATE NOT NULL DEFAULT CURRENT_DATE,
  credit_limit NUMERIC(18,4), statement_day INT, payment_due_day INT,
  is_liquid BOOLEAN NOT NULL DEFAULT true, import_ref TEXT, color TEXT,
  sort_order INT NOT NULL DEFAULT 0, archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  name TEXT NOT NULL, bucket category_bucket NOT NULL DEFAULT 'want',
  icon TEXT, color TEXT, is_essential BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0, archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name));

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  description TEXT NOT NULL, amount NUMERIC(10,2) NOT NULL,
  type transaction_type NOT NULL, category TEXT,
  frequency transaction_frequency NOT NULL, start_date DATE NOT NULL,
  end_date DATE, occurrence_day INT, last_processed_date DATE,
  account_id UUID, category_id UUID, currency CHAR(3),
  auto_post BOOLEAN NOT NULL DEFAULT false,
  is_estimate BOOLEAN NOT NULL DEFAULT false,
  notes TEXT, archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS recurring_skips (
  recurring_id UUID NOT NULL, user_id UUID, due_date DATE NOT NULL,
  reason TEXT, created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (recurring_id, due_date));

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, account_id UUID,
  file_name TEXT, format TEXT NOT NULL, rows_in_file INT NOT NULL DEFAULT 0,
  rows_imported INT NOT NULL DEFAULT 0, rows_skipped INT NOT NULL DEFAULT 0,
  date_from DATE, date_to DATE, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  date DATE NOT NULL, description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL, type transaction_type NOT NULL,
  category TEXT, recurring_transaction_id UUID,
  account_id UUID, category_id UUID, currency CHAR(3),
  fx_rate NUMERIC(20,10), base_amount NUMERIC(18,4),
  transfer_group UUID, fee_amount NUMERIC(18,4),
  merchant TEXT, notes TEXT, is_pending BOOLEAN NOT NULL DEFAULT false,
  occurrence_date DATE, import_hash TEXT, import_batch_id UUID,
  raw_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  name TEXT NOT NULL, lender TEXT, currency CHAR(3) NOT NULL,
  principal NUMERIC(16,2) NOT NULL, annual_rate NUMERIC(6,3) NOT NULL,
  tenure_months INT NOT NULL, first_emi_date DATE NOT NULL,
  rate_type TEXT NOT NULL DEFAULT 'floating',
  on_rate_change TEXT NOT NULL DEFAULT 'tenure',
  pay_from_account_id UUID, category_id UUID, notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_loan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  loan_id UUID NOT NULL, kind TEXT NOT NULL, effective_date DATE NOT NULL,
  rate NUMERIC(6,3), amount NUMERIC(16,2), effect TEXT, note TEXT,
  created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  category_id UUID NOT NULL, period DATE NOT NULL,
  amount NUMERIC(18,4) NOT NULL, rollover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  name TEXT NOT NULL, description TEXT,
  target_amount NUMERIC(12,2) NOT NULL,
  current_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  target_date DATE, currency CHAR(3), account_id UUID, kind TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  goal_id UUID NOT NULL, account_id UUID, amount NUMERIC(12,2) NOT NULL,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE, note TEXT,
  transaction_id UUID, created_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  name TEXT NOT NULL, description TEXT,
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS finance_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
  pattern TEXT NOT NULL, category_id UUID,
  kind TEXT NOT NULL DEFAULT 'expense',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pattern));

-- v1's balance function, which section 10 of the backfill compares against.
CREATE OR REPLACE FUNCTION public.account_balance(
  account UUID, as_of DATE DEFAULT CURRENT_DATE, include_pending BOOLEAN DEFAULT false)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT coalesce(a.opening_balance, 0)
    + coalesce((SELECT sum(CASE WHEN t.type = 'earning' THEN t.amount ELSE -t.amount END
                           - coalesce(t.fee_amount, 0))
                  FROM transactions t
                 WHERE t.account_id = a.id
                   AND t.date >= a.opening_date
                   AND t.date <= account_balance.as_of
                   AND (include_pending OR NOT t.is_pending)), 0)
    FROM finance_accounts a WHERE a.id = account_balance.account;
$$;


-- ── Data. Every row below exists to exercise something ──────────────────────

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'owner@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO finance_settings (user_id, base_currency, home_currency)
VALUES ('11111111-1111-1111-1111-111111111111', 'CAD', 'INR');

INSERT INTO fx_rates (base, quote, as_of, rate, source)
VALUES ('CAD', 'INR', DATE '2026-02-01', 60.2400000000, 'test');

INSERT INTO finance_accounts (id, user_id, name, kind, currency, opening_balance, opening_date, is_liquid, import_ref)
VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Chequing', 'chequing', 'CAD', 5000.0000, DATE '2026-01-01', true, '1234'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Savings', 'savings', 'CAD', 0, DATE '2026-01-01', true, 'not-a-ref'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'India', 'savings', 'INR', 0, DATE '2026-01-01', true, NULL),
  -- A currency the v2 table does not carry: must be REPORTED, not dropped in silence.
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Old account', 'savings', 'ZZZ', 10.0000, DATE '2026-01-01', true, NULL);

INSERT INTO finance_categories (id, user_id, name, bucket, is_essential)
VALUES
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Groceries', 'need', true),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Transfer', 'transfer', false),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Salary', 'income', false);

-- A plain spend, and an earning.
INSERT INTO transactions (id, user_id, date, description, amount, type, account_id, category_id, currency, fx_rate, base_amount)
VALUES
  ('70000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-01', 'Groceries', 45.00, 'expense',
   'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'CAD', 1, 45.0000),
  ('70000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-05', 'Pay', 3000.00, 'earning',
   'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'CAD', 1, 3000.0000);

-- A matched transfer pair with a fee: two rows that must become ONE
-- transaction with two postings.
INSERT INTO transactions (id, user_id, date, description, amount, type, account_id, currency, transfer_group, fee_amount)
VALUES
  ('70000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-10', 'To savings', 500.00, 'expense',
   'a0000000-0000-0000-0000-000000000001', 'CAD', '60000000-0000-0000-0000-000000000001', 5.0000),
  ('70000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-10', 'To savings', 500.00, 'earning',
   'a0000000-0000-0000-0000-000000000002', 'CAD', '60000000-0000-0000-0000-000000000001', NULL);

-- A HALF transfer: v1 allowed it because nothing enforced the pairing.
INSERT INTO transactions (id, user_id, date, description, amount, type, account_id, currency, transfer_group)
VALUES
  ('70000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-12', 'Sent abroad, other leg never recorded', 100.00, 'expense',
   'a0000000-0000-0000-0000-000000000001', 'CAD', '60000000-0000-0000-0000-000000000002');

-- A transaction of zero, which v2 refuses.
INSERT INTO transactions (id, user_id, date, description, amount, type, account_id, currency)
VALUES ('70000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
        DATE '2026-02-13', 'Nothing happened', 0.00, 'expense',
        'a0000000-0000-0000-0000-000000000001', 'CAD');

-- Two rows in DIFFERENT accounts sharing an import hash: legal in v1, a
-- collision under v2's index.
INSERT INTO transactions (id, user_id, date, description, amount, type, account_id, currency, import_hash)
VALUES
  ('70000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-14', 'Coffee', 6.50, 'expense', 'a0000000-0000-0000-0000-000000000001', 'CAD', 'shared-hash'),
  ('70000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   DATE '2026-02-14', 'Coffee', 6.50, 'expense', 'a0000000-0000-0000-0000-000000000002', 'CAD', 'shared-hash');

-- Recurring rules: an expense, an earning, one with no account, and one whose
-- occurrence_day its frequency could never produce.
INSERT INTO recurring_transactions (id, user_id, description, amount, type, frequency, start_date, occurrence_day, account_id, category_id, currency)
VALUES
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Rent', 1800.00, 'expense', 'monthly', DATE '2026-01-01', 1,
   'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'CAD'),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Salary', 3000.00, 'earning', 'monthly', DATE '2026-01-01', 1,
   'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'CAD'),
  ('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Orphan rule', 10.00, 'expense', 'monthly', DATE '2026-01-01', 1, NULL, NULL, 'CAD'),
  ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Impossible day', 20.00, 'expense', 'weekly', DATE '2026-01-01', 19,
   'a0000000-0000-0000-0000-000000000001', NULL, 'CAD'),
  -- Shares its name with the loan below: the double-count, which only the
  -- owner can resolve.
  ('b0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Home Loan', 2200.00, 'expense', 'monthly', DATE '2026-04-01', 1,
   'a0000000-0000-0000-0000-000000000001', NULL, 'CAD');

INSERT INTO recurring_skips (recurring_id, user_id, due_date, reason)
VALUES ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        DATE '2026-05-01', 'Waived');

INSERT INTO finance_loans (id, user_id, name, lender, currency, principal, annual_rate, tenure_months, first_emi_date, pay_from_account_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Home Loan', 'A Bank', 'CAD', 450000.00, 8.500, 240, DATE '2026-04-01',
   'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Unpaid loan', NULL, 'CAD', 1000.00, 5.000, 12, DATE '2026-04-01', NULL);

INSERT INTO finance_loan_events (id, user_id, loan_id, kind, effective_date, rate, effect)
VALUES ('11000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'rate_change', DATE '2026-10-01', 9.100, 'tenure');

INSERT INTO finance_budgets (id, user_id, category_id, period, amount)
VALUES ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'c0000000-0000-0000-0000-000000000001', DATE '2026-02-01', 600.0000);

-- A goal holding a stored total with no contribution history: v2 derives the
-- total, so without an opening contribution it would arrive holding nothing.
INSERT INTO financial_goals (id, user_id, name, target_amount, current_amount, currency, account_id, kind, created_at)
VALUES
  ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Emergency fund', 10000.00, 2500.00, 'CAD', 'a0000000-0000-0000-0000-000000000002', 'buffer',
   TIMESTAMPTZ '2026-01-15 00:00:00+00'),
  -- A target of zero, which produced "NaN%" in v1 and cannot exist in v2.
  ('90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Someday', 0.00, 0.00, 'CAD', NULL, NULL, TIMESTAMPTZ '2026-01-15 00:00:00+00');

-- A contribution that also wrote a ledger row, which v1's own comment said
-- would double-count.
INSERT INTO finance_goal_contributions (id, user_id, goal_id, account_id, amount, occurred_on, transaction_id)
VALUES ('91000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
        500.00, DATE '2026-02-01', '70000000-0000-0000-0000-000000000001');

INSERT INTO finance_scenarios (id, user_id, name, adjustments)
VALUES ('92000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Rent rises', '[{"kind":"income_delta","percent":-10}]'::jsonb);

INSERT INTO finance_category_rules (id, user_id, pattern, category_id, kind)
VALUES ('93000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'LOBLAWS', 'c0000000-0000-0000-0000-000000000001', 'expense');
