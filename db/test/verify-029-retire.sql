-- Verification for db/migrations/029-finance-v1-retire.sql.
--
-- Runs AFTER 029 has succeeded. Its job is to prove two things: that v1 is
-- actually gone, and — far more important — that v2 came through untouched
-- with the same money in it.
--
-- The guard's *refusal* path is tested separately, by the harness, against a
-- deliberately mismatched database. A guard that has only ever been observed
-- saying yes has not been tested.
--
-- ONE SHOT, AGAINST A FRESH DATABASE.

\set ON_ERROR_STOP on

SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.jwt = '{"aal":"aal2"}';


-- ── 1. v1 is gone ───────────────────────────────────────────────────────────

DO $$
DECLARE v_left TEXT;
BEGIN
  SELECT string_agg(tablename, ', ' ORDER BY tablename) INTO v_left
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('transactions','recurring_transactions','recurring_skips',
                       'financial_goals','finance_goal_contributions','finance_accounts',
                       'finance_categories','finance_budgets','finance_scenarios',
                       'finance_loans','finance_loan_events','finance_settings',
                       'finance_import_batches','finance_category_rules','fx_rates');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  v1 tables survived: %', v_left;
  END IF;
  RAISE NOTICE 'PASS  every v1 finance table is gone';
END $$;

DO $$
DECLARE v_left TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('account_balance','fill_transaction_money','import_transactions',
                       'undo_import','recategorise_transactions','record_goal_contribution',
                       'seed_finance_defaults');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  v1 functions survived: %', v_left;
  END IF;
  RAISE NOTICE 'PASS  every v1 finance function is gone';
END $$;


-- ── 2. v2 is intact, and still holds the same money ─────────────────────────
--
-- The figure is the one the backfill produced and the one v1 agreed with:
-- 5000.00 − 45.00 + 3000.00 − (500.00 + 5.00) − 100.00 − 6.50 = 7343.50.
-- If retiring v1 disturbed anything, this is where it shows.

DO $$
DECLARE v_balance BIGINT; v_accounts INT; v_postings INT; v_commitments INT;
BEGIN
  SELECT count(*) INTO v_accounts FROM fin_account;
  SELECT count(*) INTO v_postings FROM fin_posting;
  SELECT count(*) INTO v_commitments FROM fin_commitment;

  IF v_accounts <> 3 OR v_postings <> 7 OR v_commitments <> 5 THEN
    RAISE EXCEPTION 'FAIL  v2 holds % accounts, % postings, % commitments; expected 3, 7, 5',
      v_accounts, v_postings, v_commitments;
  END IF;

  SELECT public.fin_account_balance('a0000000-0000-0000-0000-000000000001', DATE '2026-12-31', false)
    INTO v_balance;
  IF v_balance <> 734350 THEN
    RAISE EXCEPTION 'FAIL  chequing holds % after retiring v1, expected 734350', v_balance;
  END IF;

  RAISE NOTICE 'PASS  v2 is intact and chequing still holds 734350 minor units';
END $$;

-- The goal's total is derived, so it has to survive the loss of the table it
-- was copied from.
DO $$
DECLARE v_goal BIGINT;
BEGIN
  SELECT public.fin_goal_balance('90000000-0000-0000-0000-000000000001') INTO v_goal;
  IF v_goal <> 250000 THEN
    RAISE EXCEPTION 'FAIL  the goal holds % after retiring v1, expected 250000', v_goal;
  END IF;
  RAISE NOTICE 'PASS  a derived goal total outlives the table it came from';
END $$;


-- ── 3. The ledger still enforces itself ─────────────────────────────────────
--
-- Dropping v1 cascaded through a great deal. The v2 constraint that matters
-- most has to still be there afterwards.

DO $$
DECLARE v_txn UUID; v_raised BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO fin_transaction (user_id, date, description, kind)
    VALUES ('11111111-1111-1111-1111-111111111111', DATE '2027-01-01', 'Half again', 'transfer')
    RETURNING id INTO v_txn;
    INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
    VALUES ('11111111-1111-1111-1111-111111111111', v_txn,
            'a0000000-0000-0000-0000-000000000001', -1000, 'CAD');
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  the transfer-balance trigger did not survive the retirement';
  END IF;
  RAISE NOTICE 'PASS  a half transfer is still impossible after v1 is gone';
END $$;

SELECT 'ALL CHECKS PASSED' AS result;
