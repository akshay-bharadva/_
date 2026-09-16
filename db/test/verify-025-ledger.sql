-- Verification for db/migrations/025-finance-v2-ledger.sql.
--
-- Run against a scratch Postgres after the prelude and the migration. Every
-- check raises on failure, so the script either runs to completion printing
-- its passes or stops at the first thing that is wrong.
--
-- ONE SHOT, AGAINST A FRESH DATABASE. This script inserts; it does not clean
-- up, and it is not idempotent. Running it twice re-applies every movement and
-- the balance assertions then fail for a reason that has nothing to do with
-- the schema — 295000 becomes 90000, which is a confusing way to discover that
-- the harness ran the file twice rather than that the ledger is wrong.
--
-- The cases are the ones that were got wrong by hand while writing 025:
--
--   * a transfer with a provider fee must be ACCEPTED (the first version of
--     the balance invariant added fees into the sum and rejected every
--     transfer that cost anything to make);
--   * deleting a leg must be REJECTED rather than raising from inside the
--     trigger (the first version read NEW on a DELETE, where it is unassigned);
--   * a cross-currency transfer must be ACCEPTED without netting to zero,
--     because the gap is the provider's margin and forcing it would invent a
--     rate.

\set ON_ERROR_STOP on

-- ── An owner, signed in and MFA-verified ────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'owner@example.test')
ON CONFLICT (id) DO NOTHING;

SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.jwt = '{"aal":"aal2"}';

INSERT INTO fin_settings (user_id, base_currency)
VALUES ('11111111-1111-1111-1111-111111111111', 'CAD')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO fin_account (id, user_id, name, kind, currency, opening_balance_minor, opening_date, is_liquid)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Chequing', 'chequing', 'CAD', 500000, DATE '2026-01-01', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Savings',  'savings',  'CAD', 0,      DATE '2026-01-01', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'India',    'savings',  'INR', 0,      DATE '2026-01-01', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_category (id, user_id, name, bucket)
VALUES ('cccccccc-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Groceries', 'need')
ON CONFLICT (id) DO NOTHING;


-- ── 1. A spend is one posting, and does not have to balance ─────────────────

DO $$
DECLARE v_txn UUID;
BEGIN
  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-01', 'Groceries', 'spend')
  RETURNING id INTO v_txn;

  INSERT INTO fin_posting (user_id, transaction_id, account_id, category_id, amount_minor, currency)
  VALUES ('11111111-1111-1111-1111-111111111111', v_txn,
          'aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001', -4500, 'CAD');

  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS  a single-posting spend is accepted';
END $$;


-- ── 2. A balanced same-currency transfer is accepted ────────────────────────

DO $$
DECLARE v_txn UUID;
BEGIN
  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-02', 'To savings', 'transfer')
  RETURNING id INTO v_txn;

  INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -50000, 'CAD'),
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000002',  50000, 'CAD');

  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS  a balanced transfer is accepted';
END $$;


-- ── 3. A transfer that cost a fee is still accepted ─────────────────────────
--
-- The regression this file exists for. The fee leaves for the provider, not
-- for the other account, so the legs still sum to zero.

DO $$
DECLARE v_txn UUID;
BEGIN
  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-03', 'To savings, with a fee', 'transfer')
  RETURNING id INTO v_txn;

  INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency, fee_minor)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -50000, 'CAD', 500),
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000002',  50000, 'CAD', NULL);

  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS  a transfer with a provider fee is accepted';
END $$;


-- ── 4. A half transfer is rejected ──────────────────────────────────────────

DO $$
DECLARE v_txn UUID; v_raised BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO fin_transaction (user_id, date, description, kind)
    VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-04', 'Half a transfer', 'transfer')
    RETURNING id INTO v_txn;

    INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
    VALUES ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -50000, 'CAD');

    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    v_raised := true;
    RAISE NOTICE 'PASS  a half transfer is rejected (%)', SQLERRM;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  a transfer with one leg was accepted';
  END IF;
END $$;


-- ── 5. An unbalanced same-currency transfer is rejected ─────────────────────

DO $$
DECLARE v_txn UUID; v_raised BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO fin_transaction (user_id, date, description, kind)
    VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-05', 'Money invented', 'transfer')
    RETURNING id INTO v_txn;

    INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
    VALUES
      ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -50000, 'CAD'),
      ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000002',  60000, 'CAD');

    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    v_raised := true;
    RAISE NOTICE 'PASS  an unbalanced transfer is rejected (%)', SQLERRM;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  a transfer that invented 100.00 was accepted';
  END IF;
END $$;


-- ── 6. A cross-currency transfer is accepted as observed ────────────────────
--
-- 1,000.00 CAD leaves and 60,240.00 INR arrives. Forcing these to net to zero
-- would be inventing a rate; the difference from mid-market is the margin.

