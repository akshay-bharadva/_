-- 027: finance v2 — budgets, goals, scenarios, imports.
--
-- Additive and guarded; requires 025 and 026. Safe to re-run.
--
-- Three v1 decisions are deliberately *not* carried over, each because it was
-- a bug rather than a design:
--
-- 1. A GOAL WROTE LEDGER ROWS. `finance_goal_contributions` says in its own
--    comment that a goal is "an earmark, not a transfer: money moved into a
--    goal is still in the account, so writing ledger rows for it would
--    double-count against the transactions that earned or spent it" — and
--    `record_goal_contribution` then wrote a ledger row whenever an account
--    was named. The code and its own documentation disagreed. Here the comment
--    wins: an earmark is an earmark, and `fin_goal_contribution` has no
--    `transaction_id` because there is no transaction.
--
-- 2. A GOAL STORED ITS OWN TOTAL. `current_amount` was a column updated by
--    read-then-add, which loses a contribution whenever two race — migration
--    014 had to introduce `FOR UPDATE` to paper over it. A total derived from
--    the contributions cannot drift from them and cannot race.
--
-- 3. `target_amount` HAD NO CHECK. A goal with a target of zero produced
--    `0 / 0` → "NaN%" on screen, and a non-zero balance over a zero target
--    produced Infinity, which `Math.min(_, 100)` quietly turned into a goal
--    that claimed to be complete. `goalProgressPercent` still carries the
--    guards. The column now makes the state unreachable.


-- ── 1. Budgets ──────────────────────────────────────────────────────────────
--
-- One row per category per month. `period` is the first of the month, so a
-- budget is addressable without a range query and last month's figure is a
-- fact rather than something recomputed from a "current" budget.

