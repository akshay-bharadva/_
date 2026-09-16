-- 026: finance v2 — commitments. What repeats, and what you owe.
--
-- Additive and guarded; requires 025. Safe to re-run.
--
-- THE DEFECT THIS FIXES. v1 had two tables describing the same kind of thing:
-- `recurring_transactions` (a repeating amount) and `finance_loans` (an
-- amortising debt). A mortgage could exist as both, and the forecast added
-- them together — `loanFlows` from the loans table and `scheduledFlows` from
-- the rules table both landed in one array with nothing to dedupe them. The
-- Loans screen asked the owner to *remember* to archive the duplicate rule.
-- Remembering is not a mechanism.
--
-- Here there is one table. A subscription is a commitment with a fixed amount;
-- a mortgage is a commitment with amortisation terms. They cannot be
-- double-counted because there is only one of them.
--
-- THE SECOND DEFECT. A v1 rule had a single `account_id` and a direction, so a
-- repeating transfer between your own accounts could not be expressed: the
-- money left and never arrived, and the forecast fell by that amount every
-- fortnight, forever. Here a commitment names `from_account_id` and/or
-- `to_account_id`, exactly as a posting pair does. Both set is a transfer.
--
-- THE THIRD. Superseding was invisible: ending a tenancy when a mortgage
-- starts meant remembering to set an end date on an unrelated row, and nothing
-- recorded *why*. `supersedes_id` says it.