DO $$
DECLARE v_txn UUID;
BEGIN
  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-06', 'Remittance', 'transfer')
  RETURNING id INTO v_txn;

  INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency, fx_rate, base_amount_minor)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -100000, 'CAD', 1, -100000),
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000003', 6024000, 'INR', 0.0166, 100000);

  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS  a cross-currency transfer is accepted without netting to zero';
END $$;


-- ── 7. Deleting one leg of a transfer is rejected ───────────────────────────
--
-- The other regression: the trigger fires on DELETE, where NEW is unassigned.
-- Reading it there raised from inside the trigger instead of validating.

DO $$
DECLARE v_txn UUID; v_leg UUID; v_raised BOOLEAN := false;
BEGIN
  SELECT t.id INTO v_txn FROM fin_transaction t
   WHERE t.description = 'To savings' AND t.kind = 'transfer' LIMIT 1;
  SELECT p.id INTO v_leg FROM fin_posting p
   WHERE p.transaction_id = v_txn ORDER BY p.amount_minor LIMIT 1;

  BEGIN
    DELETE FROM fin_posting WHERE id = v_leg;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    v_raised := true;
    RAISE NOTICE 'PASS  removing one leg is rejected (%)', SQLERRM;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  a transfer was left with one leg';
  END IF;
END $$;


-- ── 8. Deleting a whole transfer is allowed ─────────────────────────────────

DO $$
DECLARE v_txn UUID;
BEGIN
  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-07', 'Doomed transfer', 'transfer')
  RETURNING id INTO v_txn;

  INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -100, 'CAD'),
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000002',  100, 'CAD');
  SET CONSTRAINTS ALL IMMEDIATE;

  DELETE FROM fin_transaction WHERE id = v_txn;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PASS  deleting a whole transfer is allowed';
END $$;


-- ── 9. A posting that moves nothing is rejected ─────────────────────────────

DO $$
DECLARE v_txn UUID; v_raised BOOLEAN := false;
BEGIN
  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-08', 'Nothing', 'spend')
  RETURNING id INTO v_txn;

  BEGIN
    INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
    VALUES ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', 0, 'CAD');
  EXCEPTION WHEN others THEN
    v_raised := true;
    RAISE NOTICE 'PASS  a zero posting is rejected';
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  a posting of zero was accepted';
  END IF;
END $$;


-- ── 10. The balance is the anchor plus the postings, fees included ──────────
--
-- Chequing, in minor units:
--
--   opening                              500000
--   groceries                            − 4500   → 495500
--   transfer to savings                  −50000   → 445500
--   transfer to savings, 500 fee         −50500   → 395000
--   remittance abroad                   −100000   → 295000
--   the doomed transfer, deleted again        0   → 295000
--
-- The first version of this check expected 294500 — a 500 dropped doing the
-- sum by hand, while `fin_account_balance` had it right. Recorded because it
-- is the second time in this rebuild the expectation was wrong and the
-- implementation was not, which is the argument for running the SQL rather
-- than reading it.

DO $$
DECLARE v_balance BIGINT;
BEGIN
  SELECT public.fin_account_balance('aaaaaaaa-0000-0000-0000-000000000001', DATE '2026-12-31', false)
    INTO v_balance;

  IF v_balance IS DISTINCT FROM 295000 THEN
    RAISE EXCEPTION 'FAIL  chequing balance is % minor units, expected 295000', v_balance;
  END IF;
  RAISE NOTICE 'PASS  chequing balance is 295000 minor units (CAD 2,950.00)';
END $$;

-- The fee left the account but arrived nowhere: across both accounts the pair
-- nets to −500, which is exactly what the provider took.
DO $$
DECLARE v_out BIGINT; v_in BIGINT;
BEGIN
  SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
    INTO v_out
    FROM fin_posting p
    JOIN fin_transaction t ON t.id = p.transaction_id
   WHERE t.description = 'To savings, with a fee';

  IF v_out IS DISTINCT FROM -500 THEN
    RAISE EXCEPTION 'FAIL  a fee-bearing transfer moved % across the pair, expected -500', v_out;
  END IF;
  RAISE NOTICE 'PASS  a transfer costs the pair exactly its fee';
END $$;

DO $$
DECLARE v_balance BIGINT;
BEGIN
  SELECT public.fin_account_balance('aaaaaaaa-0000-0000-0000-000000000003', DATE '2026-12-31', false)
    INTO v_balance;

  IF v_balance IS DISTINCT FROM 6024000 THEN
    RAISE EXCEPTION 'FAIL  India balance is % minor units, expected 6024000', v_balance;
  END IF;
  RAISE NOTICE 'PASS  the rupee account holds 6024000 minor units (INR 60,240.00)';
END $$;


-- ── 10b. Every balance in one round trip ────────────────────────────────────
--
-- v1 called the per-account function in a loop from the client — one request
-- per account, all waiting on each other. This is the same arithmetic for the
-- whole set, and it was previously untested: the migration happened to abort
-- on its GRANT, which is how the gap was noticed at all.
--
--   Chequing  295000 CAD   Savings  100000 CAD   India  6024000 INR
--
-- Savings receives both transfers (the fee is charged to the sender, so the
-- arriving leg is the full 50000 twice).

