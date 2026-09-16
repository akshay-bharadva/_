-- 025: finance v2 — the ledger, in integer minor units.
--
-- Additive and guarded. Creates the v2 tables **alongside** v1; nothing is
-- dropped, nothing is rewritten, and the application keeps reading v1 until
-- the backfill (027) has run and been verified. Safe to re-run.
--
-- Three defects in v1 are structural, and this is what each becomes here.
--
-- 1. MONEY WAS FLOATING POINT. `transactions.amount` was NUMERIC(10,2) —
--    capped at 99,999,999.99 — while the balances derived from it were
--    NUMERIC(18,4), so the ledger had a narrower money type than its own
--    aggregates. Every amount below is BIGINT minor units: 1234 = $12.34.
--    One width everywhere, exact addition, and no decimal arithmetic in the
--    database or the client.
--
-- 2. A TRANSFER WAS A CONVENTION. Two rows sharing a `transfer_group`, written
--    together by client-side code and enforced by nothing — so a half transfer
--    was representable, and `transferSummary` had to defend against one. Worse,
--    a *recurring* transfer could not be expressed at all: a rule had one
--    account and a direction, so "move 500 to savings every fortnight"
--    projected as money leaving and never arriving. Here a transaction is a
--    header with postings, and a transfer's postings must balance.
--
-- 3. ONE OBLIGATION COULD BE DESCRIBED TWICE. A mortgage could exist as a loan
--    *and* as a recurring rule, both feeding the forecast. That is fixed in 026
--    where commitments absorb both; this file carries the link column.
--
-- The v1 decisions worth keeping are kept: balances derived rather than
-- stored, rates frozen at the transaction, RLS + AAL2 on every table,
-- SECURITY DEFINER functions that fail closed.


-- ── 1. Currencies, and how many minor units each has ────────────────────────
--
-- A reference table rather than a client-side constant, because the database
-- has to be able to check what a stored integer means. Yen has no minor unit
-- and dinar has three; a BIGINT of 1234 is ¥1,234 or 1.234 KWD or $12.34
-- depending only on this row. `src/features/finance/money/minor-units.ts`
-- mirrors it, and a test asserts the two agree.
--
-- Publicly readable like fx_rates: an ISO exponent is not private.

CREATE TABLE IF NOT EXISTS fin_currency (
  code     CHAR(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  -- 0 for JPY and VND, 3 for the Gulf dinars, 2 for almost everything.
  exponent SMALLINT NOT NULL CHECK (exponent BETWEEN 0 AND 4),
  name     TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60)
);

ALTER TABLE fin_currency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read currencies" ON fin_currency;
CREATE POLICY "Read currencies" ON fin_currency FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write currencies" ON fin_currency;
CREATE POLICY "Admin write currencies" ON fin_currency FOR ALL
  USING (public.is_aal2()) WITH CHECK (public.is_aal2());

INSERT INTO fin_currency (code, exponent, name) VALUES
  ('CAD', 2, 'Canadian Dollar'),      ('USD', 2, 'US Dollar'),
  ('INR', 2, 'Indian Rupee'),         ('EUR', 2, 'Euro'),
  ('GBP', 2, 'Pound Sterling'),       ('AUD', 2, 'Australian Dollar'),
  ('NZD', 2, 'New Zealand Dollar'),   ('AED', 2, 'UAE Dirham'),
  ('SAR', 2, 'Saudi Riyal'),          ('QAR', 2, 'Qatari Riyal'),
  ('KWD', 3, 'Kuwaiti Dinar'),        ('SGD', 2, 'Singapore Dollar'),
  ('HKD', 2, 'Hong Kong Dollar'),     ('JPY', 0, 'Japanese Yen'),
  ('CNY', 2, 'Chinese Yuan'),         ('CHF', 2, 'Swiss Franc'),
  ('SEK', 2, 'Swedish Krona'),        ('NOK', 2, 'Norwegian Krone'),
  ('DKK', 2, 'Danish Krone'),         ('PLN', 2, 'Polish Zloty'),
  ('TRY', 2, 'Turkish Lira'),         ('PKR', 2, 'Pakistani Rupee'),
  ('BDT', 2, 'Bangladeshi Taka'),     ('LKR', 2, 'Sri Lankan Rupee'),
  ('NPR', 2, 'Nepalese Rupee'),       ('PHP', 2, 'Philippine Peso'),
  ('MYR', 2, 'Malaysian Ringgit'),    ('THB', 2, 'Thai Baht'),
  ('IDR', 2, 'Indonesian Rupiah'),    ('VND', 0, 'Vietnamese Dong'),
  ('MXN', 2, 'Mexican Peso'),         ('BRL', 2, 'Brazilian Real'),
  ('ZAR', 2, 'South African Rand'),   ('NGN', 2, 'Nigerian Naira'),
  ('KES', 2, 'Kenyan Shilling'),      ('EGP', 2, 'Egyptian Pound')
