-- ============================================================================
-- 012 — Discover: saved places and topics
-- ============================================================================
--
-- Guarded and safe to re-run.
--
-- Two small tables behind a module that reads from public APIs. Nothing
-- fetched is stored: the rows here are only *what to ask for* — which places
-- to show weather for, and which subjects to follow. Caching a forecast would
-- mean deciding when it goes stale, and a stale forecast is worse than none.
--
-- Why keyless APIs only, recorded here because it is a schema-shaped decision
-- as much as a client one: this app is a static export with no server. Any API
-- key would have to travel as NEXT_PUBLIC_*, which Next.js compiles into the
-- JavaScript bundle — readable by anyone who opens the page. So the module is
-- built on services that need no key at all (Open-Meteo, Hacker News via
-- Algolia, dev.to, Wikipedia), and a key-based service cannot be added here
-- without a server to hold the key.

-- ── Places ──────────────────────────────────────────────────────────────────
--
-- Two is the interesting number: where you are, and where the people you left
-- behind are. The calendar already carries a home timezone for the same
-- reason.

CREATE TABLE IF NOT EXISTS discover_places (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  label      TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  -- Stored to four decimal places' worth of precision, which is about 11
  -- metres — far more than a forecast resolves to, and enough that the
  -- constraint is about validity rather than accuracy.
  latitude   NUMERIC(8,4) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude  NUMERIC(9,4) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  -- An IANA zone name, so the forecast can be read in the place's own clock
  -- rather than the viewer's.
  timezone   TEXT CHECK (char_length(coalesce(timezone,'')) <= 64),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE discover_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage discover places" ON discover_places;
CREATE POLICY "Admin manage discover places" ON discover_places FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS discover_places_user_idx
  ON discover_places (user_id, sort_order);

-- ── Topics ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discover_topics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- What to search for. Sent verbatim as a query parameter, so it is bounded
  -- here as well as escaped at the call site.
  term       TEXT NOT NULL CHECK (char_length(term) BETWEEN 1 AND 80),
  -- Which service answers for this topic. A CHECK rather than an enum: adding
  -- a source should be a migration, not a type change across two schemas.
  source     TEXT NOT NULL DEFAULT 'hackernews'
             CHECK (source IN ('hackernews', 'devto')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- The same term twice from the same source is two identical panels.
  CONSTRAINT discover_topics_unique UNIQUE (user_id, term, source)
);

ALTER TABLE discover_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage discover topics" ON discover_topics;
CREATE POLICY "Admin manage discover topics" ON discover_topics FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS discover_topics_user_idx
  ON discover_topics (user_id, sort_order);
