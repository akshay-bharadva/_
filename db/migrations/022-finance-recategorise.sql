-- 022: improving imported transactions after the fact, and the categories a
-- Canadian statement turned out to need.
--
-- The classifier learned to read CIBC's channel words, e-Transfers to the
-- owner's own accounts, fee rebates, gig payouts, cashback and a few hundred
-- more merchants. Rows imported before that are still wrong until something
-- re-reads them; `recategorise_transactions` is how the Import screen writes
-- the fixes the owner approved — category, a readable name, and pairing the
-- two legs of a transfer — in one transaction.
--
-- SECURITY DEFINER, so it re-checks AAL2 itself and verifies every row,
-- category and transfer partner belongs to the caller.
--
-- Additive and guarded. Mirrored in db/schema.sql.

CREATE OR REPLACE FUNCTION public.seed_finance_defaults(base CHAR(3) DEFAULT 'CAD')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO finance_settings (user_id, base_currency)
  VALUES (uid, base) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO finance_categories (user_id, name, bucket, is_essential, sort_order)
  VALUES
    (uid, 'Salary',              'income',   false, 10),
    (uid, 'Freelance',           'income',   false, 20),
    (uid, 'Interest',            'income',   false, 25),
    (uid, 'Government benefits', 'income',   false, 26),
    (uid, 'Money received',      'income',   false, 27),
    (uid, 'Cashback & rewards',  'income',   false, 28),
    (uid, 'Rent',                'need',     true,  30),
    (uid, 'Utilities',           'need',     true,  40),
    (uid, 'Groceries',           'need',     true,  50),
    (uid, 'Transport',           'need',     true,  60),
    (uid, 'Phone & internet',    'need',     true,  70),
    (uid, 'Insurance',           'need',     true,  80),
    (uid, 'Healthcare',          'need',     true,  90),
    (uid, 'Bank fees',           'need',     false, 95),
    (uid, 'Government fees',     'need',     false, 96),
    (uid, 'Education',           'need',     false, 97),
    (uid, 'Family support',      'need',     true,  100),
    (uid, 'Dining out',          'want',     false, 110),
    (uid, 'Shopping',            'want',     false, 120),
    (uid, 'Cash',                'want',     false, 125),
    (uid, 'Entertainment',       'want',     false, 130),
    (uid, 'Payments to people',  'want',     false, 135),
    (uid, 'Travel',              'want',     false, 140),
    (uid, 'Subscriptions',       'want',     false, 150),
    (uid, 'Personal care',       'want',     false, 152),
    (uid, 'Alcohol & vape',      'want',     false, 154),
    (uid, 'Pets',                'want',     false, 156),
    (uid, 'Savings',             'save',     false, 160),
    (uid, 'Investments',         'save',     false, 170),
    (uid, 'Debt repayment',      'save',     false, 180),
    (uid, 'Transfer',            'transfer', false, 190)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_defaults(CHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_defaults(CHAR) TO authenticated;

-- p_updates: [{ id, category_id?, description?, merchant?, pair_with? }]
-- A key that is absent leaves that column alone; category_id null clears it.
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

    IF v_cat IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance_categories WHERE id = v_cat AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    UPDATE transactions
       SET category_id = CASE WHEN v_row ? 'category_id' THEN v_cat ELSE category_id END,
           category = CASE
             WHEN v_row ? 'category_id' THEN (SELECT name FROM finance_categories WHERE id = v_cat)
             ELSE category END,
           description = coalesce(left(NULLIF(v_row->>'description', ''), 200), description),
           merchant = CASE
             WHEN v_row ? 'merchant' THEN left(NULLIF(v_row->>'merchant', ''), 200)
             ELSE merchant END
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
