-- ============================================================================
-- 013 — Watchlist: instruments you are tracking
-- ============================================================================
--
-- Guarded and safe to re-run. Additive.
--
-- Stocks, ETFs, bonds and mutual funds — the last of which is why `symbol` is
-- nullable. A Canadian bank fund like RBF461 or CIB512 has a code its own
-- institution uses and no public quote feed carries, so an item has to be
-- allowed to exist as a tracked position with your own figures and no live
-- price. Requiring a symbol would mean either excluding half of what a person
-- actually holds, or inventing tickers that resolve to nothing.
--
-- Nothing fetched is stored here either. Prices come from the market-data edge
-- function at read time; caching them would mean deciding when a quote goes
-- stale, and a stale price on a page about money is worse than no price.

CREATE TABLE IF NOT EXISTS watchlist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),

  -- What you call it. Always present, because this is what the row is *for*.
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),

  -- The quote symbol, when one exists. Yahoo's convention: RY.TO, CM.TO,
  -- VFV.TO, AAPL. Bounded and pattern-checked because it is interpolated into
  -- a request path by the edge function, and an unbounded value there is how a
  -- proxy becomes an open redirect.
  symbol        TEXT CHECK (
                  symbol IS NULL
                  OR (char_length(symbol) BETWEEN 1 AND 20
                      AND symbol ~ '^[A-Za-z0-9.\-^=]+$')
                ),

  kind          TEXT NOT NULL DEFAULT 'stock'
                CHECK (kind IN ('stock', 'etf', 'bond', 'mutual_fund', 'other')),

  -- RBC, CIBC, Questrade — where it is actually held. Free text, because the
  -- list of institutions is not this app's business to enumerate.
  institution   TEXT CHECK (char_length(coalesce(institution, '')) <= 80),

  currency      CHAR(3),

  -- Your position and your intent. Both optional: a watchlist entry is often
  -- something you do not own yet.
  quantity      NUMERIC(18,6) CHECK (quantity IS NULL OR quantity >= 0),
  target_price  NUMERIC(18,4) CHECK (target_price IS NULL OR target_price > 0),

  notes         TEXT CHECK (char_length(coalesce(notes, '')) <= 2000),
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage watchlist" ON watchlist_items;
CREATE POLICY "Admin manage watchlist" ON watchlist_items FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS watchlist_items_user_idx
  ON watchlist_items (user_id, sort_order);

DROP TRIGGER IF EXISTS update_watchlist_items_updated_at ON watchlist_items;
CREATE TRIGGER update_watchlist_items_updated_at
  BEFORE UPDATE ON watchlist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
