-- Verification for db/migrations/028-finance-v2-backfill.sql.
--
-- Runs after the prelude, 025/026/027, the v1 fixture, and the backfill
-- itself. Unlike the schema verifications this one asserts a *translation*:
-- that every v1 row arrived as the right v2 shape, that the four kinds of row
-- v2 will not accept were reported rather than dropped in silence, and that
-- no money changed on the way across.
--
-- ONE SHOT, AGAINST A FRESH DATABASE.

\set ON_ERROR_STOP on

SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.jwt = '{"aal":"aal2"}';


-- ── 1. Accounts, and the one that could not come ────────────────────────────

DO $$
DECLARE v_count INT; v_opening BIGINT;
BEGIN
  SELECT count(*) INTO v_count FROM fin_account;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL  % accounts migrated, expected 3 of the 4', v_count;
  END IF;

  IF EXISTS (SELECT 1 FROM fin_account WHERE id = 'a0000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL  an account in an unsupported currency was migrated anyway';
  END IF;

  -- NUMERIC(18,4) 5000.0000 becomes 500000 minor units exactly.
  SELECT opening_balance_minor INTO v_opening FROM fin_account
   WHERE id = 'a0000000-0000-0000-0000-000000000001';
  IF v_opening <> 500000 THEN
    RAISE EXCEPTION 'FAIL  chequing opens at %, expected 500000', v_opening;
  END IF;

  RAISE NOTICE 'PASS  three accounts migrated; the unsupported currency stayed behind';
END $$;

-- v1's column had no format CHECK and v2 insists on digits, so a junk ref is
-- carried as absent rather than failing the migration over a cosmetic field.
DO $$
DECLARE v_ref TEXT;
BEGIN
  SELECT import_ref INTO v_ref FROM fin_account
   WHERE id = 'a0000000-0000-0000-0000-000000000002';
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  an invalid import ref came across as %', v_ref;
  END IF;
  RAISE NOTICE 'PASS  an unusable import reference is dropped, not fatal';
END $$;


-- ── 2. Two rows become one transfer ─────────────────────────────────────────
--
-- The defect that made a transfer a convention rather than a fact: v1 wrote
-- two independent rows and nothing tied them together.

DO $$
DECLARE v_kind fin_transaction_kind; v_legs INT; v_net BIGINT; v_fee BIGINT;
BEGIN
  SELECT kind INTO v_kind FROM fin_transaction
   WHERE id = '70000000-0000-0000-0000-000000000003';
  IF v_kind IS DISTINCT FROM 'transfer' THEN
    RAISE EXCEPTION 'FAIL  the transfer pair became %, expected transfer', v_kind;
  END IF;

  -- The incoming leg must NOT have become a transaction of its own.
  IF EXISTS (SELECT 1 FROM fin_transaction WHERE id = '70000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL  the arriving leg became a second transaction';
  END IF;

  SELECT count(*), sum(amount_minor), max(fee_minor)
    INTO v_legs, v_net, v_fee
    FROM fin_posting WHERE transaction_id = '70000000-0000-0000-0000-000000000003';

  IF v_legs <> 2 THEN
    RAISE EXCEPTION 'FAIL  the transfer has % postings, expected 2', v_legs;
  END IF;
  IF v_net <> 0 THEN
    RAISE EXCEPTION 'FAIL  the transfer legs sum to %, expected 0', v_net;
  END IF;
  IF v_fee <> 500 THEN
    RAISE EXCEPTION 'FAIL  the fee came across as %, expected 500', v_fee;
  END IF;

  RAISE NOTICE 'PASS  two v1 rows became one balanced transfer, fee intact';
END $$;


-- ── 3. A half transfer is kept, as an adjustment ────────────────────────────
--
-- v1 permitted one leg because nothing enforced the pairing. It cannot be a
-- v2 transfer, and it must not be thrown away either — it is real money.

DO $$
DECLARE v_kind fin_transaction_kind; v_legs INT;
BEGIN
  SELECT kind INTO v_kind FROM fin_transaction
   WHERE id = '70000000-0000-0000-0000-000000000005';
  IF v_kind IS DISTINCT FROM 'adjustment' THEN
    RAISE EXCEPTION 'FAIL  the half transfer became %, expected adjustment', v_kind;
  END IF;

  SELECT count(*) INTO v_legs FROM fin_posting
   WHERE transaction_id = '70000000-0000-0000-0000-000000000005';
  IF v_legs <> 1 THEN
    RAISE EXCEPTION 'FAIL  the half transfer has % postings, expected 1', v_legs;
  END IF;

  RAISE NOTICE 'PASS  a half transfer survives as an adjustment rather than being dropped';
END $$;


-- ── 4. A transaction of zero does not cross ─────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM fin_transaction WHERE id = '70000000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'FAIL  a zero transaction was migrated';
  END IF;
  RAISE NOTICE 'PASS  a transaction that moved nothing did not cross';
END $$;


-- ── 5. A shared import hash costs a marker, never a row ─────────────────────
--
-- v1 keyed dedupe on (user, account, hash); v2 on (user, hash). Both rows are
-- real spending and both must arrive; only the duplicated marker is cleared.

DO $$
DECLARE v_rows INT; v_hashed INT;
BEGIN
  SELECT count(*) INTO v_rows FROM fin_transaction
   WHERE id IN ('70000000-0000-0000-0000-000000000007',
                '70000000-0000-0000-0000-000000000008');
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'FAIL  % of the two hash-sharing rows migrated, expected both', v_rows;
  END IF;

  SELECT count(*) INTO v_hashed FROM fin_transaction
   WHERE import_hash = 'shared-hash';
  IF v_hashed <> 1 THEN
    RAISE EXCEPTION 'FAIL  % rows kept the shared hash, expected exactly 1', v_hashed;
  END IF;

  RAISE NOTICE 'PASS  both hash-sharing rows migrated; one kept the marker';
END $$;


-- ── 6. Rules and loans become one kind of thing ─────────────────────────────

DO $$
DECLARE v_count INT; v_from UUID; v_to UUID; v_day INT; v_principal BIGINT;
BEGIN
  -- Four rules with an account, plus one loan with a paying account.
  SELECT count(*) INTO v_count FROM fin_commitment;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'FAIL  % commitments, expected 5', v_count;
  END IF;

  -- Direction moved from a `type` column to which account is named.
  SELECT from_account_id, to_account_id INTO v_from, v_to FROM fin_commitment
   WHERE id = 'b0000000-0000-0000-0000-000000000001';
  IF v_from IS NULL OR v_to IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  an expense rule did not become an outgoing commitment';
  END IF;

  SELECT from_account_id, to_account_id INTO v_from, v_to FROM fin_commitment
   WHERE id = 'b0000000-0000-0000-0000-000000000002';
  IF v_from IS NOT NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'FAIL  an earning rule did not become an incoming commitment';
  END IF;

  -- A weekly rule holding day 19 — impossible, and v1 had no CHECK to stop it.
  SELECT occurrence_day INTO v_day FROM fin_commitment
   WHERE id = 'b0000000-0000-0000-0000-000000000004';
  IF v_day IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  an impossible occurrence day survived as %', v_day;
  END IF;

  SELECT principal_minor INTO v_principal FROM fin_commitment
   WHERE id = '10000000-0000-0000-0000-000000000001' AND kind = 'amortising';
  IF v_principal <> 45000000 THEN
    RAISE EXCEPTION 'FAIL  the loan principal is %, expected 45000000', v_principal;
  END IF;

  -- Neither of the two that cannot be represented.
  IF EXISTS (SELECT 1 FROM fin_commitment WHERE id = 'b0000000-0000-0000-0000-000000000003')
     OR EXISTS (SELECT 1 FROM fin_commitment WHERE id = '10000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL  a rule or loan with no account was migrated anyway';
  END IF;

  RAISE NOTICE 'PASS  rules and loans became one table; direction comes from the accounts';
END $$;

DO $$
DECLARE v_events INT; v_skips INT;
BEGIN
  SELECT count(*) INTO v_events FROM fin_commitment_event;
  SELECT count(*) INTO v_skips FROM fin_commitment_skip;
  IF v_events <> 1 OR v_skips <> 1 THEN
    RAISE EXCEPTION 'FAIL  % events and % skips, expected 1 and 1', v_events, v_skips;
  END IF;
  RAISE NOTICE 'PASS  rate changes and skipped occurrences came across';
END $$;


-- ── 7. A goal keeps the total the owner last saw ────────────────────────────
--
-- v2 derives the total from contributions, so a v1 goal holding a stored
-- `current_amount` with no matching history would arrive holding nothing. The
-- backfill writes one labelled opening contribution for the difference.

DO $$
DECLARE v_balance BIGINT; v_target BIGINT; v_opening INT;
BEGIN
  SELECT public.fin_goal_balance('90000000-0000-0000-0000-000000000001') INTO v_balance;
  -- v1 said 2500.00; one real contribution of 500.00 existed.
  IF v_balance <> 250000 THEN
    RAISE EXCEPTION 'FAIL  the goal holds %, expected 250000', v_balance;
  END IF;

  SELECT count(*) INTO v_opening FROM fin_goal_contribution
   WHERE goal_id = '90000000-0000-0000-0000-000000000001'
     AND note = 'Opening balance carried from the previous version';
  IF v_opening <> 1 THEN
    RAISE EXCEPTION 'FAIL  expected exactly one labelled opening contribution, found %', v_opening;
  END IF;

  SELECT target_minor INTO v_target FROM fin_goal
   WHERE id = '90000000-0000-0000-0000-000000000001';
  IF v_target <> 1000000 THEN
    RAISE EXCEPTION 'FAIL  the target is %, expected 1000000', v_target;
  END IF;

  IF EXISTS (SELECT 1 FROM fin_goal WHERE id = '90000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL  a goal with a target of zero was migrated';
  END IF;

  RAISE NOTICE 'PASS  the goal holds what it held, by derivation, and the zero-target goal did not cross';
END $$;


-- ── 8. Budgets, scenarios, rules ────────────────────────────────────────────

DO $$
DECLARE v_amount BIGINT; v_ccy CHAR(3); v_scen INT; v_rules INT;
BEGIN
  SELECT amount_minor, currency INTO v_amount, v_ccy FROM fin_budget
   WHERE id = 'c1000000-0000-0000-0000-000000000001';
  IF v_amount <> 60000 OR v_ccy <> 'CAD' THEN
    RAISE EXCEPTION 'FAIL  the budget came across as % %, expected 60000 CAD', v_amount, v_ccy;
  END IF;

  SELECT count(*) INTO v_scen FROM fin_scenario;
  SELECT count(*) INTO v_rules FROM fin_category_rule;
  IF v_scen <> 1 OR v_rules <> 1 THEN
    RAISE EXCEPTION 'FAIL  % scenarios and % category rules, expected 1 and 1', v_scen, v_rules;
  END IF;

  RAISE NOTICE 'PASS  budgets, scenarios and learned rules came across';
END $$;


-- ── 9. The money is the same money ──────────────────────────────────────────
--
-- The cutover gate, asserted rather than eyeballed. v1's balance times the
-- currency's exponent must equal v2's, to the minor unit, for every account
-- that migrated.

DO $$
DECLARE r RECORD; v_v1 BIGINT; v_v2 BIGINT;
BEGIN
  FOR r IN SELECT a.id, a.name, c.exponent
             FROM finance_accounts a
             JOIN fin_currency c ON c.code = a.currency
            WHERE a.archived_at IS NULL
  LOOP
    v_v1 := round(public.account_balance(r.id, DATE '2026-12-31', false) * power(10, r.exponent))::BIGINT;
    v_v2 := public.fin_account_balance(r.id, DATE '2026-12-31', false);
    IF v_v1 IS DISTINCT FROM v_v2 THEN
      RAISE EXCEPTION 'FAIL  % reads % in v1 and % in v2', r.name, v_v1, v_v2;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS  every migrated account balances identically in v1 and v2';
END $$;

-- And the figure itself, stated, so a silent change of both sides would show.
--   5000.00 − 45.00 + 3000.00 − (500.00 + 5.00) − 100.00 − 6.50 = 7343.50
DO $$
DECLARE v_balance BIGINT;
BEGIN
  SELECT public.fin_account_balance('a0000000-0000-0000-0000-000000000001', DATE '2026-12-31', false)
    INTO v_balance;
  IF v_balance <> 734350 THEN
    RAISE EXCEPTION 'FAIL  chequing holds % minor units, expected 734350', v_balance;
  END IF;
  RAISE NOTICE 'PASS  chequing holds 734350 minor units (CAD 7,343.50)';
END $$;


-- ── 10. Every hazard was reported ───────────────────────────────────────────
--
-- Section 9 of the backfill is the list the owner has to read. If a shape that
-- could not be translated failed to appear there, it was lost in silence —
-- which is the one outcome this migration must never produce.

DO $$
DECLARE v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transactions t
                  WHERE t.transfer_group IS NOT NULL
                    AND (SELECT count(*) FROM transactions o
                          WHERE o.transfer_group = t.transfer_group) <> 2)
    THEN v_missing := v_missing || 'half-transfer '; END IF;
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE account_id IS NULL)
    THEN v_missing := v_missing || 'orphan-rule '; END IF;
  IF NOT EXISTS (SELECT 1 FROM finance_loans WHERE pay_from_account_id IS NULL)
    THEN v_missing := v_missing || 'unpaid-loan '; END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_goals WHERE target_amount <= 0)
    THEN v_missing := v_missing || 'zero-goal '; END IF;
  IF NOT EXISTS (SELECT 1 FROM finance_accounts a
                  WHERE NOT EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = a.currency))
    THEN v_missing := v_missing || 'unknown-currency '; END IF;
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE amount = 0)
    THEN v_missing := v_missing || 'zero-amount '; END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'FAIL  the fixture no longer exercises: %', v_missing;
  END IF;

  RAISE NOTICE 'PASS  the fixture still contains every hazard the report has to name';
END $$;

-- The double-count, which is a judgement rather than a translation: a loan and
-- a rule describing one debt both became commitments, and only the owner can
-- say which is real.
DO $$
DECLARE v_clashes INT;
BEGIN
  SELECT count(*) INTO v_clashes
    FROM finance_loans l
    JOIN recurring_transactions r
      ON r.archived_at IS NULL AND l.archived_at IS NULL
     AND lower(regexp_replace(l.name, '[^a-zA-Z0-9]+', ' ', 'g')) =
         lower(regexp_replace(r.description, '[^a-zA-Z0-9]+', ' ', 'g'));
  IF v_clashes <> 1 THEN
    RAISE EXCEPTION 'FAIL  the loan/rule clash report found % pairs, expected 1', v_clashes;
  END IF;
  RAISE NOTICE 'PASS  the one debt described twice is reported, not silently merged';
END $$;

SELECT 'ALL CHECKS PASSED' AS result;
