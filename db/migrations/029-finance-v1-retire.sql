-- =============================================================================
-- 029: retire finance v1 — DESTRUCTIVE. Read all of this before running it.
-- =============================================================================
--
--   THIS DELETES EVERY v1 FINANCE TABLE: transactions, recurring_transactions,
--   financial_goals, finance_accounts, finance_categories, finance_budgets,
--   finance_loans, finance_scenarios, fx_rates and the rest.
--
-- After this runs, `db/rollback-finance-v2.sql` is NOT a way back. There would
-- be nothing to fall back to. Restore from the backup instead.
--
-- RUN THIS LAST, AND NOT SOON. The right moment is weeks after 028, once you
-- have actually used the module against v2 and believe its numbers.
--
-- ── Prerequisites this file CAN check ───────────────────────────────────────
--
-- It refuses unless v2 agrees with v1 row for row and balance for balance, and
-- unless the calendar's RPC has stopped reading `transactions`. See
-- `fin_v1_retirement_blockers()` below: it returns an empty string when it is
-- safe to proceed, and a description of every reason it is not otherwise.
--
-- ── Prerequisites it CANNOT check ───────────────────────────────────────────
--
-- These are yours to confirm, because no query can see them:
--
--   * ~~`dashboardApi.ts` still queries `transactions`,
--     `recurring_transactions` and `financial_goals` directly~~ — DONE.
--     Migration 031 added `fin_day_money()`, the dashboard now calls it, and
--     the other two reads were deleted rather than ported: both were fetched on
--     every dashboard load and rendered by nothing.
--   * ~~The finance UI must be running against v2~~ — DONE. `/admin/finance`
--     renders the rebuilt module, and v1's UI and its four API slices have been
--     deleted. Nothing in `src/` reads a v1 finance table any more.
--   * You have a restorable backup, and have restored it somewhere once to
--     prove it restores. A backup nobody has tested is a hope. **This one is
--     still yours**, and it is the reason not to run this today.
--
-- So the code-side prerequisites are met. The advice above still stands: the
-- right moment is weeks of real use later, not the afternoon the cutover
-- landed. Nothing breaks by waiting, and the v1 tables cost only disk.


-- ── 1. The guard ────────────────────────────────────────────────────────────
--
-- A function rather than an inline block, so it can be called and tested on
-- its own — including in the state where it is supposed to refuse.

CREATE OR REPLACE FUNCTION public.fin_v1_retirement_blockers()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_problems TEXT := '';
  v_v1 BIGINT;
  v_v2 BIGINT;
  r RECORD;
BEGIN
  -- Has the backfill run at all?
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'fin_posting') THEN
    RETURN 'finance v2 is not installed — run 025 to 028 first';
  END IF;

  -- Counts, for everything that should have crossed one for one.
  SELECT count(*) INTO v_v1 FROM finance_accounts a
   WHERE EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = a.currency);
  SELECT count(*) INTO v_v2 FROM fin_account;
  IF v_v1 <> v_v2 THEN
    v_problems := v_problems || format('accounts %s vs %s; ', v_v1, v_v2);
  END IF;

  SELECT count(*) INTO v_v1 FROM finance_categories;
  SELECT count(*) INTO v_v2 FROM fin_category;
  IF v_v1 <> v_v2 THEN
    v_problems := v_problems || format('categories %s vs %s; ', v_v1, v_v2);
  END IF;

  SELECT count(*) INTO v_v1 FROM transactions WHERE amount <> 0;
  SELECT count(*) INTO v_v2 FROM fin_posting;
  IF v_v1 <> v_v2 THEN
    v_problems := v_problems || format('ledger rows %s vs postings %s; ', v_v1, v_v2);
  END IF;

  SELECT count(*) INTO v_v1 FROM recurring_transactions WHERE account_id IS NOT NULL;
  SELECT v_v1 + count(*) INTO v_v1 FROM finance_loans WHERE pay_from_account_id IS NOT NULL;
  SELECT count(*) INTO v_v2 FROM fin_commitment;
  IF v_v1 <> v_v2 THEN
    v_problems := v_problems || format('commitments %s vs %s; ', v_v1, v_v2);
  END IF;

  -- Every balance, to the minor unit. Summed inline rather than through
  -- `fin_account_balance`, which requires AAL2 and returns NULL to the SQL
  -- editor — a gate that always fails is one nobody reads.
  FOR r IN
    SELECT a.id, a.name, c.exponent FROM finance_accounts a
      JOIN fin_currency c ON c.code = a.currency
     WHERE a.archived_at IS NULL
  LOOP
    v_v1 := round(public.account_balance(r.id, CURRENT_DATE, false) * power(10, r.exponent))::BIGINT;
    SELECT fa.opening_balance_minor
         + coalesce((SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
                       FROM fin_posting p
                       JOIN fin_transaction t ON t.id = p.transaction_id
                      WHERE p.account_id = fa.id
                        AND t.date >= fa.opening_date
                        AND t.date <= CURRENT_DATE
                        AND NOT t.is_pending), 0)
      INTO v_v2 FROM fin_account fa WHERE fa.id = r.id;

    IF v_v1 IS DISTINCT FROM v_v2 THEN
      v_problems := v_problems || format('%s balances %s vs %s; ', r.name, v_v1, v_v2);
    END IF;
  END LOOP;

  -- The cross-module coupling. The calendar reads `transactions` through its
  -- own RPC, so dropping the table would take a whole entry kind with it.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_calendar_data'
       AND pg_get_functiondef(p.oid) ~ '\mtransactions\M'
  ) THEN
    v_problems := v_problems ||
      'get_calendar_data still reads `transactions` — port the calendar first; ';
  END IF;

  RETURN v_problems;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_v1_retirement_blockers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_v1_retirement_blockers() TO authenticated;


