-- =============================================================================
-- RESET HABITS — destructive. Read this before running it.
-- =============================================================================
--
--   THIS DELETES EVERY HABIT AND EVERY DAY YOU HAVE EVER LOGGED.
--
-- It drops `habits` and `habit_logs` and rebuilds them from the current schema,
-- which is the fastest way to start clean but keeps nothing. If you have any
-- history worth having, run `db/migrations/002-habits.sql` instead — that
-- migration is additive, preserves every existing row, and reaches exactly the
-- same shape.
--
-- Nothing else in the database references these two tables, so the CASCADE
-- below cannot reach beyond them.
--
-- Run the whole file at once in the Supabase SQL editor.
-- =============================================================================


-- ── 1. Tear down ────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS habit_logs CASCADE;
DROP TABLE IF EXISTS habits CASCADE;
DROP FUNCTION IF EXISTS set_habit_log(UUID, DATE, NUMERIC);
DROP FUNCTION IF EXISTS update_habit_order(UUID[]);


-- ── 2. Habits ───────────────────────────────────────────────────────────────

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  color TEXT DEFAULT '#0ea5e9',

  -- 'build' is a habit to do; 'quit' is one to avoid, where a log is a slip
  -- rather than a success. The two cannot share streak logic.
  kind TEXT NOT NULL DEFAULT 'build' CHECK (kind IN ('build', 'quit')),

  -- Quantified habits. A plain check-in is target_value 1 with no unit, so the
  -- binary case is simply the default.
  target_value NUMERIC NOT NULL DEFAULT 1 CHECK (target_value > 0 AND target_value <= 100000),
  unit TEXT CHECK (unit IS NULL OR length(unit) <= 24),
  step NUMERIC NOT NULL DEFAULT 1 CHECK (step > 0 AND step <= 100000),

  -- Which days it is actually due. Without this there is no answer to "did I
  -- miss today?", and a Mon/Wed/Fri habit breaks its streak every Tuesday.
  schedule TEXT NOT NULL DEFAULT 'daily'
    CHECK (schedule IN ('daily', 'weekdays', 'weekends', 'custom', 'weekly_count')),
  schedule_days INT[],  -- ISO weekdays, 1 = Monday … 7 = Sunday
  target_per_week INT DEFAULT 7
    CHECK (target_per_week IS NULL OR (target_per_week >= 1 AND target_per_week <= 7)),

  time_of_day TEXT NOT NULL DEFAULT 'anytime'
    CHECK (time_of_day IN ('anytime', 'morning', 'afternoon', 'evening')),
  category TEXT,
  notes TEXT,
  display_order INT4 DEFAULT 0,

  is_active BOOLEAN DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- A custom schedule with no days is due never, which makes the habit
  -- impossible to complete and its streak undefined.
  CONSTRAINT habits_custom_needs_days
    CHECK (schedule <> 'custom' OR (schedule_days IS NOT NULL AND array_length(schedule_days, 1) >= 1)),
  CONSTRAINT habits_schedule_days_valid
    CHECK (schedule_days IS NULL OR (
      array_length(schedule_days, 1) <= 7
      -- `<@` rather than a subquery: CHECK constraints cannot contain one,
      -- and Postgres rejects the whole statement if they do.
      AND schedule_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
    ))
);

CREATE INDEX habits_archived_at_idx ON habits(archived_at);

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage habits" ON habits;
CREATE POLICY "Admin manage habits" ON habits FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

DROP TRIGGER IF EXISTS update_habits_updated_at ON habits;
CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3. Logs ─────────────────────────────────────────────────────────────────

CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  -- How much was done. An absent row means "not done"; a zero-value row would
  -- mean every untouched day needed one.
  value NUMERIC NOT NULL DEFAULT 1 CHECK (value >= 0 AND value <= 100000),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (habit_id, completed_date)
);

CREATE INDEX habit_logs_completed_date_idx ON habit_logs(completed_date);