DO $$
DECLARE
  v_rows INT;
  v_chequing BIGINT;
  v_savings BIGINT;
  v_india BIGINT;
  v_india_ccy CHAR(3);
BEGIN
  SELECT count(*) INTO v_rows FROM public.fin_account_balances(DATE '2026-12-31', false);
  IF v_rows IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FAIL  expected 3 live accounts, got %', v_rows;
  END IF;

  SELECT balance_minor INTO v_chequing FROM public.fin_account_balances(DATE '2026-12-31', false)
   WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  SELECT balance_minor INTO v_savings FROM public.fin_account_balances(DATE '2026-12-31', false)
   WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  SELECT balance_minor, currency INTO v_india, v_india_ccy
    FROM public.fin_account_balances(DATE '2026-12-31', false)
   WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000003';

  IF v_chequing IS DISTINCT FROM 295000 THEN
    RAISE EXCEPTION 'FAIL  chequing reads % in the set, expected 295000', v_chequing;
  END IF;
  IF v_savings IS DISTINCT FROM 100000 THEN
    RAISE EXCEPTION 'FAIL  savings reads %, expected 100000', v_savings;
  END IF;
  IF v_india IS DISTINCT FROM 6024000 OR v_india_ccy IS DISTINCT FROM 'INR' THEN
    RAISE EXCEPTION 'FAIL  the rupee account reads % %, expected 6024000 INR', v_india, v_india_ccy;
  END IF;

  RAISE NOTICE 'PASS  every balance in one round trip, each in its own currency';
END $$;

-- Each row carries its own currency precisely so nothing downstream is tempted
-- to add them together: 295000 CAD and 6024000 INR share a column and mean
-- entirely different things.
DO $$
DECLARE v_naive BIGINT;
BEGIN
  SELECT sum(balance_minor) INTO v_naive
    FROM public.fin_account_balances(DATE '2026-12-31', false);
  IF v_naive IS DISTINCT FROM 6419000 THEN
    RAISE EXCEPTION 'FAIL  expected the naive cross-currency sum to be 6419000, got %', v_naive;
  END IF;
  RAISE NOTICE 'PASS  a naive sum across currencies is 6419000, which is meaningless — conversion is the caller''s job';
END $$;


-- ── 11. Without AAL2 the balance function returns nothing ───────────────────

DO $$
DECLARE v_balance BIGINT;
BEGIN
  SET LOCAL app.jwt = '{"aal":"aal1"}';
  SELECT public.fin_account_balance('aaaaaaaa-0000-0000-0000-000000000001', DATE '2026-12-31', false)
    INTO v_balance;

  IF v_balance IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  a password-only session read a balance of %', v_balance;
  END IF;
  RAISE NOTICE 'PASS  a session without MFA gets no balance, not a zero';
END $$;

-- ── 12. Closing an account does not invalidate its past transfers ───────────
--
-- `fin_posting.account_id` is ON DELETE SET NULL, and a referential action
-- fires row triggers — so closing an account nulls one leg of every transfer
-- it was ever part of. An invariant demanding two distinct accounts would then
-- make the account undeletable for anyone who had ever moved money, which is
-- the past refusing to let the present change. At write time both legs name an
-- account and the check holds; afterwards an orphaned leg is history.
--
-- Deliberately last in the file: it removes an account, so every balance
-- asserted above is settled before this runs.

DO $$
DECLARE v_txn UUID; v_legs INT; v_orphans INT;
BEGIN
  INSERT INTO fin_account (id, user_id, name, kind, currency, opening_balance_minor, opening_date)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
          'Scratch', 'savings', 'CAD', 0, DATE '2026-01-01');

  INSERT INTO fin_transaction (user_id, date, description, kind)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-02-09', 'To scratch', 'transfer')
  RETURNING id INTO v_txn;

  INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
  VALUES
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000001', -100, 'CAD'),
    ('11111111-1111-1111-1111-111111111111', v_txn, 'aaaaaaaa-0000-0000-0000-000000000004',  100, 'CAD');
  SET CONSTRAINTS ALL IMMEDIATE;

  -- The operation this check exists for.
  DELETE FROM fin_account WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004';
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT count(*), count(*) FILTER (WHERE account_id IS NULL)
    INTO v_legs, v_orphans
    FROM fin_posting WHERE transaction_id = v_txn;

  IF v_legs <> 2 THEN
    RAISE EXCEPTION 'FAIL  closing an account took a transfer leg with it (% left)', v_legs;
  END IF;
  IF v_orphans <> 1 THEN
    RAISE EXCEPTION 'FAIL  expected exactly one orphaned leg, found %', v_orphans;
  END IF;

  RAISE NOTICE 'PASS  an account can be closed; its past transfers keep both legs, one orphaned';
END $$;

SELECT 'ALL CHECKS PASSED' AS result;
