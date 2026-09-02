-- ============================================================================
-- 016 — A watchlist, and somewhere honest to keep a market-data key
-- ============================================================================
--
-- ## Why there is a key at all
--
-- The Discover module is built on keyless, CORS-open sources, because a static
-- export has no server and any key would travel as `NEXT_PUBLIC_*` and be
-- compiled into the bundle — a published key.
--
-- Quotes for stocks, ETFs and mutual funds are the one thing with no keyless
-- source. This was tested rather than assumed: Yahoo's endpoint rate-limits
-- immediately and is unofficial, Stooq returns 404 for its documented CSV
-- shapes and sends no CORS headers, and marketdata.app answers without a token
-- for the single symbol `AAPL` and returns "No credentials provided" for
-- everything else. Every other provider requires a key up front.
--
-- **But Discover is an admin route.** `/admin/discover` runs as the
-- authenticated owner, and `integration_settings` already has RLS with no
-- public read policy at all — it is where the Discord webhook lives, for
-- exactly this reason. A key there is readable by the owner's own browser and
-- never enters the bundle, which is the same argument migration 007 made.
--
-- So: the watchlist works with no key, listing what you follow. Quotes appear
-- only if you paste a key. Nothing is ever invented to fill the gap.

ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS market_data_key TEXT;

ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS market_data_provider TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_settings_market_key_len'
  ) THEN
    ALTER TABLE integration_settings
      ADD CONSTRAINT integration_settings_market_key_len
      CHECK (market_data_key IS NULL OR char_length(market_data_key) <= 200);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- The watchlist
-- ----------------------------------------------------------------------------
--
-- Stores *what to ask for*, never what came back — the same rule the rest of
-- Discover follows. Caching a quote means deciding when it goes stale, and a
-- stale quote presented as current is worse than no quote at all.

CREATE TABLE IF NOT EXISTS discover_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- The ticker as the provider spells it. Case is preserved because some
  -- venues are case-sensitive; uniqueness is not, because typing "aapl" twice
  -- should not produce two rows.
  symbol TEXT NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 32),
  name TEXT CHECK (name IS NULL OR char_length(name) <= 200),
  kind TEXT NOT NULL DEFAULT 'stock'
    CHECK (kind IN ('stock', 'etf', 'fund', 'index', 'crypto', 'bond')),
  -- Where it trades, when the symbol alone is ambiguous — SHOP is Shopify on
  -- both the NYSE and the TSX, at different prices in different currencies.
  exchange TEXT CHECK (exchange IS NULL OR char_length(exchange) <= 32),
  currency TEXT CHECK (currency IS NULL OR char_length(currency) = 3),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  display_order INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discover_watchlist_symbol_idx
  ON discover_watchlist(user_id, lower(symbol), coalesce(exchange, ''));

ALTER TABLE discover_watchlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage watchlist" ON discover_watchlist;
CREATE POLICY "Admin manage watchlist" ON discover_watchlist
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
