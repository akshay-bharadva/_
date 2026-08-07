-- =============================================================================
-- 006 — Make lockdown level 2 actually block writes
-- =============================================================================
--
--   READ THIS BEFORE RUNNING IT.
--
-- Until now `lockdown_level` appeared in the schema exactly twice: the column
-- definition and a seed row. No policy referenced it. Level 2 was labelled
-- "API Read-Only. No edits allowed." and blocked nothing — the owner could set
-- it believing writes were refused while every write still succeeded.
--
-- This migration makes the claim true. Admin write policies gain
-- `AND NOT public.writes_locked()`, so at level 2 or above the database itself
-- refuses inserts, updates and deletes.
--
-- WHAT IT DOES NOT TOUCH, ON PURPOSE
-- ----------------------------------
-- `security_settings` keeps an unconditional admin policy. Lockdown must never
-- be able to trap you inside it: if the switch that lifts lockdown were itself
-- blocked by lockdown, level 2 would be permanent and only a service-role SQL
-- session could undo it.
--
-- Reads are untouched. Level 2 is read-only, not offline — the admin UI still
-- loads, it simply cannot save.
--
-- IF SOMETHING GOES WRONG
-- -----------------------
-- Lower the level directly from the SQL editor, which runs as the service role
-- and bypasses RLS entirely:
--
--     UPDATE security_settings SET lockdown_level = 0 WHERE id = 1;
--
-- To remove the enforcement altogether, re-run `db/schema.sql`, which recreates
-- every policy without the lockdown clause.
--
-- Safe to re-run.
-- =============================================================================


-- ── 1. The predicate ────────────────────────────────────────────────────────
--
-- SECURITY DEFINER so the check itself is not subject to the policies it is
-- used by, and STABLE so Postgres evaluates it once per statement rather than
-- once per row.

CREATE OR REPLACE FUNCTION public.writes_locked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT lockdown_level FROM security_settings WHERE id = 1),
    0
  ) >= 2;
$$;

COMMENT ON FUNCTION public.writes_locked() IS
  'True when security_settings.lockdown_level >= 2. Used by admin write policies so the kill-switch is enforced by the database rather than only described in the UI.';


-- ── 2. Admin-owned tables ───────────────────────────────────────────────────
--
-- Each of these is `FOR ALL USING (owner AND aal2)`. Splitting them keeps SELECT
-- permissive and adds the lockdown clause to the write half only, so a locked
-- down admin can still read everything.

DO $$
DECLARE
  t TEXT;
  owned TEXT[] := ARRAY[
    'tasks', 'sub_tasks', 'task_projects', 'task_dependencies',
    'notes', 'whiteboards', 'habits', 'inventory_items',
    'learning_subjects', 'learning_topics', 'learning_sessions',
    'learning_reviews', 'transactions', 'recurring_transactions',
    'goals', 'events', 'storage_assets', 'public_notes', 'focus_logs'
  ];
BEGIN
  FOREACH t IN ARRAY owned LOOP
    -- Skip anything this database does not have, so the migration does not
    -- depend on every earlier one having been applied.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Admin read ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Admin write ' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() = user_id AND public.is_aal2())',
      'Admin read ' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id AND public.is_aal2() AND NOT public.writes_locked()) WITH CHECK (auth.uid() = user_id AND public.is_aal2() AND NOT public.writes_locked())',
      'Admin write ' || t, t
    );
  END LOOP;
END $$;


-- ── 3. Publicly readable, admin writable ────────────────────────────────────
-- These already have a separate public SELECT policy, so only the admin policy
-- needs the clause.

DO $$
DECLARE
  t TEXT;
  shared TEXT[] := ARRAY[
    'portfolio_sections', 'portfolio_items', 'blog_posts',
    'navigation_links', 'site_identity'
  ];
BEGIN
  FOREACH t IN ARRAY shared LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Admin write ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (public.is_admin() AND NOT public.writes_locked()) WITH CHECK (public.is_admin() AND NOT public.writes_locked())',
      'Admin write ' || t, t
    );
  END LOOP;
END $$;


-- ── 4. habit_logs ───────────────────────────────────────────────────────────
-- Ownership comes from the parent habit rather than a user_id of its own.

DROP POLICY IF EXISTS "Admin read habit logs" ON habit_logs;
CREATE POLICY "Admin read habit logs" ON habit_logs FOR SELECT USING (
  public.is_aal2()
  AND EXISTS (SELECT 1 FROM habits WHERE id = habit_logs.habit_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Admin manage habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Admin write habit logs" ON habit_logs;
CREATE POLICY "Admin write habit logs" ON habit_logs FOR ALL USING (
  public.is_aal2()
  AND NOT public.writes_locked()
  AND EXISTS (SELECT 1 FROM habits WHERE id = habit_logs.habit_id AND user_id = auth.uid())
) WITH CHECK (
  public.is_aal2()
  AND NOT public.writes_locked()
  AND EXISTS (SELECT 1 FROM habits WHERE id = habit_logs.habit_id AND user_id = auth.uid())
);


-- ── 5. Check ────────────────────────────────────────────────────────────────
-- Expect `false` while the level is below 2, and the security_settings policy
-- to have no lockdown clause — that is the escape hatch.

SELECT
  public.writes_locked() AS writes_currently_locked,
  (SELECT lockdown_level FROM security_settings WHERE id = 1) AS level;