CREATE TABLE IF NOT EXISTS fin_budget (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category_id  UUID NOT NULL REFERENCES fin_category(id) ON DELETE CASCADE,
  period       DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  -- An amount with no currency is meaningless, and v1's budget table had none
  -- — it simply assumed base. Stated, so a base-currency change cannot
  -- silently re-price every budget you ever set.
  currency     CHAR(3) NOT NULL REFERENCES fin_currency(code),
  -- Underspend carries into next month rather than evaporating, which is what
  -- makes a budget survive an irregular expense instead of being abandoned.
  rollover     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_id, period),
  CONSTRAINT fin_budget_period_is_a_month CHECK (date_trunc('month', period) = period)
);
ALTER TABLE fin_budget ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin budgets" ON fin_budget;
CREATE POLICY "Admin manage fin budgets" ON fin_budget FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_budget_updated_at ON fin_budget;
CREATE TRIGGER update_fin_budget_updated_at BEFORE UPDATE ON fin_budget
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. Goals ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE fin_goal_kind AS ENUM ('save','payoff','buffer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_goal (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description  TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  -- Strictly positive: a goal of nothing is not a goal, and it was the source
  -- of "NaN%" and of goals that claimed to be complete on an empty balance.
  target_minor BIGINT NOT NULL CHECK (target_minor > 0),
  currency     CHAR(3) NOT NULL REFERENCES fin_currency(code),
  target_date  DATE,
  -- Where the money is kept, so progress is observed rather than remembered.
  account_id   UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  kind         fin_goal_kind,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
  -- Note the absence of `current_amount`. See the header.
);
ALTER TABLE fin_goal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin goals" ON fin_goal;
CREATE POLICY "Admin manage fin goals" ON fin_goal FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_goal_updated_at ON fin_goal;
CREATE TRIGGER update_fin_goal_updated_at BEFORE UPDATE ON fin_goal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Money set aside, and taken back out. Positive puts aside, negative reclaims.
-- No `transaction_id`: an earmark does not move money, so there is no ledger
-- row for it to point at.
CREATE TABLE IF NOT EXISTS fin_goal_contribution (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  goal_id      UUID NOT NULL REFERENCES fin_goal(id) ON DELETE CASCADE,
  -- Nullable and SET NULL: closing an account must not erase the record of
  -- what was set aside from it.
  account_id   UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
  occurred_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_goal_contribution_goal_idx
  ON fin_goal_contribution (goal_id, occurred_on DESC);
ALTER TABLE fin_goal_contribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin goal contributions" ON fin_goal_contribution;
CREATE POLICY "Admin manage fin goal contributions" ON fin_goal_contribution FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

-- What a goal holds: the sum of its contributions, derived.
CREATE OR REPLACE FUNCTION public.fin_goal_balance(p_goal UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(sum(amount_minor), 0)::BIGINT
    FROM fin_goal_contribution WHERE goal_id = p_goal;
$$;
GRANT EXECUTE ON FUNCTION public.fin_goal_balance(UUID) TO authenticated;

-- A goal cannot hold less than nothing. v1 enforced this inside one RPC, so
-- any other write path could drive a goal negative; here it holds however the
-- row arrives. Deferred, and reading OLD on a DELETE — taking money back out
-- is exactly when this matters.
CREATE OR REPLACE FUNCTION public.fin_check_goal_not_negative()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal    UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.goal_id ELSE NEW.goal_id END;
  v_balance BIGINT;
BEGIN
  -- Gone entirely when the goal itself was deleted; the cascade is fine.
  IF NOT EXISTS (SELECT 1 FROM fin_goal WHERE id = v_goal) THEN
    RETURN NULL;
  END IF;

  SELECT public.fin_goal_balance(v_goal) INTO v_balance;
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'That is more than the goal holds (it would leave % minor units)', v_balance;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fin_goal_contribution_not_negative ON fin_goal_contribution;
CREATE CONSTRAINT TRIGGER fin_goal_contribution_not_negative
  AFTER INSERT OR UPDATE OR DELETE ON fin_goal_contribution
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_check_goal_not_negative();


-- ── 3. Scenarios ────────────────────────────────────────────────────────────
--
-- "What if I cut dining by 30%", "what if rent rises 200". Adjustments are
-- JSONB because the shape is a union that belongs in one place — the Zod
-- schema — rather than in five columns that are null four times out of five.
-- The column still insists it is a list, which is the one thing JSONB can
-- usefully promise here.

CREATE TABLE IF NOT EXISTS fin_scenario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fin_scenario_adjustments_is_a_list
    CHECK (jsonb_typeof(adjustments) = 'array')
);
ALTER TABLE fin_scenario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin scenarios" ON fin_scenario;
CREATE POLICY "Admin manage fin scenarios" ON fin_scenario FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_scenario_updated_at ON fin_scenario;
CREATE TRIGGER update_fin_scenario_updated_at BEFORE UPDATE ON fin_scenario
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 4. Imports ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_import_batch (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  account_id    UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  file_name     TEXT CHECK (file_name IS NULL OR char_length(file_name) <= 255),
  format        TEXT NOT NULL CHECK (char_length(format) BETWEEN 1 AND 40),
  rows_in_file  INT NOT NULL DEFAULT 0 CHECK (rows_in_file >= 0),
  rows_imported INT NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
  rows_skipped  INT NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
  date_from     DATE,
  date_to       DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_import_batch_user_idx
  ON fin_import_batch (user_id, created_at DESC);
ALTER TABLE fin_import_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin import batches" ON fin_import_batch;
CREATE POLICY "Admin manage fin import batches" ON fin_import_batch FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

-- 025 left `import_batch_id` a bare UUID because batches did not exist yet.
-- ON DELETE SET NULL: forgetting an import must not delete the rows it
-- brought in, which is a different decision from undoing it.
DO $$ BEGIN
  ALTER TABLE fin_transaction
    ADD CONSTRAINT fin_transaction_import_batch_fkey
    FOREIGN KEY (import_batch_id) REFERENCES fin_import_batch(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The dedupe that makes importing the same statement twice a no-op. In v1 this
-- was `(user_id, account_id, import_hash)`, but the account now lives on the
-- posting rather than the transaction — and the hash is already computed per
-- account ("deterministic per account, date, amount, description, nth
-- identical row"), so the account adds nothing to the key.
CREATE UNIQUE INDEX IF NOT EXISTS fin_transaction_import_hash_unique
  ON fin_transaction (user_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- A category learned from a correction during an import.
CREATE TABLE IF NOT EXISTS fin_category_rule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- A normalised merchant key: "LOBLAWS", "ETRANSFER JOHN DOE".
  pattern     TEXT NOT NULL CHECK (char_length(pattern) BETWEEN 2 AND 120),
  category_id UUID REFERENCES fin_category(id) ON DELETE CASCADE,
  -- 'transfer' marks the merchant as money moving between your own accounts.
  kind        TEXT NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense','income','transfer')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pattern)
);
ALTER TABLE fin_category_rule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin category rules" ON fin_category_rule;
CREATE POLICY "Admin manage fin category rules" ON fin_category_rule FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_category_rule_updated_at ON fin_category_rule;
CREATE TRIGGER update_fin_category_rule_updated_at BEFORE UPDATE ON fin_category_rule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
