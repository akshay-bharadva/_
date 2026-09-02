-- ============================================================================
-- 013 — `notes.updated_at` should mean "the content changed"
-- ============================================================================
--
-- `update_updated_at_column()` fires BEFORE UPDATE FOR EACH ROW, so it rewrites
-- `updated_at` on *any* write — including a pin toggle. Two consequences the
-- owner noticed:
--
--   1. A note pinned a moment ago reports "modified a minute ago", which is
--      true of the row and false about the note. The one thing that timestamp
--      is read for is "when did I last change what this says".
--   2. `notes_updated_at_idx` is DESC and the list sorts by it, so pinning a
--      note silently jumped it to the top of "recently modified" as well.
--
-- The fix is to leave the timestamp alone when the only difference between the
-- old and new row is organisational. Written as a JSONB difference rather than
-- a list of `IS DISTINCT FROM` comparisons so that adding a column to `notes`
-- later cannot silently opt it out of touching the timestamp — a new column is
-- content until this file says otherwise.
--
-- Additive and safe to re-run.

CREATE OR REPLACE FUNCTION public.touch_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Fields that describe how a note is filed, not what it says.
  organisational TEXT[] := ARRAY['is_pinned', 'display_order', 'updated_at'];
BEGIN
  IF (to_jsonb(NEW) - organisational)
     IS NOT DISTINCT FROM (to_jsonb(OLD) - organisational) THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notes_updated_at();
