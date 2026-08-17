-- =============================================================================
-- 002 — Habits: schedules, quantities, quit habits, archiving
-- =============================================================================
--
-- Run once against an existing database, after 001. `db/schema.sql` carries the
-- same definitions so a fresh install arrives here directly.
--
-- Safe to re-run: every statement is guarded. Nothing drops or rewrites
-- existing rows — current habits become daily, quantity-1 "build" habits, which
-- is exactly what they behaved as before, and every existing log gets value 1.
-- =============================================================================


-- ── 1. Habit definition ─────────────────────────────────────────────────────

ALTER TABLE habits
  -- 'build' is a habit you want to do; 'quit' is one you want to avoid, where
  -- a log is a slip rather than a success. They cannot share streak logic, so
  -- the distinction has to be stored rather than inferred from the title.
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'build',

  -- Quantified habits: "8 glasses", "30 minutes". A plain check-in is simply
  -- target_value 1 with no unit, so the binary case stays the default.
  ADD COLUMN IF NOT EXISTS target_value NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS step NUMERIC NOT NULL DEFAULT 1,

  -- Which days the habit is actually due. Without this, `target_per_week`
  -- was a number with no notion of *when*, so "did I miss today?" had no
  -- answer and a Mon/Wed/Fri habit broke its streak every Tuesday.
  ADD COLUMN IF NOT EXISTS schedule TEXT NOT NULL DEFAULT 'daily',
  -- ISO weekday numbers, 1 = Monday … 7 = Sunday. Used when schedule='custom'.
  ADD COLUMN IF NOT EXISTS schedule_days INT[],

  ADD COLUMN IF NOT EXISTS time_of_day TEXT NOT NULL DEFAULT 'anytime',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS display_order INT4 DEFAULT 0,

  -- Archiving keeps the history. `is_active` already existed but nothing in
  -- the UI could set it, so the only way to retire a habit was to delete it
  -- and lose every log.
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_kind_valid;
ALTER TABLE habits ADD CONSTRAINT habits_kind_valid
  CHECK (kind IN ('build', 'quit'));

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_schedule_valid;
ALTER TABLE habits ADD CONSTRAINT habits_schedule_valid
  CHECK (schedule IN ('daily', 'weekdays', 'weekends', 'custom', 'weekly_count'));

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_time_of_day_valid;
ALTER TABLE habits ADD CONSTRAINT habits_time_of_day_valid
  CHECK (time_of_day IN ('anytime', 'morning', 'afternoon', 'evening'));

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_target_value_positive;
ALTER TABLE habits ADD CONSTRAINT habits_target_value_positive
  CHECK (target_value > 0 AND target_value <= 100000);

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_step_positive;
ALTER TABLE habits ADD CONSTRAINT habits_step_positive
  CHECK (step > 0 AND step <= 100000);

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_target_per_week_range;
ALTER TABLE habits ADD CONSTRAINT habits_target_per_week_range
  CHECK (target_per_week IS NULL OR (target_per_week >= 1 AND target_per_week <= 7));

-- A custom schedule with no days selected is due never, which is a habit that
-- can never be completed and whose streak is undefined.
ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_custom_needs_days;
ALTER TABLE habits ADD CONSTRAINT habits_custom_needs_days
  CHECK (schedule <> 'custom' OR (schedule_days IS NOT NULL AND array_length(schedule_days, 1) >= 1));

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_schedule_days_valid;
ALTER TABLE habits ADD CONSTRAINT habits_schedule_days_valid
  CHECK (schedule_days IS NULL OR (
    array_length(schedule_days, 1) <= 7
    AND NOT EXISTS (SELECT 1 FROM unnest(schedule_days) d WHERE d < 1 OR d > 7)
  ));

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_unit_length;
ALTER TABLE habits ADD CONSTRAINT habits_unit_length
  CHECK (unit IS NULL OR length(unit) <= 24);

CREATE INDEX IF NOT EXISTS habits_archived_at_idx ON habits(archived_at);


-- ── 2. Logs carry a quantity ────────────────────────────────────────────────

ALTER TABLE habit_logs
  ADD COLUMN IF NOT EXISTS value NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE habit_logs DROP CONSTRAINT IF EXISTS habit_logs_value_range;
ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_value_range
  CHECK (value >= 0 AND value <= 100000);

ALTER TABLE habit_logs DROP CONSTRAINT IF EXISTS habit_logs_note_length;
ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_note_length
  CHECK (note IS NULL OR length(note) <= 500);

CREATE INDEX IF NOT EXISTS habit_logs_completed_date_idx ON habit_logs(completed_date);


-- ── 3. Backfill ─────────────────────────────────────────────────────────────
-- Existing habits behaved as daily binary "build" habits, which is what the new
-- defaults describe, so only the previously-hidden `is_active = false` rows
-- need anything: they were invisible with no way back, so they become archived.

UPDATE habits SET archived_at = COALESCE(updated_at, created_at, now())
WHERE is_active = false AND archived_at IS NULL;

-- A habit that recorded "3 times a week" keeps that meaning explicitly.
UPDATE habits SET schedule = 'weekly_count'
WHERE schedule = 'daily'
  AND target_per_week IS NOT NULL
  AND target_per_week BETWEEN 1 AND 6;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM habits
)
UPDATE habits SET display_order = ordered.rn
FROM ordered WHERE habits.id = ordered.id AND habits.display_order = 0;


-- ── 4. Setting a value ──────────────────────────────────────────────────────
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

  -- Zero means "not done", which is the absence of a log rather than a log of
  -- nothing — otherwise every untouched day would need a row.
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


-- ── 5. Ordering ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_habit_order(habit_ids UUID[])
RETURNS void AS $$
BEGIN
  FOR i IN 1..array_length(habit_ids, 1) LOOP
    UPDATE habits SET display_order = i
    WHERE id = habit_ids[i] AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
