-- =============================================================================
-- 004 — Notes: archiving and bounds
-- =============================================================================
--
-- Run once against an existing database. `db/schema.sql` carries the same
-- definitions so a fresh install arrives here directly.
--
-- Safe to re-run and additive: no note is altered or removed.
--
-- Deliberately small. Links between notes are `[[wikilink]]` syntax inside the
-- markdown body, resolved in the client from the notes already loaded, so the
-- graph cannot fall out of step with the text that defines it and there is no
-- join table to keep in sync.
-- =============================================================================

ALTER TABLE notes
  -- Archiving, because deleting was the only way to clear a note out of the
  -- way and a note is the one thing here you cannot reconstruct.
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_title_length;
ALTER TABLE notes ADD CONSTRAINT notes_title_length
  CHECK (title IS NULL OR length(title) <= 200);

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_content_length;
ALTER TABLE notes ADD CONSTRAINT notes_content_length
  CHECK (content IS NULL OR length(content) <= 100000);

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_color_hex;
ALTER TABLE notes ADD CONSTRAINT notes_color_hex
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

CREATE INDEX IF NOT EXISTS notes_archived_at_idx ON notes(archived_at);
CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(updated_at DESC);
