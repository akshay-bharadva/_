-- 032 — repoint the inventory→purchase link at the v2 ledger.
--
-- `inventory_items.transaction_id` recorded the transaction an item was bought
-- with, and referenced v1's `transactions`. Migration 029 drops that table with
-- CASCADE, which removes the *constraint* and leaves the *column* — a UUID
-- pointing at nothing, with nothing to stop it.
--
-- That is a quiet outcome: no error, no warning, and a column that still looks
-- like a link. It was found while removing v1 from `db/schema.sql`, by asking
-- what else referenced the tables being deleted.
--
-- THE LINK DOES NOT HAVE TO BE LOST. Migration 028 preserved every id — a v1
-- transaction kept its UUID when it became a `fin_transaction` row — so these
-- values already point at the same purchase in the new ledger. The data was
-- right the whole time; only the constraint had to move.
--
-- Safe to re-run, and safe to run whether or not 029 has been run yet.

-- ── 1. Drop the old constraint, whatever it is called ───────────────────────
--
-- Located by what it points at rather than by name: it was created inline, so
-- its name is whatever Postgres generated. If 029 has already run, CASCADE
-- removed it and this loop finds nothing.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_class parent ON parent.oid = con.confrelid
     WHERE con.contype = 'f'
       AND child.relname = 'inventory_items'
       AND parent.relname = 'transactions'
  LOOP
    EXECUTE format('ALTER TABLE inventory_items DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- ── 2. Clear anything that no longer resolves ───────────────────────────────
--
-- Before adding the new constraint, not after: a FK cannot be added while a row
-- violates it, and failing the whole migration over an item whose purchase was
-- deleted years ago would be the wrong trade. A cleared link loses the fact that
-- *some* transaction bought this item — but that fact was already unusable, and
-- keeping it would block the ones that still work.
UPDATE inventory_items i
   SET transaction_id = NULL
 WHERE i.transaction_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM fin_transaction t WHERE t.id = i.transaction_id
   );

-- ── 3. Point it at the v2 ledger ────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_transaction_fkey
    FOREIGN KEY (transaction_id) REFERENCES fin_transaction(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. What it did ──────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE transaction_id IS NOT NULL) AS items_still_linked,
  count(*) AS items_total
FROM inventory_items;
