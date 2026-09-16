-- Verification for db/migrations/026-finance-v2-commitments.sql.
--
-- Runs after the prelude, 025 and its verification, so the accounts and
-- categories from that file already exist.
--
-- ONE SHOT, AGAINST A FRESH DATABASE. It inserts rows with fixed ids and does
-- not clean up. A second run fails on a duplicate primary key, which says
-- nothing about the schema and everything about the harness.
--
-- The cases are the three defects 026 exists to fix, plus every constraint
-- that is new in v2 and therefore has never been exercised anywhere:
--
--   * a repeating transfer must be EXPRESSIBLE (v1 could not say it at all,
--     which is why the forecast drained by the transfer amount every period);
--   * a loan and a rule cannot be two rows describing one debt, because there
--     is only one table;
--   * superseding is recorded rather than inferred;
--   * an occurrence_day must be one its own frequency can produce (v1's column
--     was a bare INT whose comment admitted Zod was the only enforcement).

\set ON_ERROR_STOP on

SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.jwt = '{"aal":"aal2"}';

-- A small helper: run a statement that must fail, and say so if it does not.
CREATE OR REPLACE FUNCTION pg_temp.must_reject(p_sql TEXT, p_what TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    -- Deferred constraints fire at COMMIT, after this block has exited. None
    -- of the rejections below is deferred today, but the helper must not be
    -- the reason a future one escapes its check.
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS  % is rejected', p_what;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % was accepted', p_what;
END;
$$;


-- ── 1. A fixed expense: money leaves one account ────────────────────────────

INSERT INTO fin_commitment
  (id, user_id, name, kind, from_account_id, category_id, currency,
   amount_minor, frequency, start_date, occurrence_day)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Rent', 'fixed', 'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'CAD',
   180000, 'monthly', DATE '2026-01-01', 1);

DO $$ BEGIN RAISE NOTICE 'PASS  a fixed outgoing commitment is accepted'; END $$;


-- ── 2. A repeating transfer — the thing v1 could not express ────────────────
--
-- v1's rule had one account and a direction, so "move 500 to savings every
-- fortnight" projected as money leaving and never arriving: the balance line
-- fell by 500 every two weeks, forever, because you save.

INSERT INTO fin_commitment
  (id, user_id, name, kind, from_account_id, to_account_id, currency,
   amount_minor, frequency, start_date, occurrence_day)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'To savings', 'fixed',
   'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'CAD', 50000, 'bi-weekly', DATE '2026-01-02', 5);

DO $$
DECLARE v_direction TEXT;
BEGIN
  SELECT public.fin_commitment_direction(from_account_id, to_account_id)
    INTO v_direction FROM fin_commitment
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';

  IF v_direction IS DISTINCT FROM 'transfer' THEN
    RAISE EXCEPTION 'FAIL  a two-account commitment reads as %, expected transfer', v_direction;
  END IF;
  RAISE NOTICE 'PASS  a repeating transfer is expressible, and reads as a transfer';
END $$;


-- ── 3. Income: money arrives, with no source account ────────────────────────

INSERT INTO fin_commitment
  (id, user_id, name, kind, to_account_id, currency, amount_minor,
   frequency, start_date, occurrence_day)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Salary', 'fixed', 'aaaaaaaa-0000-0000-0000-000000000001', 'CAD',
   500000, 'monthly', DATE '2026-01-01', 1);

DO $$
DECLARE v_direction TEXT;
BEGIN
  SELECT public.fin_commitment_direction(from_account_id, to_account_id)
    INTO v_direction FROM fin_commitment
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003';
  IF v_direction IS DISTINCT FROM 'in' THEN
    RAISE EXCEPTION 'FAIL  an incoming commitment reads as %, expected in', v_direction;
  END IF;
  RAISE NOTICE 'PASS  an incoming commitment needs no source account';
END $$;


-- ── 4. A mortgage is a commitment, not a second table ───────────────────────

