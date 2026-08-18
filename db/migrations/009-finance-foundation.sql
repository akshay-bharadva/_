-- =============================================================================
-- 009 — Finance foundation: currencies, accounts, categories, confirm queue
-- =============================================================================
--
-- The finance module had three flat tables — transactions, recurring, goals —
-- and no concept of currency at all. Amounts were bare numbers and `$` was
-- hard-coded into the render. That is workable until you earn in one country
-- and support people in another, at which point every figure on the screen is
-- ambiguous and the "total" is arithmetic on incompatible units.
--
-- THE TWO DECISIONS THAT SHAPE EVERYTHING HERE
-- --------------------------------------------
--
-- 1. **Rates are frozen at the transaction.** Every row carries the amount, its
--    own currency, and the rate to the base currency *on the day it happened*.
--    Converting the past at today's rate silently rewrites your history every
--    time the market moves — last March's grocery bill is not a floating
--    quantity, and a report that changes when you did nothing is not a report.
--
-- 2. **Balances anchor on a reconciliation, not on a complete ledger.** An
--    account stores "on this date the real balance was X" and derives forward
--    from there. You never have to enter every coffee to keep a balance
--    accurate — you correct the anchor when a statement arrives. This is what
--    makes a credit card, whose bill is genuinely unknown until it lands,
--    tractable rather than a source of constant small lies.
--
-- AND THE ONE THAT SHAPES AUTOMATION
-- ----------------------------------
-- Recurring items are **proposed, not posted**. A biweekly salary is 1,000
-- until two days of unpaid leave make it 800; a utility bill is an estimate
-- until it arrives. So an occurrence becomes a real transaction only when it is
-- confirmed, with the expected amount pre-filled and editable. `auto_post` is
-- opt-in per rule, for the genuinely fixed ones.
--
-- Pending occurrences are **derived**, not stored — from the rules, minus what
-- has already been posted, minus explicit skips. A stored queue would drift the
-- moment a rule changed.
--
-- Safe to re-run. Additive: nothing here drops or rewrites existing rows.
-- =============================================================================


-- ── 1. Currency reference ───────────────────────────────────────────────────
--
-- The user's chosen base currency: the one every report totals in. Stored per
-- user rather than per row, because it is a viewing preference — the frozen
-- rates below are what make changing it non-destructive.

CREATE TABLE IF NOT EXISTS finance_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  base_currency     CHAR(3) NOT NULL DEFAULT 'CAD',
  -- The corridor this person actually sends money along, so the FX view has a
  -- default worth showing on first open.
  home_currency     CHAR(3),
  -- 50/30/20 is the default coaching frame; these let it be tuned or ignored.
  needs_target_pct  NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (needs_target_pct BETWEEN 0 AND 100),
  wants_target_pct  NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (wants_target_pct BETWEEN 0 AND 100),
  save_target_pct   NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (save_target_pct BETWEEN 0 AND 100),
  -- Months of essential spending the emergency fund should cover.
  runway_target_months NUMERIC(4,1) NOT NULL DEFAULT 6 CHECK (runway_target_months >= 0),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage finance settings" ON finance_settings;
CREATE POLICY "Admin manage finance settings" ON finance_settings FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_settings_updated_at ON finance_settings;
CREATE TRIGGER update_finance_settings_updated_at BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. Exchange rates ───────────────────────────────────────────────────────
--
-- Quoted against a single base per row so any pair can be crossed as a ratio.
-- NUMERIC(20,10): IDR/KWD is around 0.0000010, and rounding a rate to four
-- places turns a real conversion into a wrong one.
--
-- Publicly readable is deliberate and safe — an ECB reference rate is not
-- anybody's private information, and sharing the cache across the (single)
-- user costs nothing.

CREATE TABLE IF NOT EXISTS fx_rates (
  base   CHAR(3) NOT NULL,
  quote  CHAR(3) NOT NULL,
  as_of  DATE    NOT NULL,
  rate   NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  source TEXT,
  PRIMARY KEY (base, quote, as_of)
);
CREATE INDEX IF NOT EXISTS fx_rates_recent_idx ON fx_rates (base, quote, as_of DESC);
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read fx rates" ON fx_rates;
CREATE POLICY "Read fx rates" ON fx_rates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write fx rates" ON fx_rates;
CREATE POLICY "Admin write fx rates" ON fx_rates FOR ALL
  USING (public.is_aal2()) WITH CHECK (public.is_aal2());


