-- 021: importing bank statements.
--
-- CIBC and RBC export per account as CSV, and only a window of it — about 13
-- months at CIBC and 180 days at RBC — so a statement gets imported many
-- times over overlapping ranges. Three things make that safe and worth doing:
--
-- 1. **A fingerprint per imported row**, unique per account. Re-importing a
--    range already imported is a no-op for the rows that are already there,
--    enforced by the database rather than hoped for by the client.
-- 2. **A batch per import**, so a wrong import — the wrong account picked,
--    the signs backwards — is undone in one step rather than row by row.
-- 3. **Rules learned from your corrections**, so the second import of a
--    merchant is categorised the way you categorised the first.
--
-- The write is one RPC: the batch, every row and the learned rules land
-- together or not at all. SECURITY DEFINER, so it re-checks AAL2 itself and
-- verifies that the account, every category and every transfer partner belong
-- to the caller.
--
-- Additive and guarded. Mirrored in db/schema.sql.

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) <= 255),
  format TEXT NOT NULL CHECK (char_length(format) BETWEEN 1 AND 40),
  rows_in_file INT NOT NULL DEFAULT 0 CHECK (rows_in_file >= 0),
  rows_imported INT NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
  rows_skipped INT NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
  date_from DATE,
  date_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_import_batches_user_idx
  ON finance_import_batches(user_id, created_at DESC);

ALTER TABLE finance_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage import batches" ON finance_import_batches;
CREATE POLICY "Admin manage import batches" ON finance_import_batches
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

ALTER TABLE transactions
  -- Deterministic per (account, date, amount, description, nth identical row
  -- in the file). Null for anything not imported.
  ADD COLUMN IF NOT EXISTS import_hash TEXT
    CHECK (import_hash IS NULL OR char_length(import_hash) <= 64),
  ADD COLUMN IF NOT EXISTS import_batch_id UUID
    REFERENCES finance_import_batches(id) ON DELETE SET NULL,
  -- The bank's own wording, kept verbatim: the description shown is cleaned,
  -- and the original is what a rule or a later re-classification reads.
  ADD COLUMN IF NOT EXISTS raw_description TEXT
    CHECK (raw_description IS NULL OR char_length(raw_description) <= 500);

-- Not partial: `ON CONFLICT` needs a plain unique index to target, and NULLs
-- are distinct in a unique index, so hand-entered rows never collide.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_hash_idx
  ON transactions(user_id, account_id, import_hash);
CREATE INDEX IF NOT EXISTS transactions_import_batch_idx
  ON transactions(import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Which account a multi-account export's rows belong to: RBC puts the account
-- number on every row, CIBC puts the card number on card rows. Only the last
-- four digits are kept.
ALTER TABLE finance_accounts
  ADD COLUMN IF NOT EXISTS import_ref TEXT
    CHECK (import_ref IS NULL OR import_ref ~ '^[0-9]{2,6}$');

CREATE TABLE IF NOT EXISTS finance_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- A normalised merchant key ("LOBLAWS", "ETRANSFER JOHN DOE").
  pattern TEXT NOT NULL CHECK (char_length(pattern) BETWEEN 2 AND 120),
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  -- 'transfer' marks the merchant as money moving between your own accounts.
  kind TEXT NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense', 'income', 'transfer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pattern)
);

ALTER TABLE finance_category_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage category rules" ON finance_category_rules;
CREATE POLICY "Admin manage category rules" ON finance_category_rules
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_category_rules_updated_at ON finance_category_rules;
CREATE TRIGGER update_finance_category_rules_updated_at BEFORE UPDATE ON finance_category_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Categories a bank statement needs ───────────────────────────────────────
-- Fees, cash, interest, government deposits and e-Transfers to people are on
-- every statement and had nowhere to go. Added for everyone already set up;
-- new setups get them from seed_finance_defaults below.
INSERT INTO finance_categories (user_id, name, bucket, is_essential, sort_order)
SELECT s.user_id, c.name, c.bucket::category_bucket, c.essential, c.sort_order
  FROM finance_settings s
 CROSS JOIN (VALUES
   ('Interest',            'income', false, 25),
   ('Government benefits', 'income', false, 26),
   ('Money received',      'income', false, 27),
   ('Bank fees',           'need',   false, 95),
   ('Cash',                'want',   false, 125),
   ('Payments to people',  'want',   false, 135)
 ) AS c(name, bucket, essential, sort_order)
