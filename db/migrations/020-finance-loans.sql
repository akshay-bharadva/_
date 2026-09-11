-- 020: loans as a first-class amortising instrument.
--
-- A loan used to be representable only as a recurring expense with an end
-- date: it could say what leaves the account each month, but not how much of
-- that is interest, what the balance is, or what a rate change or a
-- prepayment would do. Indian home loans are mostly floating (tied to the RBI
-- repo rate through the lender's external benchmark), so the rate *will*
-- change, and the owner lives in Canada while the loan is in rupees.
--
-- Two tables. The loan holds the terms; its events are what happened to it —
-- rate changes and part-prepayments — from which the schedule is derived on
-- the client. Deriving rather than storing the schedule is the module's rule
-- for anything computable: a stored schedule goes stale the moment an event
-- is added, and two sources disagree.
--
-- Additive and guarded. Mirrored in db/schema.sql.

CREATE TABLE IF NOT EXISTS finance_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  lender TEXT CHECK (lender IS NULL OR char_length(lender) <= 120),
  -- The loan's own currency, which need not be the base (an INR loan held by
  -- someone budgeting in CAD). An ISO 4217 code, never a symbol.
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  principal NUMERIC(16, 2) NOT NULL CHECK (principal > 0),
  -- Annual percentage rate at the start, e.g. 8.500.
  annual_rate NUMERIC(6, 3) NOT NULL CHECK (annual_rate >= 0 AND annual_rate <= 100),
  tenure_months INT NOT NULL CHECK (tenure_months BETWEEN 1 AND 600),
  first_emi_date DATE NOT NULL,
  rate_type TEXT NOT NULL DEFAULT 'floating' CHECK (rate_type IN ('fixed', 'floating')),
  -- What a rate change does by default. Indian lenders usually hold the EMI
  -- and move the tenure; some move the EMI. Each event may override it.
  on_rate_change TEXT NOT NULL DEFAULT 'tenure' CHECK (on_rate_change IN ('tenure', 'emi')),
  -- Where the EMI is paid from — an NRO/NRE account, or a Canadian chequing
  -- account through a remittance. Nullable: closing the account must not
  -- delete the loan.
  pay_from_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  -- What the EMI forecasts under.
  category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage loans" ON finance_loans;
CREATE POLICY "Admin manage loans" ON finance_loans
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_loans_updated_at ON finance_loans;
CREATE TRIGGER update_finance_loans_updated_at BEFORE UPDATE ON finance_loans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS finance_loan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  loan_id UUID NOT NULL REFERENCES finance_loans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rate_change', 'prepayment')),
  effective_date DATE NOT NULL,
  rate NUMERIC(6, 3) CHECK (rate IS NULL OR (rate >= 0 AND rate <= 100)),
  amount NUMERIC(16, 2) CHECK (amount IS NULL OR amount > 0),
  -- Tenure: keep the EMI, finish sooner or later. EMI: keep the end date,
  -- change the instalment.
  effect TEXT CHECK (effect IS NULL OR effect IN ('tenure', 'emi')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- A rate change without a rate, or a prepayment without an amount, is a row
  -- that does nothing — reject it rather than store dead data.
  CONSTRAINT finance_loan_events_complete CHECK (
    (kind = 'rate_change' AND rate IS NOT NULL) OR
    (kind = 'prepayment' AND amount IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS finance_loan_events_loan_idx
  ON finance_loan_events(loan_id, effective_date);

ALTER TABLE finance_loan_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage loan events" ON finance_loan_events;
CREATE POLICY "Admin manage loan events" ON finance_loan_events
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