INSERT INTO fin_commitment
  (id, user_id, name, kind, from_account_id, currency,
   principal_minor, annual_rate, tenure_months, rate_type, on_rate_change,
   lender, frequency, start_date, occurrence_day, supersedes_id)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Home Loan', 'amortising', 'aaaaaaaa-0000-0000-0000-000000000001', 'CAD',
   450000000, 8.500, 240, 'floating', 'tenure',
   'A Bank', 'monthly', DATE '2026-04-01', 1,
   'bbbbbbbb-0000-0000-0000-000000000001');

DO $$
DECLARE v_superseded TEXT;
BEGIN
  SELECT old.name INTO v_superseded
    FROM fin_commitment new
    JOIN fin_commitment old ON old.id = new.supersedes_id
   WHERE new.id = 'bbbbbbbb-0000-0000-0000-000000000004';

  IF v_superseded IS DISTINCT FROM 'Rent' THEN
    RAISE EXCEPTION 'FAIL  the mortgage supersedes %, expected Rent', v_superseded;
  END IF;
  RAISE NOTICE 'PASS  an amortising commitment supersedes the one it replaced, on the record';
END $$;


-- ── 5. Each shape carries its own fields and not the other's ────────────────

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency, frequency, start_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'No amount', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD', 'monthly', DATE '2026-01-01')
$$, 'a fixed commitment with no amount');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                              amount_minor, principal_minor, annual_rate, tenure_months,
                              frequency, start_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Both shapes', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD',
          1000, 450000000, 8.5, 240, 'monthly', DATE '2026-01-01')
$$, 'a fixed commitment carrying loan terms');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                              principal_minor, frequency, start_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Half a loan', 'amortising',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD',
          450000000, 'monthly', DATE '2026-01-01')
$$, 'an amortising commitment with no rate or tenure');


-- ── 6. A commitment has to move money somewhere, and not to itself ──────────

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, currency, amount_minor, frequency, start_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Nowhere', 'fixed', 'CAD',
          1000, 'monthly', DATE '2026-01-01')
$$, 'a commitment with no account at either end');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, to_account_id,
                              currency, amount_minor, frequency, start_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'To itself', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'CAD', 1000, 'monthly', DATE '2026-01-01')
$$, 'a transfer from an account to itself');


-- ── 7. The occurrence day must fit the frequency ────────────────────────────
--
-- New in v2. In v1 this column was a bare INT and its own comment admitted
-- that Zod was the only thing enforcing the range — so anything written from
-- the SQL editor, an import or a script could hold a day its frequency could
-- never produce.

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                              amount_minor, frequency, start_date, occurrence_day)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Weekly day 9', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD', 1000,
          'weekly', DATE '2026-01-01', 9)
$$, 'a weekly commitment on day 9');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                              amount_minor, frequency, start_date, occurrence_day)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Monthly day 0', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD', 1000,
          'monthly', DATE '2026-01-01', 0)
$$, 'a monthly commitment on day 0');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                              amount_minor, frequency, start_date, occurrence_day)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Daily with a day', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD', 1000,
          'daily', DATE '2026-01-01', 3)
$$, 'a daily commitment carrying a day of the week');

-- The 31st of the month is legitimate, and the schedule clamps it per month
-- (31 Jan → 28 Feb → 31 Mar) rather than drifting.
INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                            amount_minor, frequency, start_date, occurrence_day)
VALUES ('11111111-1111-1111-1111-111111111111', 'Month end', 'fixed',
        'aaaaaaaa-0000-0000-0000-000000000001', 'CAD', 1000,
        'monthly', DATE '2026-01-31', 31);
DO $$ BEGIN RAISE NOTICE 'PASS  a month-end commitment on the 31st is accepted'; END $$;


-- ── 8. A commitment cannot end before it starts, or supersede itself ────────

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment (user_id, name, kind, from_account_id, currency,
                              amount_minor, frequency, start_date, end_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Backwards', 'fixed',
          'aaaaaaaa-0000-0000-0000-000000000001', 'CAD', 1000,
          'monthly', DATE '2026-06-01', DATE '2026-01-01')
$$, 'a commitment that ends before it starts');

SELECT pg_temp.must_reject($$
  UPDATE fin_commitment
     SET supersedes_id = id
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'a commitment that supersedes itself');


-- ── 9. Events must carry the value they exist for ───────────────────────────

