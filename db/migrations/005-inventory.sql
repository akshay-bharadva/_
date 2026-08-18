-- =============================================================================
-- 005 — Inventory: location, quantity, tags, archiving
-- =============================================================================
--
-- Run once against an existing database. `db/schema.sql` carries the same
-- definitions so a fresh install arrives here directly.
--
-- Safe to re-run: every statement is guarded. No row is altered — existing
-- items become quantity-1, unlocated, unarchived, which is exactly how they
-- behaved before.
-- =============================================================================

ALTER TABLE inventory_items
  -- The question a home inventory is actually asked. Nothing recorded where
  -- anything was, so the module could tell you what a thing cost and not
  -- whether it was in the loft or the office.
  ADD COLUMN IF NOT EXISTS location TEXT,

  -- Six of the same cable was six rows, each with a sixth of the value.
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,

  ADD COLUMN IF NOT EXISTS tags TEXT[],

  -- Things are sold, given away and thrown out. Deleting the row takes the
  -- purchase price with it, which is the one number worth keeping after the
  -- object is gone.
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_quantity_range;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_quantity_range
  CHECK (quantity >= 1 AND quantity <= 100000);

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_location_length;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_location_length
  CHECK (location IS NULL OR length(location) <= 120);

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_archived_reason_valid;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_archived_reason_valid
  CHECK (archived_reason IS NULL OR archived_reason IN ('sold', 'gifted', 'lost', 'discarded', 'returned'));

-- An item cannot be archived for a reason it was never archived for.
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_reason_needs_archive;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_reason_needs_archive
  CHECK (archived_reason IS NULL OR archived_at IS NOT NULL);

-- A warranty that ends before the thing was bought is a typo.
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_warranty_after_purchase;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_warranty_after_purchase
  CHECK (purchase_date IS NULL OR warranty_expiry IS NULL OR warranty_expiry >= purchase_date);

CREATE INDEX IF NOT EXISTS inventory_items_archived_at_idx ON inventory_items(archived_at);
CREATE INDEX IF NOT EXISTS inventory_items_warranty_expiry_idx ON inventory_items(warranty_expiry);
CREATE INDEX IF NOT EXISTS inventory_items_location_idx ON inventory_items(location);
