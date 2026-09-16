-- 030: finance v2 — writing a transaction atomically.
--
-- Additive and guarded; requires 025. Safe to re-run.
--
-- THE GAP THIS CLOSES. 025 makes a half transfer unrepresentable *within a
-- statement*: the deferred trigger fires at commit and sees both legs. But a
-- client writing over PostgREST makes two round trips — one for the header,
-- one for the postings — and two round trips are two transactions. If the
-- second fails, the first has already committed, and the ledger is left with a
-- transaction that has no postings: not corrupt money, but a row that means
-- nothing and that every count will include.
--
-- The database cannot prevent that on its own, because nothing fires when a
-- header is inserted alone. So the write is a function: one call, one
-- transaction, both halves or neither.
--
-- Deletion needs no function. `ON DELETE CASCADE` on `fin_posting` already
-- removes a transaction's legs with it, and the transfer trigger tolerates the
-- header being gone.


-- ── 1. Record one ───────────────────────────────────────────────────────────
--
-- p_transaction: { date, description, raw_description?, merchant?, notes?,
--                  kind, is_pending?, commitment_id?, occurrence_date?,
--                  import_hash?, import_batch_id? }
-- p_postings:    [ { account_id?, category_id?, amount_minor, currency,
--                    fee_minor?, fx_rate?, base_amount_minor? } ]
--
-- Ownership is checked for every id the caller supplies. A SECURITY DEFINER
-- function that trusted them would happily attach a posting to somebody else's
-- account, which is the whole reason definer functions are written carefully.

CREATE OR REPLACE FUNCTION public.fin_record_transaction(
  p_transaction JSONB,
  p_postings JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_id      UUID;
  v_posting JSONB;
  v_account UUID;
  v_category UUID;
  v_count   INT := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_postings IS NULL OR jsonb_typeof(p_postings) <> 'array'
     OR jsonb_array_length(p_postings) = 0 THEN
    RAISE EXCEPTION 'A transaction needs at least one posting';
  END IF;
  IF jsonb_array_length(p_postings) > 20 THEN
    RAISE EXCEPTION 'At most 20 postings in one transaction';
  END IF;

  INSERT INTO fin_transaction (
    user_id, date, description, raw_description, merchant, notes, kind,
    is_pending, commitment_id, occurrence_date, import_hash, import_batch_id
  )
  VALUES (
    v_uid,
    (p_transaction->>'date')::date,
    left(coalesce(NULLIF(p_transaction->>'description', ''), 'Untitled'), 200),
    left(NULLIF(p_transaction->>'raw_description', ''), 500),
    left(NULLIF(p_transaction->>'merchant', ''), 200),
    NULLIF(p_transaction->>'notes', ''),
    coalesce(NULLIF(p_transaction->>'kind', ''), 'spend')::fin_transaction_kind,
    coalesce((p_transaction->>'is_pending')::boolean, false),
    -- Only a commitment of the caller's own.
    (SELECT c.id FROM fin_commitment c
      WHERE c.id = NULLIF(p_transaction->>'commitment_id', '')::uuid
        AND c.user_id = v_uid),
    NULLIF(p_transaction->>'occurrence_date', '')::date,
    left(NULLIF(p_transaction->>'import_hash', ''), 64),
    (SELECT b.id FROM fin_import_batch b
      WHERE b.id = NULLIF(p_transaction->>'import_batch_id', '')::uuid
        AND b.user_id = v_uid)
  )
  RETURNING id INTO v_id;

  FOR v_posting IN SELECT value FROM jsonb_array_elements(p_postings) LOOP
    v_account := NULLIF(v_posting->>'account_id', '')::uuid;
    v_category := NULLIF(v_posting->>'category_id', '')::uuid;

    IF v_account IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_account WHERE id = v_account AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Account not found';
    END IF;
    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_category WHERE id = v_category AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    INSERT INTO fin_posting (
      user_id, transaction_id, account_id, category_id,
      amount_minor, currency, fee_minor, fx_rate, base_amount_minor
    )
    VALUES (
      v_uid, v_id, v_account, v_category,
      (v_posting->>'amount_minor')::bigint,
      upper(v_posting->>'currency'),
      NULLIF(v_posting->>'fee_minor', '')::bigint,
      NULLIF(v_posting->>'fx_rate', '')::numeric,
      NULLIF(v_posting->>'base_amount_minor', '')::bigint
    );
    v_count := v_count + 1;
  END LOOP;

  -- Force the deferred transfer check *inside* this function, so a bad pair
  -- raises here and the whole call rolls back — rather than at the end of the
  -- surrounding statement, where the caller has already been told it worked.
  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_record_transaction(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_record_transaction(JSONB, JSONB) TO authenticated;


-- ── 2. Change one ───────────────────────────────────────────────────────────
--
-- Postings are replaced wholesale rather than patched. Editing a transfer
-- means changing two rows at once — amount on one side, account on the other —
-- and a partial update is exactly how the two legs stop agreeing. Deleting and
-- re-inserting them inside one transaction keeps the pair honest, and the
-- deferred trigger judges the result.

CREATE OR REPLACE FUNCTION public.fin_update_transaction(
  p_id UUID,
  p_transaction JSONB,
  p_postings JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_posting JSONB;
  v_account UUID;
  v_category UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fin_transaction WHERE id = p_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF p_postings IS NULL OR jsonb_typeof(p_postings) <> 'array'
     OR jsonb_array_length(p_postings) = 0 THEN
    RAISE EXCEPTION 'A transaction needs at least one posting';
  END IF;

  UPDATE fin_transaction
     SET date = coalesce(NULLIF(p_transaction->>'date', '')::date, date),
         description = coalesce(left(NULLIF(p_transaction->>'description', ''), 200), description),
         raw_description = CASE WHEN p_transaction ? 'raw_description'
                                THEN left(NULLIF(p_transaction->>'raw_description', ''), 500)
                                ELSE raw_description END,
         merchant = CASE WHEN p_transaction ? 'merchant'
                         THEN left(NULLIF(p_transaction->>'merchant', ''), 200)
                         ELSE merchant END,
         notes = CASE WHEN p_transaction ? 'notes'
                      THEN NULLIF(p_transaction->>'notes', '') ELSE notes END,
         kind = coalesce(NULLIF(p_transaction->>'kind', '')::fin_transaction_kind, kind),
         is_pending = coalesce((p_transaction->>'is_pending')::boolean, is_pending)
   WHERE id = p_id AND user_id = v_uid;

  DELETE FROM fin_posting WHERE transaction_id = p_id;

  FOR v_posting IN SELECT value FROM jsonb_array_elements(p_postings) LOOP
    v_account := NULLIF(v_posting->>'account_id', '')::uuid;
    v_category := NULLIF(v_posting->>'category_id', '')::uuid;

    IF v_account IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_account WHERE id = v_account AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Account not found';
    END IF;
    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_category WHERE id = v_category AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    INSERT INTO fin_posting (
      user_id, transaction_id, account_id, category_id,
      amount_minor, currency, fee_minor, fx_rate, base_amount_minor
    )
    VALUES (
      v_uid, p_id, v_account, v_category,
      (v_posting->>'amount_minor')::bigint,
      upper(v_posting->>'currency'),
      NULLIF(v_posting->>'fee_minor', '')::bigint,
      NULLIF(v_posting->>'fx_rate', '')::numeric,
      NULLIF(v_posting->>'base_amount_minor', '')::bigint
    );
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_update_transaction(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_update_transaction(UUID, JSONB, JSONB) TO authenticated;