ON CONFLICT (user_id, name) DO NOTHING;

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
    (uid, 'Rent',                'need',     true,  30),
    (uid, 'Utilities',           'need',     true,  40),
    (uid, 'Groceries',           'need',     true,  50),
    (uid, 'Transport',           'need',     true,  60),
    (uid, 'Phone & internet',    'need',     true,  70),
    (uid, 'Insurance',           'need',     true,  80),
    (uid, 'Healthcare',          'need',     true,  90),
    (uid, 'Bank fees',           'need',     false, 95),
    (uid, 'Family support',      'need',     true,  100),
    (uid, 'Dining out',          'want',     false, 110),
    (uid, 'Shopping',            'want',     false, 120),
    (uid, 'Cash',                'want',     false, 125),
    (uid, 'Entertainment',       'want',     false, 130),
    (uid, 'Payments to people',  'want',     false, 135),
    (uid, 'Travel',              'want',     false, 140),
    (uid, 'Subscriptions',       'want',     false, 150),
    (uid, 'Savings',             'save',     false, 160),
    (uid, 'Investments',         'save',     false, 170),
    (uid, 'Debt repayment',      'save',     false, 180),
    (uid, 'Transfer',            'transfer', false, 190)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_defaults(CHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_defaults(CHAR) TO authenticated;

-- ── Importing, atomically ───────────────────────────────────────────────────
--
-- p_rows: [{ date, description, raw_description, merchant, amount (> 0),
--            type ('earning'|'expense'), category_id, import_hash,
--            pair_with (an existing transaction id: the other leg of a
--            transfer between your own accounts) }]
-- p_rules: [{ pattern, category_id, kind }]
CREATE OR REPLACE FUNCTION public.import_transactions(
  p_account_id UUID,
  p_file_name TEXT,
  p_format TEXT,
  p_rows_in_file INT,
  p_rows JSONB,
  p_rules JSONB DEFAULT '[]'::jsonb,
  p_import_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_batch    UUID;
  v_row      JSONB;
  v_new_id   UUID;
  v_category UUID;
  v_pair     UUID;
  v_group    UUID;
  v_inserted INT := 0;
  v_paired   INT := 0;
  v_total    INT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM finance_accounts WHERE id = p_account_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Rows must be a list';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total > 5000 THEN
    RAISE EXCEPTION 'At most 5000 rows per import';
  END IF;

  INSERT INTO finance_import_batches
    (user_id, account_id, file_name, format, rows_in_file)
  VALUES
    (v_uid, p_account_id, left(p_file_name, 255), left(p_format, 40),
     greatest(coalesce(p_rows_in_file, 0), 0))
  RETURNING id INTO v_batch;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_category := NULLIF(v_row->>'category_id', '')::uuid;
    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance_categories WHERE id = v_category AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    v_new_id := NULL;
    INSERT INTO transactions (
      user_id, account_id, date, description, raw_description, merchant,
      amount, type, category_id, category, import_hash, import_batch_id
    )
    VALUES (
      v_uid,
      p_account_id,
      (v_row->>'date')::date,
      left(coalesce(NULLIF(v_row->>'description', ''), 'Imported'), 200),
      left(v_row->>'raw_description', 500),
      left(NULLIF(v_row->>'merchant', ''), 200),
      (v_row->>'amount')::numeric,
      (v_row->>'type')::transaction_type,
      v_category,
      (SELECT name FROM finance_categories WHERE id = v_category),
      left(v_row->>'import_hash', 64),
      v_batch
    )
    ON CONFLICT (user_id, account_id, import_hash) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;

      -- The other leg of a transfer between your own accounts, already in
      -- the ledger from another account. Only an unpaired row of the
      -- caller's, in a different account, can be claimed.
      v_pair := NULLIF(v_row->>'pair_with', '')::uuid;
      IF v_pair IS NOT NULL THEN
        v_group := gen_random_uuid();
        UPDATE transactions
           SET transfer_group = v_group,
               category_id = coalesce(v_category, category_id),
               category = coalesce(
                 (SELECT name FROM finance_categories WHERE id = v_category),
                 category)
         WHERE id = v_pair
           AND user_id = v_uid
           AND transfer_group IS NULL
           AND account_id IS DISTINCT FROM p_account_id;
        IF FOUND THEN
          UPDATE transactions SET transfer_group = v_group WHERE id = v_new_id;
          v_paired := v_paired + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Rules learned from this import's corrections. A category that is not the
  -- caller's is dropped rather than failing the import.
  INSERT INTO finance_category_rules (user_id, pattern, category_id, kind)
  SELECT v_uid,
         left(r->>'pattern', 120),
         NULLIF(r->>'category_id', '')::uuid,
         coalesce(NULLIF(r->>'kind', ''), 'expense')
    FROM jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) AS r
   WHERE char_length(coalesce(r->>'pattern', '')) >= 2
     AND (
       NULLIF(r->>'category_id', '') IS NULL
       OR EXISTS (
         SELECT 1 FROM finance_categories c
          WHERE c.id = (r->>'category_id')::uuid AND c.user_id = v_uid
       )
     )
  ON CONFLICT (user_id, pattern) DO UPDATE
     SET category_id = EXCLUDED.category_id,
         kind = EXCLUDED.kind,
         updated_at = now();

  IF p_import_ref IS NOT NULL AND p_import_ref ~ '^[0-9]{2,6}$' THEN
    UPDATE finance_accounts SET import_ref = p_import_ref
     WHERE id = p_account_id AND user_id = v_uid;
  END IF;

  UPDATE finance_import_batches
     SET rows_imported = v_inserted,
         rows_skipped = greatest(v_total - v_inserted, 0),
         date_from = (SELECT min((r->>'date')::date) FROM jsonb_array_elements(p_rows) r),
         date_to = (SELECT max((r->>'date')::date) FROM jsonb_array_elements(p_rows) r)
   WHERE id = v_batch;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'inserted', v_inserted,
    'skipped', greatest(v_total - v_inserted, 0),
    'paired', v_paired
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_transactions(UUID, TEXT, TEXT, INT, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transactions(UUID, TEXT, TEXT, INT, JSONB, JSONB, TEXT) TO authenticated;

-- ── Undoing one ─────────────────────────────────────────────────────────────
-- Deletes the batch's rows, and unpairs the transfer legs in other accounts
-- that this import had claimed — they were unpaired before it, so they are
-- again after.
CREATE OR REPLACE FUNCTION public.undo_import(p_batch_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM finance_import_batches WHERE id = p_batch_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Import not found';
  END IF;

  UPDATE transactions t
     SET transfer_group = NULL
   WHERE t.user_id = v_uid
     AND t.import_batch_id IS DISTINCT FROM p_batch_id
     AND t.transfer_group IN (
       SELECT transfer_group FROM transactions
        WHERE import_batch_id = p_batch_id
          AND user_id = v_uid
          AND transfer_group IS NOT NULL
     );

  DELETE FROM transactions WHERE import_batch_id = p_batch_id AND user_id = v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM finance_import_batches WHERE id = p_batch_id AND user_id = v_uid;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.undo_import(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_import(UUID) TO authenticated;
