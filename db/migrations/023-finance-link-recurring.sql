-- 023: linking imported history to the recurring rules found in it.
--
-- "Found what repeats" turns a schedule in the imported history — pay every
-- other Friday, the phone bill monthly — into a recurring rule. The history
-- it was found in must then belong to that rule, or the forecast counts it
-- twice: once as the rule's projection, and again inside the day-to-day
-- run-rate, which is built from transactions *not* attached to a rule.
--
-- `recurring_transactions_link` is not a new function: it is
-- `recategorise_transactions` learning one more key. A present
-- `recurring_transaction_id` attaches the row to the rule (which must be the
-- caller's) and records its date as the occurrence it satisfied, so the
-- confirm queue never proposes it again.
--
-- Additive and guarded. Mirrored in db/schema.sql.

CREATE OR REPLACE FUNCTION public.recategorise_transactions(p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_row     JSONB;
  v_id      UUID;
  v_cat     UUID;
  v_rule    UUID;
  v_pair    UUID;
  v_group   UUID;
  v_updated INT := 0;
  v_paired  INT := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'Updates must be a list';
  END IF;
  IF jsonb_array_length(p_updates) > 5000 THEN
    RAISE EXCEPTION 'At most 5000 changes at once';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    v_id := (v_row->>'id')::uuid;
    v_cat := NULLIF(v_row->>'category_id', '')::uuid;
    v_rule := NULLIF(v_row->>'recurring_transaction_id', '')::uuid;

    IF v_cat IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance_categories WHERE id = v_cat AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    IF v_rule IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM recurring_transactions WHERE id = v_rule AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Recurring rule not found';
    END IF;

    UPDATE transactions
       SET category_id = CASE WHEN v_row ? 'category_id' THEN v_cat ELSE category_id END,
           category = CASE
             WHEN v_row ? 'category_id' THEN (SELECT name FROM finance_categories WHERE id = v_cat)
             ELSE category END,
           description = coalesce(left(NULLIF(v_row->>'description', ''), 200), description),
           merchant = CASE
             WHEN v_row ? 'merchant' THEN left(NULLIF(v_row->>'merchant', ''), 200)
             ELSE merchant END,
           recurring_transaction_id = CASE
             WHEN v_row ? 'recurring_transaction_id' THEN v_rule
             ELSE recurring_transaction_id END,
           occurrence_date = CASE
             WHEN v_row ? 'recurring_transaction_id' AND v_rule IS NOT NULL THEN coalesce(occurrence_date, date)
             ELSE occurrence_date END
     WHERE id = v_id AND user_id = v_uid;
    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;

    -- The other leg of a transfer: both the caller's, both unpaired, in two
    -- different accounts — or nothing happens.
    v_pair := NULLIF(v_row->>'pair_with', '')::uuid;
    IF v_pair IS NOT NULL AND v_pair <> v_id AND (
      SELECT count(*) FROM transactions
       WHERE id IN (v_id, v_pair) AND user_id = v_uid AND transfer_group IS NULL
    ) = 2 AND (
      SELECT count(DISTINCT account_id) FROM transactions
       WHERE id IN (v_id, v_pair) AND account_id IS NOT NULL
    ) = 2 THEN
      v_group := gen_random_uuid();
      UPDATE transactions SET transfer_group = v_group WHERE id IN (v_id, v_pair);
      v_paired := v_paired + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'paired', v_paired);
END;
$$;

REVOKE ALL ON FUNCTION public.recategorise_transactions(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recategorise_transactions(JSONB) TO authenticated;