ON CONFLICT (code) DO UPDATE
  SET exponent = EXCLUDED.exponent, name = EXCLUDED.name;


-- ── 2. Settings ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_settings (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  base_currency        CHAR(3) NOT NULL DEFAULT 'CAD' REFERENCES fin_currency(code),
  -- The corridor money is actually sent along, for the FX view's default.
  home_currency        CHAR(3) REFERENCES fin_currency(code),
  needs_target_pct     NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (needs_target_pct BETWEEN 0 AND 100),
  wants_target_pct     NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (wants_target_pct BETWEEN 0 AND 100),
  save_target_pct      NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (save_target_pct BETWEEN 0 AND 100),
  runway_target_months NUMERIC(4,1) NOT NULL DEFAULT 6 CHECK (runway_target_months >= 0),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin settings" ON fin_settings;
CREATE POLICY "Admin manage fin settings" ON fin_settings FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_settings_updated_at ON fin_settings;
CREATE TRIGGER update_fin_settings_updated_at BEFORE UPDATE ON fin_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3. Exchange rates ───────────────────────────────────────────────────────
--
-- Unchanged in shape from v1: quoted against one base per row, so any pair is
-- crossed as a ratio. NUMERIC(20,10) because IDR/KWD is around 0.0000010 and
-- rounding a rate to four places turns a real conversion into a wrong one.
--
-- A rate stays NUMERIC. Only *amounts* are integers; a rate is a ratio, and
-- storing it as an integer would need a scale factor nobody would remember.

CREATE TABLE IF NOT EXISTS fin_rate (
  base   CHAR(3) NOT NULL,
  quote  CHAR(3) NOT NULL,
  as_of  DATE    NOT NULL,
  rate   NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  source TEXT CHECK (source IS NULL OR char_length(source) <= 60),
  PRIMARY KEY (base, quote, as_of)
);
CREATE INDEX IF NOT EXISTS fin_rate_recent_idx ON fin_rate (base, quote, as_of DESC);
ALTER TABLE fin_rate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read fin rates" ON fin_rate;
CREATE POLICY "Read fin rates" ON fin_rate FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write fin rates" ON fin_rate;
CREATE POLICY "Admin write fin rates" ON fin_rate FOR ALL
  USING (public.is_aal2()) WITH CHECK (public.is_aal2());


-- ── 4. Accounts ─────────────────────────────────────────────────────────────
--
-- The reconciliation anchor is kept from v1 and is the reason this module
-- works for a credit card whose bill is unknown until it lands: "on
-- opening_date this account really held opening_balance_minor", and everything
-- after is derived. Correcting a drifted balance is editing two fields rather
-- than hunting for a missing row.

DO $$ BEGIN
  CREATE TYPE fin_account_kind AS ENUM
    ('chequing','savings','credit','cash','investment','loan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_account (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind         fin_account_kind NOT NULL DEFAULT 'chequing',
  currency     CHAR(3) NOT NULL REFERENCES fin_currency(code),
  institution  TEXT CHECK (char_length(coalesce(institution,'')) <= 120),

  -- Minor units, and signed: a card or a loan is stored as what is owed.
  opening_balance_minor BIGINT NOT NULL DEFAULT 0,
  opening_date          DATE NOT NULL DEFAULT CURRENT_DATE,

  credit_limit_minor BIGINT CHECK (credit_limit_minor IS NULL OR credit_limit_minor > 0),
  statement_day      INT CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  payment_due_day    INT CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),

  -- Counted in "safe to spend"; a locked retirement account is not.
  is_liquid    BOOLEAN NOT NULL DEFAULT true,
  -- Last digits of the account number, to route rows in a bank export.
  import_ref   TEXT CHECK (import_ref IS NULL OR import_ref ~ '^[0-9]{2,6}$'),
  color        TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  sort_order   INT NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_account_user_idx
  ON fin_account (user_id, sort_order) WHERE archived_at IS NULL;
ALTER TABLE fin_account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin accounts" ON fin_account;
CREATE POLICY "Admin manage fin accounts" ON fin_account FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_account_updated_at ON fin_account;
CREATE TRIGGER update_fin_account_updated_at BEFORE UPDATE ON fin_account
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 5. Categories ───────────────────────────────────────────────────────────
--
-- Note the two vocabularies, which v1 warned about in a comment and which this
-- schema now keeps genuinely apart. `bucket` classifies a *category* for
-- 50/30/20. Direction is a property of a *posting's sign*, not of an enum, so
-- there is no longer an 'earning'/'expense' type to confuse with 'income'.

DO $$ BEGIN
  CREATE TYPE fin_bucket AS ENUM ('income','need','want','save','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_category (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  bucket       fin_bucket NOT NULL DEFAULT 'want',
  icon         TEXT CHECK (char_length(coalesce(icon,'')) <= 40),
  color        TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  -- Essential in the runway sense: still payable if income stopped tomorrow.
  -- Deliberately distinct from `need`, which is about budgeting shape.
  is_essential BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE fin_category ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin categories" ON fin_category;
CREATE POLICY "Admin manage fin categories" ON fin_category FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_category_updated_at ON fin_category;
CREATE TRIGGER update_fin_category_updated_at BEFORE UPDATE ON fin_category
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 6. Transactions and postings ────────────────────────────────────────────
--
-- The header says what happened once; the postings say what moved, and where.
--
-- A SPEND is one posting: −4500 on Chequing. Its counterparty is the outside
-- world, so it does not balance and is not expected to.
--
-- A TRANSFER is one transaction with two postings — −50000 on TFSA, +50000 on
-- RRSP — and it is atomic by construction. There is no way to write half of
-- one. This is the defect that made the forecast fall by the transfer amount
-- every fortnight: v1 modelled the outgoing leg as an expense rule and had
-- nowhere to put the incoming side.
--
-- A CROSS-CURRENCY TRANSFER carries both real amounts (−1000 CAD, +60240 INR).
-- They cannot net to zero and must not be forced to: the gap *is* the
-- provider's margin, and the effective rate derived from the two figures is
-- the fact worth keeping. What is enforced is that both legs exist, in
-- different accounts, with opposite signs.

DO $$ BEGIN
  CREATE TYPE fin_transaction_kind AS ENUM
    ('spend','earn','transfer','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_transaction (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- When it hit the account, which is not necessarily when it was due.
  date            DATE NOT NULL,
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  -- The bank's own wording, verbatim; `description` is the cleaned form.
  raw_description TEXT CHECK (raw_description IS NULL OR char_length(raw_description) <= 500),
  merchant        TEXT CHECK (merchant IS NULL OR char_length(merchant) <= 200),
  notes           TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  -- Intent, for display and for the calendar. The arithmetic never reads it:
  -- direction comes from the sign of each posting.
  kind            fin_transaction_kind NOT NULL DEFAULT 'spend',
  -- Not yet cleared the bank; excluded from "what do I actually have".
  is_pending      BOOLEAN NOT NULL DEFAULT false,
  -- Filled in 026, when commitments exist. The occurrence this satisfied,
  -- which is the *due* date and not `date`: a salary due Friday and entered
  -- Monday is still Friday's occurrence.
  commitment_id   UUID,
  occurrence_date DATE,
  -- Deterministic per (account, date, amount, description, nth identical row).
  import_hash     TEXT CHECK (import_hash IS NULL OR char_length(import_hash) <= 64),
  import_batch_id UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_transaction_user_date_idx
  ON fin_transaction (user_id, date DESC);
CREATE INDEX IF NOT EXISTS fin_transaction_occurrence_idx
  ON fin_transaction (commitment_id, occurrence_date)
  WHERE commitment_id IS NOT NULL;

ALTER TABLE fin_transaction ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin transactions" ON fin_transaction;
CREATE POLICY "Admin manage fin transactions" ON fin_transaction FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_transaction_updated_at ON fin_transaction;
CREATE TRIGGER update_fin_transaction_updated_at BEFORE UPDATE ON fin_transaction
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS fin_posting (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  transaction_id UUID NOT NULL REFERENCES fin_transaction(id) ON DELETE CASCADE,
  -- Nullable so closing an account does not delete history; an unassigned
  -- posting is simply not counted in any account's balance.
  account_id     UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  category_id    UUID REFERENCES fin_category(id) ON DELETE SET NULL,

  -- Signed minor units. Negative leaves the account, positive arrives.
  -- Zero is rejected: a posting that moves nothing describes nothing.
  amount_minor   BIGINT NOT NULL CHECK (amount_minor <> 0),
  currency       CHAR(3) NOT NULL REFERENCES fin_currency(code),

  -- What the transfer itself cost — wire fee, FX margin — in this posting's
  -- currency. Kept apart from the amount so "which service should I send
  -- through" stays answerable.
  fee_minor      BIGINT CHECK (fee_minor IS NULL OR fee_minor >= 0),

  -- Frozen at the transaction, which is what stops a historical report
  -- re-pricing itself every time the market moves. Null when no rate was
  -- available: reported as unconverted, never guessed at parity, and never
  -- silently read as zero — that last one is what made the forecast's two
  -- lines identical in v1.
  fx_rate           NUMERIC(20,10) CHECK (fx_rate IS NULL OR fx_rate > 0),
  base_amount_minor BIGINT,

  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_posting_account_idx ON fin_posting (account_id);
CREATE INDEX IF NOT EXISTS fin_posting_transaction_idx ON fin_posting (transaction_id);
CREATE INDEX IF NOT EXISTS fin_posting_category_idx ON fin_posting (category_id);

ALTER TABLE fin_posting ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin postings" ON fin_posting;
CREATE POLICY "Admin manage fin postings" ON fin_posting FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 7. What makes a transfer a transfer ─────────────────────────────────────
--
-- Checked at COMMIT, not per row: the two legs of a transfer are inserted one
-- after the other, so a per-statement check would reject the first one every
-- time. A DEFERRABLE constraint trigger lets the pair be written and judges
-- the finished transaction.
--
-- Single-currency: the legs plus any fee must come to nothing, because money
-- that left one of your accounts arrived in another.
-- Cross-currency: both legs must exist in different accounts with opposite
-- signs, and nothing more is required — forcing a zero sum across currencies
-- would be inventing a rate, and the difference is the provider's margin.

CREATE OR REPLACE FUNCTION public.fin_check_transfer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- On DELETE there is no NEW, and reading it raises from inside the trigger
  -- rather than validating anything. Removing one leg of a transfer is exactly
  -- when this check matters most, so it has to survive the operation.
  v_txn         UUID := CASE WHEN TG_OP = 'DELETE'
                             THEN OLD.transaction_id
                             ELSE NEW.transaction_id END;
  v_kind        fin_transaction_kind;
  v_legs        INT;
  v_accounts    INT;
  v_unassigned  INT;
  v_currencies  INT;
  v_net         BIGINT;
  v_positive    INT;
  v_negative    INT;
BEGIN
  SELECT kind INTO v_kind FROM fin_transaction WHERE id = v_txn;
  -- The header is already gone when this fires from a cascade delete, and
  -- deleting a whole transfer is legitimate.
  IF v_kind IS NULL OR v_kind <> 'transfer' THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         count(DISTINCT account_id),
         count(*) FILTER (WHERE account_id IS NULL),
         count(DISTINCT currency),
         -- The legs alone. A provider fee is money leaving for the *outside
         -- world*, not money arriving in the other account, so it must not be
         -- part of this sum — including it rejected every transfer that cost
         -- anything to make. `fin_account_balance` charges it to the sending
         -- account separately, as `amount_minor - fee_minor`.
         coalesce(sum(amount_minor), 0),
         count(*) FILTER (WHERE amount_minor > 0),
         count(*) FILTER (WHERE amount_minor < 0)
    INTO v_legs, v_accounts, v_unassigned, v_currencies, v_net, v_positive, v_negative
    FROM fin_posting WHERE transaction_id = v_txn;

  IF v_legs < 2 THEN
    RAISE EXCEPTION 'A transfer needs both legs; transaction % has %', v_txn, v_legs;
  END IF;
  -- Two named accounts — unless a leg has been orphaned.
  --
  -- `fin_posting.account_id` is ON DELETE SET NULL, and a referential action
  -- fires row triggers, so closing an account nulls one leg of every transfer
  -- it was ever part of. Demanding two distinct accounts here would then make
  -- the account undeletable for anyone who had ever moved money — and worse,
  -- it would be the *past* refusing to let the present change. The invariant
  -- is about what was written: at write time both legs name an account, and
  -- this check holds. Afterwards, an orphaned leg is history, not an error.
  IF v_accounts < 2 AND v_unassigned = 0 THEN
    RAISE EXCEPTION 'A transfer must move between two different accounts';
  END IF;
  IF v_positive = 0 OR v_negative = 0 THEN
    RAISE EXCEPTION 'A transfer needs money leaving one account and arriving in another';
  END IF;
  IF v_currencies = 1 AND v_net <> 0 THEN
    RAISE EXCEPTION
      'A single-currency transfer must balance; transaction % is off by % minor units',
      v_txn, v_net;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fin_posting_transfer_balance ON fin_posting;
CREATE CONSTRAINT TRIGGER fin_posting_transfer_balance
  AFTER INSERT OR UPDATE OR DELETE ON fin_posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_check_transfer_balance();


-- ── 8. The balance of an account ────────────────────────────────────────────
--
-- Derived, never stored — a stored balance is a copy of a derivable fact and
-- drifts the first time a write path forgets to update it. The anchor plus
-- every posting since, in minor units, so the sum is exact integer addition
-- rather than accumulating decimal error.
--
-- A plain SQL function has no place for an IF, so the AAL2 check is a
-- predicate: an unverified session matches no row and gets NULL rather than a
-- balance. Fails closed.

CREATE OR REPLACE FUNCTION public.fin_account_balance(
  p_account UUID,
  p_as_of DATE DEFAULT CURRENT_DATE,
  p_include_pending BOOLEAN DEFAULT false
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.opening_balance_minor
       + coalesce((
           SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
             FROM fin_posting p
             JOIN fin_transaction t ON t.id = p.transaction_id
            WHERE p.account_id = a.id
              AND t.date >= a.opening_date
              AND t.date <= p_as_of
              AND (p_include_pending OR NOT t.is_pending)
         ), 0)
    FROM fin_account a
   WHERE a.id = p_account
     AND a.user_id = auth.uid()
     AND public.is_aal2();
$$;

REVOKE ALL ON FUNCTION public.fin_account_balance(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_account_balance(UUID, DATE, BOOLEAN) TO authenticated;

-- Every account at once. v1 called the per-account function in a loop from the
-- client — one request per account, all waiting on each other.
CREATE OR REPLACE FUNCTION public.fin_account_balances(
  p_as_of DATE DEFAULT CURRENT_DATE,
  p_include_pending BOOLEAN DEFAULT false
)
RETURNS TABLE (account_id UUID, balance_minor BIGINT, currency CHAR(3))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id,
         a.opening_balance_minor
         + coalesce((
             SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
               FROM fin_posting p
               JOIN fin_transaction t ON t.id = p.transaction_id
              WHERE p.account_id = a.id
                AND t.date >= a.opening_date
                AND t.date <= p_as_of
                AND (p_include_pending OR NOT t.is_pending)
           ), 0),
         a.currency
    FROM fin_account a
   WHERE a.user_id = auth.uid()
     AND public.is_aal2()
     AND a.archived_at IS NULL
   ORDER BY a.sort_order, a.name;
$$;

REVOKE ALL ON FUNCTION public.fin_account_balances(DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_account_balances(DATE, BOOLEAN) TO authenticated;
