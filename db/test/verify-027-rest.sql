-- Verification for db/migrations/027-finance-v2-rest.sql.
--
-- Runs after the prelude, 025, 026 and their verifications, so accounts and
-- categories already exist.
--
-- ONE SHOT, AGAINST A FRESH DATABASE, and it depends on the balances the
-- earlier scripts leave behind — so if any of them ran twice, the failure
-- surfaces here as a wrong account balance rather than where it happened.
--
-- The cases are the three v1 behaviours 027 deliberately refuses to carry
-- over, each of which was a bug rather than a design:
--
--   * a goal contribution must write NO ledger row (v1's table comment said
--     writing one would double-count, and the RPC wrote one anyway);
--   * a goal's total must be DERIVED, so it cannot drift from its own
--     contributions or be lost to a race;
--   * a goal target of zero must be UNREACHABLE, since it produced "NaN%" and
--     goals that claimed to be complete while holding nothing.

\set ON_ERROR_STOP on

SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.jwt = '{"aal":"aal2"}';

CREATE OR REPLACE FUNCTION pg_temp.must_reject(p_sql TEXT, p_what TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    -- Deferred constraints fire at COMMIT, which is *after* this exception
    -- block has exited — so without this, a rejection by the goal-balance
    -- trigger would escape the check entirely and abort the script later,
    -- while the check itself reported a false failure.
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS  % is rejected', p_what;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % was accepted', p_what;
END;
$$;


-- ── 1. Budgets are per category, per month ──────────────────────────────────

INSERT INTO fin_budget (id, user_id, category_id, period, amount_minor, currency)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'cccccccc-0000-0000-0000-000000000001', DATE '2026-03-01', 60000, 'CAD');
DO $$ BEGIN RAISE NOTICE 'PASS  a budget is accepted'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_budget (user_id, category_id, period, amount_minor, currency)
  VALUES ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
          DATE '2026-03-15', 60000, 'CAD')
$$, 'a budget for the middle of a month');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_budget (user_id, category_id, period, amount_minor, currency)
  VALUES ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
          DATE '2026-03-01', 70000, 'CAD')
$$, 'a second budget for the same category and month');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_budget (user_id, category_id, period, amount_minor, currency)
  VALUES ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
          DATE '2026-04-01', -100, 'CAD')
$$, 'a negative budget');


-- ── 2. A goal of nothing is not a goal ──────────────────────────────────────
--
-- v1 had no CHECK here, so `goalProgressPercent` had to defend against
-- `0 / 0` rendering as "NaN%" and against a non-zero balance over a zero
-- target producing Infinity, which `Math.min(_, 100)` turned into a goal that
-- claimed to be complete.

SELECT pg_temp.must_reject($$
  INSERT INTO fin_goal (user_id, name, target_minor, currency)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Nothing', 0, 'CAD')
$$, 'a goal with a target of zero');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_goal (user_id, name, target_minor, currency)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Backwards', -5000, 'CAD')
$$, 'a goal with a negative target');

INSERT INTO fin_goal (id, user_id, name, target_minor, currency, account_id, kind)
VALUES ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'Emergency fund', 1000000, 'CAD', 'aaaaaaaa-0000-0000-0000-000000000002', 'buffer');
DO $$ BEGIN RAISE NOTICE 'PASS  a goal with a real target is accepted'; END $$;


-- ── 3. An earmark moves no money ────────────────────────────────────────────
--
-- The contradiction v1 shipped: its own table comment said writing a ledger
-- row for a contribution "would double-count against the transactions that
-- earned or spent it", and `record_goal_contribution` wrote one anyway
-- whenever an account was named.

DO $$
DECLARE v_before INT; v_after INT; v_balance BIGINT;
BEGIN
  SELECT count(*) INTO v_before FROM fin_transaction;

  INSERT INTO fin_goal_contribution (user_id, goal_id, account_id, amount_minor, occurred_on, note)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 250000, DATE '2026-03-01', 'March');

  SELECT count(*) INTO v_after FROM fin_transaction;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL  setting money aside wrote % ledger rows', v_after - v_before;
  END IF;

  SELECT public.fin_goal_balance('ffffffff-0000-0000-0000-000000000001') INTO v_balance;
  IF v_balance <> 250000 THEN
    RAISE EXCEPTION 'FAIL  the goal holds %, expected 250000', v_balance;
  END IF;

  RAISE NOTICE 'PASS  an earmark writes no ledger row, and the goal holds 250000';
END $$;

-- And the account it was earmarked from is untouched, because the money is
-- still in it. This is the double-count that v1's ledger rows created.
DO $$
DECLARE v_balance BIGINT;
BEGIN
  SELECT public.fin_account_balance('aaaaaaaa-0000-0000-0000-000000000002', DATE '2026-12-31', false)
    INTO v_balance;
  IF v_balance IS DISTINCT FROM 100000 THEN
    RAISE EXCEPTION 'FAIL  earmarking moved the account balance to %, expected 100000', v_balance;
  END IF;
  RAISE NOTICE 'PASS  earmarking does not move the account it came from';
