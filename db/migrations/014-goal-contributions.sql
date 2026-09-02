-- ============================================================================
-- 014 — Goal contributions: where the money came from, and a way back out
-- ============================================================================
--
-- `financial_goals` held `current_amount` and nothing else: no account, no
-- history, and no path in the other direction. "Add to goal" was a counter
-- that went up while no money moved and nothing recorded where it came from,
-- which is exactly what the owner noticed.
--
-- The client already wrote a matching ledger row, but with two defects worth
-- naming, because both are the reason this becomes a database function:
--
--   1. **The row was attributed to no account.** `account_id` was never set,
--      so the money left the ledger from nowhere in particular and no balance
--      moved. That is precisely the "from which account?" the owner asked for.
--   2. **The two writes were independent, and the second one only warned.** A
--      failed transaction insert was `console.warn`ed while the goal total had
--      already gone up, so the goal could climb with nothing recording it. The
--      read-modify-write on `current_amount` also loses an amount whenever two
--      contributions race. Every other multi-step write in this schema is an
--      RPC for exactly this reason.
--
-- A negative amount is a withdrawal, and books the ledger row the other way.
-- Emergencies are the entire reason an emergency fund exists, and a goal you
-- can only add to is a goal that lies the first time you need it.
--
-- Additive and safe to re-run.

CREATE TABLE IF NOT EXISTS finance_goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  -- Nullable, and ON DELETE SET NULL: closing an account must not erase the
  -- history of what was set aside from it.
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  -- Positive puts money aside, negative takes it back out.
  amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  -- The ledger row this produced. Nullable so history survives a transaction
  -- being deleted from the ledger, rather than the contribution vanishing with
  -- it and the goal total then describing nothing.
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_goal_contributions_goal_idx
  ON finance_goal_contributions(goal_id, occurred_on DESC);

ALTER TABLE finance_goal_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage goal contributions" ON finance_goal_contributions;
CREATE POLICY "Admin manage goal contributions" ON finance_goal_contributions
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

-- ----------------------------------------------------------------------------
-- Recording one, atomically.
-- ----------------------------------------------------------------------------
--
-- The contribution row and the running total on the goal must not be written
-- separately: a client-side read-modify-write loses an amount whenever two
-- operations race, which is the reason every other multi-step write in this
-- schema is an RPC.
--
-- SECURITY DEFINER, so it steps over RLS and has to re-check AAL2 itself.
-- `GRANT ... TO authenticated` is not that check: `authenticated` includes a
-- session that has passed a password and not the second factor. This is the
-- lesson migration 011 exists for.
CREATE OR REPLACE FUNCTION public.record_goal_contribution(
  p_goal_id UUID,
  p_amount NUMERIC,
  p_account_id UUID DEFAULT NULL,
  p_occurred_on DATE DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS financial_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_goal           financial_goals;
  v_transaction_id UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_amount = 0 OR p_amount IS NULL THEN
    RAISE EXCEPTION 'A contribution of nothing is not a contribution';
  END IF;

  SELECT * INTO v_goal FROM financial_goals
   WHERE id = p_goal_id AND user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;

  -- An account, when given, has to be the caller's own. Without this check a
  -- definer function would happily attribute an earmark to somebody else's
  -- account id.
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM finance_accounts
     WHERE id = p_account_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  -- Floored at zero: a goal holding a negative amount describes nothing, and
  -- the arithmetic that produced it is a mistake the reader cannot see.
  IF v_goal.current_amount + p_amount < 0 THEN
    RAISE EXCEPTION 'That is more than the goal holds';
  END IF;

  -- The ledger row, only when an account was named. Putting money aside is a
  -- spend from that account; taking it back is money returning to it. With no
  -- account there is nothing to debit, and inventing one would be worse than
  -- recording the contribution alone.
  IF p_account_id IS NOT NULL THEN
    INSERT INTO transactions
      (user_id, date, description, amount, type, category, account_id)
    VALUES (
      v_uid,
      COALESCE(p_occurred_on, CURRENT_DATE),
      CASE WHEN p_amount > 0
        THEN 'To goal: ' || v_goal.name
        ELSE 'From goal: ' || v_goal.name
      END,
      abs(p_amount),
      CASE WHEN p_amount > 0 THEN 'expense' ELSE 'earning' END::transaction_type,
      'Savings & Goals',
      p_account_id
    )
    RETURNING id INTO v_transaction_id;
  END IF;

  INSERT INTO finance_goal_contributions
    (user_id, goal_id, account_id, amount, occurred_on, note, transaction_id)
  VALUES
    (v_uid, p_goal_id, p_account_id, p_amount,
     COALESCE(p_occurred_on, CURRENT_DATE), p_note, v_transaction_id);

  UPDATE financial_goals
     SET current_amount = current_amount + p_amount
   WHERE id = p_goal_id
  RETURNING * INTO v_goal;

  RETURN v_goal;
END;
$$;

REVOKE ALL ON FUNCTION public.record_goal_contribution(UUID, NUMERIC, UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_goal_contribution(UUID, NUMERIC, UUID, DATE, TEXT) TO authenticated;