INSERT INTO fin_commitment_event (user_id, commitment_id, kind, effective_date, rate, effect)
VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000004',
        'rate_change', DATE '2026-10-01', 9.100, 'tenure');
INSERT INTO fin_commitment_event (user_id, commitment_id, kind, effective_date, amount_minor)
VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000004',
        'prepayment', DATE '2027-01-01', 50000000);
DO $$ BEGIN RAISE NOTICE 'PASS  rate changes and prepayments are recorded'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment_event (user_id, commitment_id, kind, effective_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000004',
          'rate_change', DATE '2026-11-01')
$$, 'a rate change with no rate');

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment_event (user_id, commitment_id, kind, effective_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000004',
          'prepayment', DATE '2026-11-01')
$$, 'a prepayment with no amount');


-- ── 10. An occurrence can only be recorded once ─────────────────────────────
--
-- The confirm queue is derived — commitments minus posted minus skipped — so
-- the guard against proposing the same occurrence twice has to live here.

INSERT INTO fin_transaction (id, user_id, date, description, kind, commitment_id, occurrence_date)
VALUES ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        DATE '2026-03-03', 'Rent', 'spend',
        'bbbbbbbb-0000-0000-0000-000000000001', DATE '2026-03-01');
INSERT INTO fin_posting (user_id, transaction_id, account_id, amount_minor, currency)
VALUES ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', -180000, 'CAD');
DO $$ BEGIN RAISE NOTICE 'PASS  an occurrence paid late still belongs to its due date'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_transaction (user_id, date, description, kind, commitment_id, occurrence_date)
  VALUES ('11111111-1111-1111-1111-111111111111', DATE '2026-03-05', 'Rent again', 'spend',
          'bbbbbbbb-0000-0000-0000-000000000001', DATE '2026-03-01')
$$, 'the same occurrence recorded twice');


-- ── 11. Skipping an occurrence, once ────────────────────────────────────────

INSERT INTO fin_commitment_skip (user_id, commitment_id, due_date, reason)
VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001',
        DATE '2026-04-01', 'Landlord waived it');
DO $$ BEGIN RAISE NOTICE 'PASS  an occurrence can be skipped'; END $$;

SELECT pg_temp.must_reject($$
  INSERT INTO fin_commitment_skip (user_id, commitment_id, due_date)
  VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001',
          DATE '2026-04-01')
$$, 'the same occurrence skipped twice');


-- ── 12. Deleting a commitment keeps the history it produced ─────────────────

-- v1 promised this in the delete dialog — "transactions already recorded from
-- it are kept; deleting the rule does not rewrite your history" — and it is
-- now a foreign key with ON DELETE SET NULL rather than a promise.
--
-- Deleting Rent also exercises two other cascades: the mortgage that
-- supersedes it (SET NULL) and the skipped occurrence (CASCADE).

DO $$
DECLARE
  v_kept       INT;
  v_commitment UUID;
  v_supersedes UUID;
  v_skips      INT;
BEGIN
  DELETE FROM fin_commitment WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

  SELECT count(*) INTO v_kept FROM fin_transaction
   WHERE id = 'dddddddd-0000-0000-0000-000000000001';
  IF v_kept <> 1 THEN
    RAISE EXCEPTION 'FAIL  the recorded rent payment vanished with its commitment';
  END IF;

  SELECT commitment_id INTO v_commitment FROM fin_transaction
   WHERE id = 'dddddddd-0000-0000-0000-000000000001';
  IF v_commitment IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  the kept transaction still points at a deleted commitment';
  END IF;

  SELECT supersedes_id INTO v_supersedes FROM fin_commitment
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000004';
  IF v_supersedes IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL  the mortgage still supersedes a commitment that is gone';
  END IF;

  SELECT count(*) INTO v_skips FROM fin_commitment_skip
   WHERE commitment_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  IF v_skips <> 0 THEN
    RAISE EXCEPTION 'FAIL  % skips outlived their commitment', v_skips;
  END IF;

  RAISE NOTICE 'PASS  recorded history outlives its commitment; skips and supersession do not';
END $$;

SELECT 'ALL CHECKS PASSED' AS result;