-- No user_id column: ownership is derived from the parent habit, so there is
-- no second copy of it to fall out of step.
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage habit logs" ON habit_logs;
CREATE POLICY "Admin manage habit logs" ON habit_logs FOR ALL USING (
  public.is_aal2()
  AND EXISTS (SELECT 1 FROM habits WHERE id = habit_logs.habit_id AND user_id = auth.uid())
);


-- ── 4. Functions ────────────────────────────────────────────────────────────

-- One round trip, and idempotent: incrementing a quantified habit from the
-- today view fires once per tap, and a select-then-insert would double-count
-- two taps that race.
CREATE OR REPLACE FUNCTION set_habit_log(
  target_habit_id UUID,
  target_date DATE,
  new_value NUMERIC
)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM habits WHERE id = target_habit_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Habit not found';
  END IF;

  IF new_value IS NULL OR new_value <= 0 THEN
    DELETE FROM habit_logs
    WHERE habit_id = target_habit_id AND completed_date = target_date;
    RETURN;
  END IF;

  INSERT INTO habit_logs (habit_id, completed_date, value)
  VALUES (target_habit_id, target_date, LEAST(new_value, 100000))
  ON CONFLICT (habit_id, completed_date)
  DO UPDATE SET value = LEAST(EXCLUDED.value, 100000);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION update_habit_order(habit_ids UUID[])
RETURNS void AS $$
BEGIN
  FOR i IN 1..array_length(habit_ids, 1) LOOP
    UPDATE habits SET display_order = i
    WHERE id = habit_ids[i] AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;


-- ── 5. Starter habits ───────────────────────────────────────────────────────
--
-- `user_id` is set explicitly rather than left to its `auth.uid()` default:
-- the SQL editor runs as the service role, where auth.uid() is NULL, and rows
-- owned by nobody are invisible to the app and to RLS. The first row in
-- auth.users is the admin — the same rule `is_admin()` uses.
--
-- Delete this section if you would rather start with nothing.

INSERT INTO habits
  (user_id, title, color, kind, target_value, unit, step, schedule, schedule_days, target_per_week, time_of_day, category, display_order)
SELECT
  u.id, v.title, v.color, v.kind, v.target_value, v.unit, v.step,
  v.schedule, v.schedule_days, v.target_per_week, v.time_of_day, v.category, v.display_order
FROM (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) u
CROSS JOIN (VALUES
  -- A plain daily check-in.
  ('Morning walk',      '#10b981', 'build', 1,  NULL,      1, 'daily',        NULL::INT[],   7, 'morning',   'Health',   1),
  -- Quantified: counts up, one tap at a time.
  ('Drink water',       '#0ea5e9', 'build', 8,  'glasses', 1, 'daily',        NULL,          7, 'anytime',   'Health',   2),
  ('Read',              '#8b5cf6', 'build', 30, 'minutes', 10,'daily',        NULL,          7, 'evening',   'Learning', 3),
  -- Only on the days it actually applies, so the other days are not misses.
  ('Strength training', '#ef4444', 'build', 1,  NULL,      1, 'custom',       ARRAY[1,3,5],  7, 'morning',   'Fitness',  4),
  ('Inbox zero',        '#f59e0b', 'build', 1,  NULL,      1, 'weekdays',     NULL,          7, 'afternoon', 'Work',     5),
  -- Names a quantity, not days: any day counts toward the weekly total.
  ('Call a friend',     '#ec4899', 'build', 1,  NULL,      1, 'weekly_count', NULL,          2, 'anytime',   'Social',   6),
  -- Kept by doing nothing; logging a day records a slip.
  ('No late-night snacking', '#64748b', 'quit', 1, NULL,   1, 'daily',        NULL,          7, 'evening',   'Health',   7)
) AS v(title, color, kind, target_value, unit, step, schedule, schedule_days, target_per_week, time_of_day, category, display_order);


-- ── 6. Check ────────────────────────────────────────────────────────────────
-- Expect 7 habits and an owner that is not null. A null owner means step 5 ran
-- before any user existed — delete the rows, sign in, and run step 5 again.

SELECT count(*) AS habits, count(user_id) AS with_owner FROM habits;
