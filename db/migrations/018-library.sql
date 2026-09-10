-- ============================================================================
-- 018 — Library: what you read and watch, and the lines worth keeping
-- ============================================================================
--
-- Two tables, because a reading list and a commonplace book are one thing seen
-- from two ends. A **source** is the book, article, video or podcast, with a
-- status — want, in progress, done — which is the reading list. A
-- **highlight** is a line from it, with where in it (a page, a timestamp) and
-- why it mattered. One book holds forty highlights without the author being
-- typed forty times.
--
-- ## The public boundary
--
-- This is the first time anything from the Personal OS is shown to visitors,
-- so the boundary is in the database rather than in a UI toggle:
--
--   * Neither table has a public read policy. A visitor cannot select from
--     either, whatever the client asks.
--   * One SECURITY DEFINER function returns **one** public highlight, chosen at
--     random, with only the columns a citation needs. Ratings, notes, statuses
--     and every private highlight never leave the database.
--   * The random pick happens here, so the collection is never shipped to a
--     browser to be sampled there.
--
-- Every highlight starts private (`is_public` defaults to false). Publishing is
-- a per-line decision.
--
-- Additive and safe to re-run.

-- ----------------------------------------------------------------------------
-- Sources
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS library_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- CHECK rather than an enum: adding a kind should be a migration, not a type
  -- change across two schemas. Same reasoning as `discover_topics.source`.
  kind TEXT NOT NULL DEFAULT 'book'
    CHECK (kind IN ('book', 'article', 'video', 'podcast', 'other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- Author, channel or host. One column for all of them: the reader asks
  -- "who made this", and splitting it by kind would be three nullable columns
  -- answering the same question.
  creator TEXT CHECK (creator IS NULL OR char_length(creator) <= 200),
  url TEXT CHECK (url IS NULL OR char_length(url) <= 2048),
  status TEXT NOT NULL DEFAULT 'want'
    CHECK (status IN ('want', 'in_progress', 'done', 'abandoned')),
  rating INT2 CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  started_on DATE,
  finished_on DATE,
  -- Finishing before starting is a typo, and it would make any "how long did
  -- this take" figure negative.
  CONSTRAINT library_sources_dates_ordered
    CHECK (finished_on IS NULL OR started_on IS NULL OR finished_on >= started_on),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_sources_status_idx
  ON library_sources (user_id, status, updated_at DESC);

ALTER TABLE library_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage library sources" ON library_sources;
CREATE POLICY "Admin manage library sources" ON library_sources FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

DROP TRIGGER IF EXISTS update_library_sources_updated_at ON library_sources;
CREATE TRIGGER update_library_sources_updated_at
  BEFORE UPDATE ON library_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Highlights
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS library_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- ON DELETE SET NULL, not CASCADE: deleting a source must not take the
  -- lines you kept from it. The admin names how many will lose their source
  -- before it lets you delete one.
  source_id UUID REFERENCES library_sources(id) ON DELETE SET NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  -- For a line with no source record — something heard once, or a quote you
  -- only know the speaker of.
  attribution TEXT CHECK (attribution IS NULL OR char_length(attribution) <= 200),
  -- "p. 42", "ch. 3", "12:34". Free text because a Kindle location, a page
  -- and a timestamp are all legitimate and none of them is a number.
  location TEXT CHECK (location IS NULL OR char_length(location) <= 50),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_highlights_source_idx
  ON library_highlights (source_id);

-- Matches the one query a visitor can cause, and is tiny because most rows are
-- private.
CREATE INDEX IF NOT EXISTS library_highlights_public_idx
  ON library_highlights (id)
  WHERE is_public;

ALTER TABLE library_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage library highlights" ON library_highlights;
CREATE POLICY "Admin manage library highlights" ON library_highlights FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

DROP TRIGGER IF EXISTS update_library_highlights_updated_at ON library_highlights;
CREATE TRIGGER update_library_highlights_updated_at
  BEFORE UPDATE ON library_highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- The one thing a visitor can read
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER because visitors have no policy on either table. It is
-- listed in `db-security.test.ts` as deliberately not requiring AAL2 — a
-- signed-out visitor is the intended caller — and it is safe to expose for the
-- same reason: it returns only rows the owner marked public, and only the
-- columns a citation needs.
--
-- VOLATILE because of random(): each call must make its own pick, and a
-- STABLE declaration would license the planner to reuse one answer.
CREATE OR REPLACE FUNCTION public.get_random_public_highlight()
RETURNS TABLE (
  id UUID,
  text TEXT,
  attribution TEXT,
  location TEXT,
  source_title TEXT,
  source_creator TEXT,
  source_kind TEXT,
  source_url TEXT
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.id, h.text, h.attribution, h.location,
         s.title, s.creator, s.kind, s.url
    FROM library_highlights h
    LEFT JOIN library_sources s ON s.id = h.source_id
   WHERE h.is_public
   ORDER BY random()
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_random_public_highlight() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_random_public_highlight() TO anon, authenticated;