-- ── 2. Refuse, or proceed ───────────────────────────────────────────────────

DO $$
DECLARE v_problems TEXT;
BEGIN
  SELECT public.fin_v1_retirement_blockers() INTO v_problems;
  IF v_problems <> '' THEN
    RAISE EXCEPTION E'Refusing to retire v1.\n%\nNothing has been dropped. Fix the above, or run 028 again.', v_problems;
  END IF;
  RAISE NOTICE 'v2 agrees with v1. Retiring v1.';
END $$;


-- ── 3. Functions and triggers ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS fill_transaction_money ON transactions;
DROP FUNCTION IF EXISTS public.fill_transaction_money() CASCADE;
DROP FUNCTION IF EXISTS public.account_balance(UUID, DATE, BOOLEAN);
DROP FUNCTION IF EXISTS public.record_goal_contribution(UUID, NUMERIC, UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS public.import_transactions(UUID, TEXT, TEXT, INT, JSONB, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.undo_import(UUID);
DROP FUNCTION IF EXISTS public.recategorise_transactions(JSONB);
DROP FUNCTION IF EXISTS public.seed_finance_defaults(CHAR);
-- Nothing else belongs in this list. An earlier draft also dropped
-- `update_item_order(UUID, UUID[])`, which is the *portfolio* section-item
-- reordering function from migration 024 and has nothing to do with finance —
-- retiring v1 would have silently broken the page builder.


-- ── 4. Tables ───────────────────────────────────────────────────────────────
-- Children first. `transactions` goes late because several tables point at it.

DROP TABLE IF EXISTS finance_goal_contributions CASCADE;
DROP TABLE IF EXISTS financial_goals CASCADE;
DROP TABLE IF EXISTS finance_budgets CASCADE;
DROP TABLE IF EXISTS finance_scenarios CASCADE;
DROP TABLE IF EXISTS finance_loan_events CASCADE;
DROP TABLE IF EXISTS finance_loans CASCADE;
DROP TABLE IF EXISTS finance_category_rules CASCADE;
DROP TABLE IF EXISTS recurring_skips CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS finance_import_batches CASCADE;
DROP TABLE IF EXISTS recurring_transactions CASCADE;
DROP TABLE IF EXISTS finance_accounts CASCADE;
DROP TABLE IF EXISTS finance_categories CASCADE;
DROP TABLE IF EXISTS finance_settings CASCADE;
DROP TABLE IF EXISTS fx_rates CASCADE;


-- ── 5. Types ────────────────────────────────────────────────────────────────
-- Only once nothing refers to them. `transaction_type` and
-- `transaction_frequency` are v1's, and v2 replaced both: direction is now the
-- sign of a posting, and frequency is `fin_frequency`.

DROP TYPE IF EXISTS category_bucket;
DROP TYPE IF EXISTS account_kind;
DROP TYPE IF EXISTS transaction_frequency;
DROP TYPE IF EXISTS transaction_type;


-- ── 6. Confirm ──────────────────────────────────────────────────────────────
-- Should return no rows.

SELECT tablename AS surviving_v1_table
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN ('transactions','recurring_transactions','recurring_skips',
                     'financial_goals','finance_goal_contributions','finance_accounts',
                     'finance_categories','finance_budgets','finance_scenarios',
                     'finance_loans','finance_loan_events','finance_settings',
                     'finance_import_batches','finance_category_rules','fx_rates')
 ORDER BY tablename;
