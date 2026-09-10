-- 019: let a CMS section hide its title on the public page.
--
-- Some layouts carry their own heading (a random highlight, a hero-like
-- feature row), and a section title above them reads as a label on a label.
-- Hidden titles stay in the markup as screen-reader-only text, so the section
-- keeps its accessible name.
--
-- Additive and guarded: defaults to true, so every existing section renders
-- exactly as before. Mirrored in db/schema.sql.

ALTER TABLE portfolio_sections
  ADD COLUMN IF NOT EXISTS show_title BOOLEAN NOT NULL DEFAULT true;
