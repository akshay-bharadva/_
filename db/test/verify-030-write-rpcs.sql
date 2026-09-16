-- Verification for db/migrations/030-finance-v2-write-rpcs.sql.
--
-- Runs after the prelude, 025/026/027 and their verifications, so the accounts
-- and categories from verify-025 exist.
--
-- The property under test is atomicity. A client writing a header and then its
-- postings makes two round trips, and a failure between them leaves a
-- transaction with no postings. Every rejection below must therefore leave
-- *nothing at all* behind — not a rejected posting, and not an orphan header.
--
-- ONE SHOT, AGAINST A FRESH DATABASE.

\set ON_ERROR_STOP on

SET app.uid = '11111111-1111-1111-1111-111111111111';
SET app.jwt = '{"aal":"aal2"}';

-- Counts before each attempt, so "nothing was left behind" is measured rather
-- than assumed.
CREATE OR REPLACE FUNCTION pg_temp.ledger_size()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM fin_transaction)::text || '/' ||
         (SELECT count(*) FROM fin_posting)::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.must_reject_atomically(p_sql TEXT, p_what TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_before TEXT; v_after TEXT;
BEGIN
  v_before := pg_temp.ledger_size();
  BEGIN
    EXECUTE p_sql;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN others THEN
    v_after := pg_temp.ledger_size();
    IF v_after <> v_before THEN
      RAISE EXCEPTION 'FAIL  % was rejected but left the ledger at % (was %)',
        p_what, v_after, v_before;
    END IF;
    RAISE NOTICE 'PASS  % is rejected, and nothing is left behind', p_what;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % was accepted', p_what;
END;
$$;


-- ── 1. A spend, in one call ─────────────────────────────────────────────────

DO $$
DECLARE v_id UUID; v_legs INT;
BEGIN
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-01","description":"Groceries","kind":"spend"}'::jsonb,
    ('[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001",' ||
      '"category_id":"cccccccc-0000-0000-0000-000000000001",' ||
      '"amount_minor":-4500,"currency":"CAD"}]')::jsonb
  ) INTO v_id;

  SELECT count(*) INTO v_legs FROM fin_posting WHERE transaction_id = v_id;
  IF v_legs <> 1 THEN
    RAISE EXCEPTION 'FAIL  a spend wrote % postings, expected 1', v_legs;
  END IF;
  RAISE NOTICE 'PASS  a spend is written in one call';
END $$;


-- ── 2. A transfer, both legs or neither ─────────────────────────────────────

DO $$
DECLARE v_id UUID; v_net BIGINT; v_legs INT;
BEGIN
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-02","description":"To savings","kind":"transfer"}'::jsonb,
    ('[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":-50000,"currency":"CAD","fee_minor":500},' ||
      '{"account_id":"aaaaaaaa-0000-0000-0000-000000000002","amount_minor":50000,"currency":"CAD"}]')::jsonb
  ) INTO v_id;

  SELECT count(*), sum(amount_minor) INTO v_legs, v_net
    FROM fin_posting WHERE transaction_id = v_id;
  IF v_legs <> 2 OR v_net <> 0 THEN
    RAISE EXCEPTION 'FAIL  the transfer wrote % legs netting %', v_legs, v_net;
  END IF;
  RAISE NOTICE 'PASS  a transfer is written atomically, with its fee';
END $$;


-- ── 3. A half transfer leaves NOTHING — not even the header ─────────────────
--
-- The gap this migration exists to close. Written as two PostgREST calls, the
-- header would already be committed by the time the postings failed.

SELECT pg_temp.must_reject_atomically($sql$
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-03","description":"Half","kind":"transfer"}'::jsonb,
    '[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":-50000,"currency":"CAD"}]'::jsonb
  )
$sql$, 'a transfer with one leg');

SELECT pg_temp.must_reject_atomically($sql$
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-04","description":"Invented","kind":"transfer"}'::jsonb,
    ('[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":-50000,"currency":"CAD"},' ||
      '{"account_id":"aaaaaaaa-0000-0000-0000-000000000002","amount_minor":60000,"currency":"CAD"}]')::jsonb
  )
$sql$, 'a transfer that invents money');

SELECT pg_temp.must_reject_atomically($sql$
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-05","description":"Nothing","kind":"spend"}'::jsonb,
    '[]'::jsonb
  )