-- ── 3. Accounts ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE account_kind AS ENUM
    ('chequing','savings','credit','cash','investment','loan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS finance_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind         account_kind NOT NULL DEFAULT 'chequing',
  currency     CHAR(3) NOT NULL,
  institution  TEXT CHECK (char_length(coalesce(institution,'')) <= 120),

  -- The reconciliation anchor. "On opening_date this account really held
  -- opening_balance." Everything after is derived from transactions, so
  -- correcting a drifted balance is editing two fields rather than hunting for
  -- a missing row.
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Credit cards only. The limit powers a utilisation warning; the two days
  -- power "your statement lands in 3 days" in the forecast.
  credit_limit    NUMERIC(18,4) CHECK (credit_limit IS NULL OR credit_limit > 0),
  statement_day   INT CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  payment_due_day INT CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),

  -- Excluded from net worth and from "safe to spend", but still ledgered:
  -- a locked retirement account is real money you cannot touch this month.
  is_liquid    BOOLEAN NOT NULL DEFAULT true,
  color        TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  sort_order   INT NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_accounts_user_idx
  ON finance_accounts (user_id, sort_order) WHERE archived_at IS NULL;
ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage accounts" ON finance_accounts;
CREATE POLICY "Admin manage accounts" ON finance_accounts FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_accounts_updated_at ON finance_accounts;
CREATE TRIGGER update_finance_accounts_updated_at BEFORE UPDATE ON finance_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 4. Categories ───────────────────────────────────────────────────────────
--
-- `category` was free text on every transaction, so "Groceries", "groceries"
-- and "Grocery" were three categories and no budget could be attached to any
-- of them. A real table also carries the one field the coaching needs:
-- `bucket`, which is what makes a 50/30/20 check possible at all.

