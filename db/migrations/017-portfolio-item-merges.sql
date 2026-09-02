-- ============================================================================
-- 017 — Real merges on the timeline
-- ============================================================================
--
-- The branching timeline derives everything it draws from dates: two items
-- whose ranges overlap ran at the same time, and that is honest. What it could
-- not draw was a **merge** — "this work fed into that one" — because that is a
-- relationship between two items and nothing in `portfolio_items` recorded one.
--
-- Inferring it from adjacency was considered and rejected: "these ended near
-- each other" is not the same claim as "one became the other", and a graph that
-- invents relationships is worse than one that omits them.
--
-- `merged_into_id` is the smallest column that says it. A single parent, not an
-- array: a branch rejoins one line, and the git analogy the timeline borrows
-- has the *merge commit* carrying multiple parents rather than each branch
-- pointing at several targets.
--
-- Additive and safe to re-run. Every existing row keeps a NULL and the timeline
-- behaves exactly as it does today.

ALTER TABLE portfolio_items
  ADD COLUMN IF NOT EXISTS merged_into_id UUID
    REFERENCES portfolio_items(id) ON DELETE SET NULL;

-- ON DELETE SET NULL, not CASCADE: deleting the thing a branch merged into
-- must not delete the branch. The relationship goes; the history stays.

CREATE INDEX IF NOT EXISTS portfolio_items_merged_into_idx
  ON portfolio_items(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- A merge chain must not loop
-- ----------------------------------------------------------------------------
--
-- A → B → A is expressible and meaningless, and it would make any renderer
-- that walks the chain hang. Enforced in the database rather than the client,
-- the same way task dependencies are: the client can only prevent the cycles
-- it thinks of, and there is more than one way to write this row.
--
-- Not a CHECK constraint — Postgres forbids subqueries in those, which is a
-- trap this schema has already paid for once.
CREATE OR REPLACE FUNCTION public.reject_merge_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cursor_id UUID := NEW.merged_into_id;
  hops INT := 0;
BEGIN
  IF NEW.merged_into_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.merged_into_id = NEW.id THEN
    RAISE EXCEPTION 'An item cannot merge into itself';
  END IF;

  -- Walk to the end of the chain. The hop bound is belt and braces: the walk
  -- terminates on its own for any acyclic chain, and a cycle already present
  -- from before this trigger existed would otherwise spin here forever.
  WHILE cursor_id IS NOT NULL AND hops < 64 LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'That merge would form a loop';
    END IF;

    SELECT merged_into_id INTO cursor_id
      FROM portfolio_items WHERE id = cursor_id;

    hops := hops + 1;
  END LOOP;

  IF hops >= 64 THEN
    RAISE EXCEPTION 'Merge chain is too deep to verify';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_portfolio_merge_cycle ON portfolio_items;
CREATE TRIGGER reject_portfolio_merge_cycle
  BEFORE INSERT OR UPDATE OF merged_into_id ON portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_merge_cycle();