$sql$, 'a transaction with no postings');

SELECT pg_temp.must_reject_atomically($sql$
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-06","description":"Zero","kind":"spend"}'::jsonb,
    '[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":0,"currency":"CAD"}]'::jsonb
  )
$sql$, 'a posting that moves nothing');


-- ── 4. Somebody else's account is not yours to post to ──────────────────────
--
-- A SECURITY DEFINER function runs with the owner's rights, so an id it did
-- not check is an id it would happily have trusted.

SELECT pg_temp.must_reject_atomically($sql$
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-07","description":"Not mine","kind":"spend"}'::jsonb,
    '[{"account_id":"00000000-0000-0000-0000-0000000000ff","amount_minor":-100,"currency":"CAD"}]'::jsonb
  )
$sql$, 'a posting against an account that is not the caller''s');

SELECT pg_temp.must_reject_atomically($sql$
  SELECT public.fin_record_transaction(
    '{"date":"2026-03-08","description":"Bad category","kind":"spend"}'::jsonb,
    ('[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","category_id":"00000000-0000-0000-0000-0000000000ff",' ||
      '"amount_minor":-100,"currency":"CAD"}]')::jsonb
  )
$sql$, 'a posting against a category that is not the caller''s');


-- ── 5. Editing a transfer changes both legs together ────────────────────────

DO $$
DECLARE v_id UUID; v_net BIGINT; v_legs INT; v_desc TEXT;
BEGIN
  SELECT t.id INTO v_id FROM fin_transaction t
   WHERE t.description = 'To savings' AND t.kind = 'transfer'
   ORDER BY t.date DESC LIMIT 1;

  PERFORM public.fin_update_transaction(
    v_id,
    '{"description":"To savings, corrected"}'::jsonb,
    ('[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":-75000,"currency":"CAD"},' ||
      '{"account_id":"aaaaaaaa-0000-0000-0000-000000000002","amount_minor":75000,"currency":"CAD"}]')::jsonb
  );

  SELECT count(*), sum(amount_minor) INTO v_legs, v_net
    FROM fin_posting WHERE transaction_id = v_id;
  SELECT description INTO v_desc FROM fin_transaction WHERE id = v_id;

  IF v_legs <> 2 OR v_net <> 0 THEN
    RAISE EXCEPTION 'FAIL  the edited transfer has % legs netting %', v_legs, v_net;
  END IF;
  IF v_desc <> 'To savings, corrected' THEN
    RAISE EXCEPTION 'FAIL  the description reads %', v_desc;
  END IF;
  RAISE NOTICE 'PASS  editing a transfer replaces both legs together';
END $$;

-- An edit that would unbalance the pair must leave the original intact.
DO $$
DECLARE v_id UUID; v_before BIGINT; v_after BIGINT; v_raised BOOLEAN := false;
BEGIN
  SELECT t.id INTO v_id FROM fin_transaction t
   WHERE t.description = 'To savings, corrected' LIMIT 1;
  SELECT sum(amount_minor) INTO v_before FROM fin_posting WHERE transaction_id = v_id;

  BEGIN
    PERFORM public.fin_update_transaction(
      v_id, '{}'::jsonb,
      '[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":-75000,"currency":"CAD"}]'::jsonb
    );
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;

  SELECT sum(amount_minor) INTO v_after FROM fin_posting WHERE transaction_id = v_id;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  an edit was allowed to leave a transfer with one leg';
  END IF;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'FAIL  a rejected edit changed the transfer from % to %', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS  a rejected edit leaves the transfer exactly as it was';
END $$;


-- ── 6. Without MFA, nothing writes ──────────────────────────────────────────

DO $$
DECLARE v_raised BOOLEAN := false;
BEGIN
  SET LOCAL app.jwt = '{"aal":"aal1"}';
  BEGIN
    PERFORM public.fin_record_transaction(
      '{"date":"2026-03-09","description":"Password only","kind":"spend"}'::jsonb,
      '[{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","amount_minor":-100,"currency":"CAD"}]'::jsonb
    );
  EXCEPTION WHEN others THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'FAIL  a password-only session wrote to the ledger';
  END IF;
  RAISE NOTICE 'PASS  a session without MFA cannot write';
END $$;

SELECT 'ALL CHECKS PASSED' AS result;