-- 'income' here is the 50/30/20 vocabulary for classifying a *category*.
-- The existing `transaction_type` enum uses 'earning' for the direction of a
-- *transaction*. They are different things; do not assume one from the other.
DO $$ BEGIN
  CREATE TYPE category_bucket AS ENUM ('income','need','want','save','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS finance_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  bucket      category_bucket NOT NULL DEFAULT 'want',
  icon        TEXT CHECK (char_length(coalesce(icon,'')) <= 40),
  color       TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  -- Essential in the runway sense: what you would still be paying if income
  -- stopped tomorrow. Distinct from `need`, which is about budgeting shape.
  is_essential BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage categories" ON finance_categories;
CREATE POLICY "Admin manage categories" ON finance_categories FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_categories_updated_at ON finance_categories;
CREATE TRIGGER update_finance_categories_updated_at BEFORE UPDATE ON finance_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 5. Transactions gain currency, an account, and a home ───────────────────
--
-- Existing rows keep working: everything added is nullable or defaulted, and a
-- row with no account_id is simply unassigned rather than broken.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id   UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id  UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency     CHAR(3),
  -- Units of base currency per unit of `currency`, on the day of the
  -- transaction. 1 when they are the same. This column is the whole reason a
  -- historical report stays put.
  ADD COLUMN IF NOT EXISTS fx_rate      NUMERIC(20,10) CHECK (fx_rate IS NULL OR fx_rate > 0),
  -- Denormalised `amount * fx_rate`, so every aggregate is a plain SUM instead
  -- of a join to a rate table per row.
  ADD COLUMN IF NOT EXISTS base_amount  NUMERIC(18,4),
  -- Both legs of a transfer share this. A transfer is two rows, not a special
  -- table, so the ledger stays one queryable thing.
  ADD COLUMN IF NOT EXISTS transfer_group UUID,
  -- What the transfer itself cost — wire fee, FX margin. The number that makes
  -- "which service should I send through" answerable.
  ADD COLUMN IF NOT EXISTS fee_amount   NUMERIC(18,4) CHECK (fee_amount IS NULL OR fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS merchant     TEXT CHECK (char_length(coalesce(merchant,'')) <= 200),
  ADD COLUMN IF NOT EXISTS notes        TEXT CHECK (char_length(coalesce(notes,'')) <= 2000),
  -- Pending until it clears the bank. Kept out of "what do I actually have".
  ADD COLUMN IF NOT EXISTS is_pending   BOOLEAN NOT NULL DEFAULT false,
  -- Set when a confirmed recurring occurrence produced this row, so the same
  -- occurrence is never proposed twice.
  ADD COLUMN IF NOT EXISTS occurrence_date DATE;

CREATE INDEX IF NOT EXISTS transactions_account_date_idx
  ON transactions (account_id, date DESC);
CREATE INDEX IF NOT EXISTS transactions_transfer_idx
  ON transactions (transfer_group) WHERE transfer_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_occurrence_idx
  ON transactions (recurring_transaction_id, occurrence_date)
  WHERE recurring_transaction_id IS NOT NULL;

/**
 * Fill currency, rate and base amount on write.
 *
 * Doing this in the database rather than the client means a row inserted from
 * the SQL editor, a CSV import or a future script is as consistent as one typed
 * into the form — and `base_amount` can never disagree with `amount * fx_rate`,
 * which is the kind of drift that makes a total quietly wrong.
 */
CREATE OR REPLACE FUNCTION public.fill_transaction_money()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Named `base_ccy`, not `base`. `fx_rates` has a column called `base`, and a
  -- plpgsql variable of the same name makes every reference to it ambiguous —
  -- which Postgres reports at runtime, from inside a trigger, on the first
  -- transaction anyone saves.
  base_ccy CHAR(3);
BEGIN
  SELECT s.base_currency INTO base_ccy
    FROM finance_settings s WHERE s.user_id = NEW.user_id;
  base_ccy := coalesce(base_ccy, 'CAD');

  IF NEW.currency IS NULL THEN
    -- Inherit the account's currency; fall back to base for an unassigned row.
    SELECT a.currency INTO NEW.currency
      FROM finance_accounts a WHERE a.id = NEW.account_id;
    NEW.currency := coalesce(NEW.currency, base_ccy);
  END IF;

  IF NEW.fx_rate IS NULL THEN
    IF NEW.currency = base_ccy THEN
      NEW.fx_rate := 1;
    ELSE
      -- Most recent rate on or before the transaction date. A rate from after
      -- the fact would be exactly the retro-pricing this design exists to stop.
      SELECT r.rate INTO NEW.fx_rate
        FROM fx_rates r
       WHERE r.base = NEW.currency AND r.quote = base_ccy AND r.as_of <= NEW.date
       ORDER BY r.as_of DESC LIMIT 1;

      IF NEW.fx_rate IS NULL THEN
        -- Only the opposite direction is cached, so invert it.
        SELECT 1 / r.rate INTO NEW.fx_rate
          FROM fx_rates r
         WHERE r.base = base_ccy AND r.quote = NEW.currency AND r.as_of <= NEW.date
         ORDER BY r.as_of DESC LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- No rate available is not an error: the row is worth keeping, and the UI
  -- reports it as unconverted rather than inventing a number.
  IF NEW.fx_rate IS NOT NULL THEN
    NEW.base_amount := round(NEW.amount * NEW.fx_rate, 4);
  ELSE
    NEW.base_amount := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_transaction_money ON transactions;
CREATE TRIGGER fill_transaction_money
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.fill_transaction_money();


-- ── 6. Recurring rules: propose, do not post ────────────────────────────────

ALTER TABLE recurring_transactions
  ADD COLUMN IF NOT EXISTS account_id  UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency    CHAR(3),
  -- Off by default, and that default is the point. A biweekly salary is 1,000
  -- until two days of unpaid leave make it 800, and a utility bill is a guess
  -- until it arrives — so an occurrence is a proposal with the expected amount
  -- pre-filled, and becomes real only when confirmed. Opt in per rule for the
  -- genuinely fixed ones.
  ADD COLUMN IF NOT EXISTS auto_post   BOOLEAN NOT NULL DEFAULT false,
  -- Marks the amount as a typical figure rather than a fixed one, so the
  -- forecast can show a band instead of a false straight line.
  ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes       TEXT CHECK (char_length(coalesce(notes,'')) <= 2000),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- An occurrence deliberately passed over — a month you were not billed, a
-- paycheque that did not come. The only part of the confirm queue that needs
-- storing: everything else is derived from the rules minus what was posted.
CREATE TABLE IF NOT EXISTS recurring_skips (
  recurring_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  due_date     DATE NOT NULL,
  reason       TEXT CHECK (char_length(coalesce(reason,'')) <= 200),
  created_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (recurring_id, due_date)
);
ALTER TABLE recurring_skips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage recurring skips" ON recurring_skips;
CREATE POLICY "Admin manage recurring skips" ON recurring_skips FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 7. Budgets ──────────────────────────────────────────────────────────────
--
-- One row per category per month. `period` is the first of the month, so a
-- budget is addressable without a range query, and last month's number is a
-- fact rather than something recomputed from a "current" budget.

CREATE TABLE IF NOT EXISTS finance_budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category_id UUID NOT NULL REFERENCES finance_categories(id) ON DELETE CASCADE,
  period      DATE NOT NULL,
  amount      NUMERIC(18,4) NOT NULL CHECK (amount >= 0),
  -- Underspend carries into next month rather than evaporating, which is what
  -- makes a budget survive an irregular expense instead of being abandoned.
  rollover    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_id, period),
  CONSTRAINT finance_budgets_period_is_month CHECK (date_trunc('month', period) = period)
);
ALTER TABLE finance_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage budgets" ON finance_budgets;
CREATE POLICY "Admin manage budgets" ON finance_budgets FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_budgets_updated_at ON finance_budgets;
CREATE TRIGGER update_finance_budgets_updated_at BEFORE UPDATE ON finance_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 8. Scenarios ────────────────────────────────────────────────────────────
--
-- "What if I cut dining by 30%", "what if rent rises 200", "what if I send 500
-- home every month". Adjustments are JSONB because the shape is a union that
-- will grow, and the app validates it — a table per adjustment kind would be
-- three joins to answer one question.