-- ── 1. Shape and schedule ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE fin_frequency AS ENUM ('daily','weekly','bi-weekly','monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- 'fixed': the amount is known (rent, salary, a subscription).
  -- 'amortising': the amount is derived from the terms (a loan instalment).
  CREATE TYPE fin_commitment_kind AS ENUM ('fixed','amortising');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- What a rate change does. Indian lenders usually hold the EMI and move the
  -- tenure; some move the EMI. Each event may override the default.
  CREATE TYPE fin_rate_effect AS ENUM ('tenure','emi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_commitment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  kind          fin_commitment_kind NOT NULL DEFAULT 'fixed',

  -- ── Where the money moves ────────────────────────────────────────────────
  -- Direction is read from these, not from a type column, exactly as it is
  -- read from a posting's sign. Both set is a transfer between your own
  -- accounts — the case v1 could not represent at all.
  from_account_id UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  to_account_id   UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES fin_category(id) ON DELETE SET NULL,
  currency        CHAR(3) NOT NULL REFERENCES fin_currency(code),

  -- ── Fixed commitments ────────────────────────────────────────────────────
  amount_minor  BIGINT CHECK (amount_minor IS NULL OR amount_minor > 0),

  -- ── Amortising commitments ───────────────────────────────────────────────
  principal_minor BIGINT CHECK (principal_minor IS NULL OR principal_minor > 0),
  annual_rate     NUMERIC(6,3) CHECK (annual_rate IS NULL OR (annual_rate >= 0 AND annual_rate <= 100)),
  tenure_months   INT CHECK (tenure_months IS NULL OR tenure_months BETWEEN 1 AND 600),
  rate_type       TEXT CHECK (rate_type IS NULL OR rate_type IN ('fixed','floating')),
  on_rate_change  fin_rate_effect,
  lender          TEXT CHECK (lender IS NULL OR char_length(lender) <= 120),

  -- ── Schedule ─────────────────────────────────────────────────────────────
  frequency      fin_frequency NOT NULL DEFAULT 'monthly',
  start_date     DATE NOT NULL,
  end_date       DATE,
  -- Overloaded by frequency: day-of-week (0–6, Sunday first) for weekly and
  -- bi-weekly, day-of-month (1–31) for monthly, unused otherwise. In v1 this
  -- was a bare INT with no CHECK and the comment admitted Zod was the only
  -- thing enforcing it — so a rule written from the SQL editor or an import
  -- could hold a day its own frequency could never produce.
  occurrence_day INT,
  -- The last occurrence actually posted, for resuming the queue.
  last_posted_date DATE,

  -- ── Behaviour ────────────────────────────────────────────────────────────
  -- Off by default, and that default is the point: a biweekly salary is 1,000
  -- until two days of unpaid leave make it 800. An occurrence is a proposal
  -- with the expected amount pre-filled until a rule opts into posting itself.
  auto_post   BOOLEAN NOT NULL DEFAULT false,
  is_estimate BOOLEAN NOT NULL DEFAULT false,

  -- ── Supersession ─────────────────────────────────────────────────────────
  -- "The mortgage replaced the tenancy." Recorded rather than inferred: no
  -- matcher can know that Home Loan supersedes Rent, because the two share no
  -- words. The owner says so once, and the forecast stops counting both.
  supersedes_id UUID REFERENCES fin_commitment(id) ON DELETE SET NULL,

  notes       TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  -- A commitment that moves money nowhere describes nothing.
  CONSTRAINT fin_commitment_has_an_account
    CHECK (from_account_id IS NOT NULL OR to_account_id IS NOT NULL),
  -- Money cannot move from an account to itself.
  CONSTRAINT fin_commitment_distinct_accounts
    CHECK (from_account_id IS NULL OR to_account_id IS NULL
           OR from_account_id <> to_account_id),
  -- Each shape carries its own fields and not the other's.
  CONSTRAINT fin_commitment_shape CHECK (
    (kind = 'fixed'
       AND amount_minor IS NOT NULL
       AND principal_minor IS NULL AND annual_rate IS NULL AND tenure_months IS NULL)
    OR
    (kind = 'amortising'
       AND amount_minor IS NULL
       AND principal_minor IS NOT NULL AND annual_rate IS NOT NULL
       AND tenure_months IS NOT NULL)
  ),
  -- A rule that ends before it starts projects nothing and silently does
  -- nothing, which is worse than being rejected.
  CONSTRAINT fin_commitment_ends_after_it_starts
    CHECK (end_date IS NULL OR end_date >= start_date),
  -- The occurrence day has to be one its own frequency can produce.
  CONSTRAINT fin_commitment_occurrence_day_fits_frequency CHECK (
    CASE frequency
      WHEN 'daily'     THEN occurrence_day IS NULL
      WHEN 'yearly'    THEN occurrence_day IS NULL
      WHEN 'weekly'    THEN occurrence_day IS NULL OR occurrence_day BETWEEN 0 AND 6
      WHEN 'bi-weekly' THEN occurrence_day IS NULL OR occurrence_day BETWEEN 0 AND 6
      WHEN 'monthly'   THEN occurrence_day IS NULL OR occurrence_day BETWEEN 1 AND 31
    END
  ),
  CONSTRAINT fin_commitment_supersedes_another CHECK (supersedes_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS fin_commitment_user_idx
  ON fin_commitment (user_id, start_date) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS fin_commitment_supersedes_idx
  ON fin_commitment (supersedes_id) WHERE supersedes_id IS NOT NULL;

ALTER TABLE fin_commitment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin commitments" ON fin_commitment;
CREATE POLICY "Admin manage fin commitments" ON fin_commitment FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_commitment_updated_at ON fin_commitment;
CREATE TRIGGER update_fin_commitment_updated_at BEFORE UPDATE ON fin_commitment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. What happened to a commitment ────────────────────────────────────────
--
-- Rate changes and part-prepayments for an amortising one; an amount change
-- for a fixed one (the rent went up). The schedule is *derived* from the terms
-- plus these events, never stored: a stored schedule goes stale the moment an
-- event is added, and then two sources disagree about what you owe.

DO $$ BEGIN
  CREATE TYPE fin_commitment_event_kind AS ENUM
    ('rate_change','prepayment','amount_change','ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_commitment_event (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  commitment_id  UUID NOT NULL REFERENCES fin_commitment(id) ON DELETE CASCADE,
  kind           fin_commitment_event_kind NOT NULL,
  effective_date DATE NOT NULL,
  rate           NUMERIC(6,3) CHECK (rate IS NULL OR (rate >= 0 AND rate <= 100)),
  amount_minor   BIGINT CHECK (amount_minor IS NULL OR amount_minor > 0),
  effect         fin_rate_effect,
  note           TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at     TIMESTAMPTZ DEFAULT now(),

  -- An event without the value it exists to carry is a row that does nothing.
  CONSTRAINT fin_commitment_event_complete CHECK (
    (kind = 'rate_change'   AND rate IS NOT NULL)
    OR (kind = 'prepayment'    AND amount_minor IS NOT NULL)
    OR (kind = 'amount_change' AND amount_minor IS NOT NULL)
    OR (kind = 'ended')
  )
);

CREATE INDEX IF NOT EXISTS fin_commitment_event_idx
  ON fin_commitment_event (commitment_id, effective_date);

ALTER TABLE fin_commitment_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin commitment events" ON fin_commitment_event;
CREATE POLICY "Admin manage fin commitment events" ON fin_commitment_event FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 3. Occurrences deliberately passed over ─────────────────────────────────
--
-- The only part of the confirm queue that needs storing. Everything else is
-- derived — commitments, minus what was posted, minus these — so a commitment
-- whose amount or schedule changes cannot leave a stale queue behind.

CREATE TABLE IF NOT EXISTS fin_commitment_skip (
  commitment_id UUID NOT NULL REFERENCES fin_commitment(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  due_date      DATE NOT NULL,
  reason        TEXT CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (commitment_id, due_date)
);

ALTER TABLE fin_commitment_skip ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin commitment skips" ON fin_commitment_skip;
CREATE POLICY "Admin manage fin commitment skips" ON fin_commitment_skip FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 4. The link from the ledger ─────────────────────────────────────────────
--
-- 025 left `fin_transaction.commitment_id` a bare UUID because commitments did
-- not exist yet. Now they do, so it becomes a real foreign key. ON DELETE SET
-- NULL: deleting a commitment must not rewrite history, exactly as v1's
-- "transactions already recorded from it are kept" promised.

DO $$ BEGIN
  ALTER TABLE fin_transaction
    ADD CONSTRAINT fin_transaction_commitment_fkey
    FOREIGN KEY (commitment_id) REFERENCES fin_commitment(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- An occurrence is identified by its commitment and its *due* date, which is
-- not the date it was paid: a salary due Friday and entered Monday is still
-- Friday's occurrence. This is what stops the queue proposing it twice.
CREATE UNIQUE INDEX IF NOT EXISTS fin_transaction_occurrence_unique
  ON fin_transaction (commitment_id, occurrence_date)
  WHERE commitment_id IS NOT NULL AND occurrence_date IS NOT NULL;


-- ── 5. Reading a commitment's direction ─────────────────────────────────────
--
-- Derived from the accounts rather than stored, so it cannot disagree with
-- them. 'transfer' is the case v1 had no way to say.

CREATE OR REPLACE FUNCTION public.fin_commitment_direction(
  p_from UUID,
  p_to UUID
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NOT NULL AND p_to IS NOT NULL THEN 'transfer'
    WHEN p_from IS NOT NULL THEN 'out'
    WHEN p_to IS NOT NULL THEN 'in'
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_commitment_direction(UUID, UUID) TO authenticated;