END $$;


-- ── 4. The total is derived, and cannot go below nothing ────────────────────

DO $$
DECLARE v_balance BIGINT;
BEGIN
  INSERT INTO fin_goal_contribution (user_id, goal_id, amount_minor, occurred_on)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001',
          -50000, DATE '2026-04-01');

  SELECT public.fin_goal_balance('ffffffff-0000-0000-0000-000000000001') INTO v_balance;
  IF v_balance <> 200000 THEN
    RAISE EXCEPTION 'FAIL  after taking 50000 back the goal holds %, expected 200000', v_balance;
  END IF;
  RAISE NOTICE 'PASS  taking money back out is a negative contribution';
END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_goal_contribution (user_id, goal_id, amount_minor)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001', -999999)
$$, 'taking out more than the goal holds');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_goal_contribution (user_id, goal_id, amount_minor)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001', 0)
$$, 'a contribution of nothing');

-- The balance survived both rejections intact.
DO $$
DECLARE v_balance BIGINT;
BEGIN
  SELECT public.fin_goal_balance('ffffffff-0000-0000-0000-000000000001') INTO v_balance;
  IF v_balance <> 200000 THEN
    RAISE EXCEPTION 'FAIL  the goal holds % after two rejected writes, expected 200000', v_balance;
  END IF;
  RAISE NOTICE 'PASS  a rejected withdrawal leaves the goal where it was';
END $$;

-- Closing an account keeps the record of what was set aside from it.
DO $$
DECLARE v_kept INT;
BEGIN
  DELETE FROM fin_account WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  SELECT count(*) INTO v_kept FROM fin_goal_contribution
   WHERE goal_id = 'ffffffff-0000-0000-0000-000000000001';
  IF v_kept <> 2 THEN
    RAISE EXCEPTION 'FAIL  % contributions survived closing the account, expected 2', v_kept;
  END IF;
  RAISE NOTICE 'PASS  closing an account keeps the history of what it funded';
END $$;


-- ── 5. Scenarios hold a list ────────────────────────────────────────────────

INSERT INTO fin_scenario (user_id, name, adjustments)
VALUES ('11111111-1111-1111-1111-111111111111', 'Rent rises',
        '[{"kind":"recurring_delta","recurring_id":"x","amount":200}]'::jsonb);
DO $$ BEGIN RAISE NOTICE 'PASS  a scenario holds a list of adjustments'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_scenario (user_id, name, adjustments)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Not a list', '{"kind":"one_off"}'::jsonb)
$$, 'a scenario whose adjustments are an object');


-- ── 6. Imports dedupe, and forgetting one keeps its rows ────────────────────

INSERT INTO fin_import_batch (id, user_id, account_id, file_name, format, rows_in_file)
VALUES ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'march.csv', 'generic', 2);

INSERT INTO fin_transaction (id, user_id, date, description, kind, import_hash, import_batch_id)
VALUES ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        DATE '2026-03-10', 'Imported coffee', 'spend', 'hash-abc', '99999999-0000-0000-0000-000000000001');
INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
VALUES ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001', -650, 'CAD');
DO $$ BEGIN RAISE NOTICE 'PASS  an imported row is accepted'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_transaction (user_id, date, description, kind, import_hash)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-03-10', 'Imported coffee again',
          'spend', 'hash-abc')
$$, 'importing the same statement row twice');

DO $$
DECLARE v_batch UUID; v_kept INT;
BEGIN
  DELETE FROM fin_import_batch WHERE id = '99999999-0000-0000-0000-000000000001';

  -- Two selects rather than one. The first version reached for
  -- `max(import_batch_id)` to pull the column alongside the count, and
  -- Postgres has no max() for uuid — the row is addressed by primary key, so
  -- there was never anything to aggregate.
  SELECT count(*) INTO v_kept FROM fin_transaction
   WHERE id = 'dddddddd-0000-0000-0000-000000000002';
  SELECT import_batch_id INTO v_batch FROM fin_transaction
   WHERE id = 'dddddddd-0000-0000-0000-000000000002';

  IF v_kept <> 1 THEN
    RAISE EXCEPTION 'FAIL  forgetting an import took its rows with it';
  END IF;
  IF v_batch IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  a kept row still points at a deleted import batch';
  END IF;
  RAISE NOTICE 'PASS  forgetting an import keeps the rows it brought in';
END $$;


-- ── 7. A learned category rule, once per pattern ────────────────────────────

INSERT INTO fin_category_rule (user_id, pattern, category_id, kind)
VALUES ('11111111-1111-1111-1111-111111111111', 'LOBLAWS',
        'cccccccc-0000-0000-0000-000000000001', 'expense');
DO $$ BEGIN RAISE NOTICE 'PASS  a learned category rule is accepted'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_category_rule (user_id, pattern, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', 'LOBLAWS', 'income')
$$, 'a second rule for the same merchant');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_category_rule (user_id, pattern, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', 'TIMS', 'nonsense')
$$, 'a rule with an unknown kind');

SELECT 'ALL CHECKS PASSED' AS result;