CREATE TABLE IF NOT EXISTS finance_scenarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (char_length(coalesce(description,'')) <= 2000),
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage scenarios" ON finance_scenarios;
CREATE POLICY "Admin manage scenarios" ON finance_scenarios FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_scenarios_updated_at ON finance_scenarios;
CREATE TRIGGER update_finance_scenarios_updated_at BEFORE UPDATE ON finance_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 9. Goals gain a currency and a link ─────────────────────────────────────

ALTER TABLE financial_goals
  ADD COLUMN IF NOT EXISTS currency   CHAR(3),
  -- A goal funded by a real account shows real progress instead of a number
  -- you remembered to update.
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind       TEXT CHECK (kind IS NULL OR kind IN ('save','payoff','buffer')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;


-- ── 10. Derived account balance ─────────────────────────────────────────────
--
-- The anchor plus everything since. Written as a function rather than a stored
-- column because a stored balance is a copy of a derivable fact, and it drifts
-- the first time any write path forgets to update it.

CREATE OR REPLACE FUNCTION public.account_balance(
  account UUID,
  as_of   DATE DEFAULT CURRENT_DATE,
  include_pending BOOLEAN DEFAULT false
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(a.opening_balance, 0)
    + coalesce((
        SELECT sum(
          -- `transaction_type` is ('earning','expense') — NOT ('income',...).
          -- `category_bucket` below does use 'income', because it classifies
          -- a category rather than a transaction's direction. Two enums, two
          -- vocabularies, and mixing them is a runtime error not a type one.
          CASE WHEN t.type = 'earning' THEN t.amount ELSE -t.amount END
          - coalesce(t.fee_amount, 0)
        )
        FROM transactions t
        WHERE t.account_id = a.id
          AND t.date >= a.opening_date
          AND t.date <= account_balance.as_of
          AND (include_pending OR NOT t.is_pending)
      ), 0)
  FROM finance_accounts a
  WHERE a.id = account_balance.account
    AND a.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.account_balance(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_balance(UUID, DATE, BOOLEAN) TO authenticated;


-- ── 11. Seed the defaults a new user needs ──────────────────────────────────
--
-- A category list you have to invent from nothing is a module you abandon on
-- day one. `bucket` and `is_essential` are pre-set because they are the fields
-- that make the coaching work, and nobody would guess to fill them in.

CREATE OR REPLACE FUNCTION public.seed_finance_defaults(base CHAR(3) DEFAULT 'CAD')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO finance_settings (user_id, base_currency)
  VALUES (uid, base) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO finance_categories (user_id, name, bucket, is_essential, sort_order)
  VALUES
    (uid, 'Salary',            'income',   false, 10),
    (uid, 'Freelance',         'income',   false, 20),
    (uid, 'Rent',              'need',     true,  30),
    (uid, 'Utilities',         'need',     true,  40),
    (uid, 'Groceries',         'need',     true,  50),
    (uid, 'Transport',         'need',     true,  60),
    (uid, 'Phone & internet',  'need',     true,  70),
    (uid, 'Insurance',         'need',     true,  80),
    (uid, 'Healthcare',        'need',     true,  90),
    (uid, 'Family support',    'need',     true,  100),
    (uid, 'Dining out',        'want',     false, 110),
    (uid, 'Shopping',          'want',     false, 120),
    (uid, 'Entertainment',     'want',     false, 130),
    (uid, 'Travel',            'want',     false, 140),
    (uid, 'Subscriptions',     'want',     false, 150),
    (uid, 'Savings',           'save',     false, 160),
    (uid, 'Investments',       'save',     false, 170),
    (uid, 'Debt repayment',    'save',     false, 180),
    (uid, 'Transfer',          'transfer', false, 190)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_defaults(CHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_defaults(CHAR) TO authenticated;


-- ── 12. Check ───────────────────────────────────────────────────────────────
-- Run `SELECT seed_finance_defaults('CAD');` next, as the signed-in admin, to
-- create the settings row and the starter categories.

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name IN ('currency','fx_rate','base_amount','account_id')) AS transaction_columns,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('finance_accounts','finance_categories','finance_budgets',
                         'finance_scenarios','finance_settings','fx_rates','recurring_skips')) AS new_tables;
