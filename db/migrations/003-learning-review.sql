-- =============================================================================
-- 003 — Learning: spaced review, sessions that log themselves, archiving
-- =============================================================================
--
-- Run once against an existing database. `db/schema.sql` carries the same
-- definitions so a fresh install arrives here directly.
--
-- Safe to re-run: every statement is guarded. Nothing drops or rewrites
-- existing rows — every topic keeps its title, status, notes and resources, and
-- enters the review schedule as if it had never been reviewed, which is true.
--
-- Why this exists
-- ---------------
-- The module recorded what you *filed* and how long you *sat there*. Neither is
-- learning. A topic marked "Mastered" was never brought back, so everything
-- learned decayed silently and the tool never mentioned it; and "confidence"
-- was a number you assigned yourself, which is both unreliable and one more
-- form to fill in.
--
-- Reviews replace both. Rating your recall after a session schedules the next
-- one, so the tool answers "what should I study today?" instead of asking you.
-- =============================================================================


-- ── 1. Review state on a topic ──────────────────────────────────────────────

ALTER TABLE learning_topics
  -- SM-2 style. `ease` is how well this topic sticks for you; the interval
  -- grows by it on each success and collapses on a lapse.
  ADD COLUMN IF NOT EXISTS ease NUMERIC NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS interval_days INT NOT NULL DEFAULT 0,
  -- NULL means "never reviewed" — the topic is new, not overdue. The
  -- difference matters: overdue reads as debt, new reads as an invitation.
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapses INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_order INT4 DEFAULT 0;

ALTER TABLE learning_topics DROP CONSTRAINT IF EXISTS learning_topics_ease_range;
ALTER TABLE learning_topics ADD CONSTRAINT learning_topics_ease_range
  CHECK (ease >= 1.3 AND ease <= 3.5);

ALTER TABLE learning_topics DROP CONSTRAINT IF EXISTS learning_topics_interval_range;
ALTER TABLE learning_topics ADD CONSTRAINT learning_topics_interval_range
  CHECK (interval_days >= 0 AND interval_days <= 3650);

ALTER TABLE learning_topics DROP CONSTRAINT IF EXISTS learning_topics_counts_nonneg;
ALTER TABLE learning_topics ADD CONSTRAINT learning_topics_counts_nonneg
  CHECK (review_count >= 0 AND lapses >= 0);

CREATE INDEX IF NOT EXISTS learning_topics_due_date_idx ON learning_topics(due_date);
CREATE INDEX IF NOT EXISTS learning_topics_archived_at_idx ON learning_topics(archived_at);


-- ── 2. Review history ───────────────────────────────────────────────────────
-- Kept separately from the topic's current state so the schedule can be
-- recomputed and so "am I actually retaining this?" is answerable.

CREATE TABLE IF NOT EXISTS learning_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  topic_id UUID NOT NULL REFERENCES learning_topics(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  interval_before INT,
  interval_after INT,
  ease_after NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE learning_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage learning reviews" ON learning_reviews;
CREATE POLICY "Admin manage learning reviews" ON learning_reviews FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS learning_reviews_topic_id_idx ON learning_reviews(topic_id);
CREATE INDEX IF NOT EXISTS learning_reviews_reviewed_at_idx ON learning_reviews(reviewed_at);


-- ── 3. Subjects ─────────────────────────────────────────────────────────────

ALTER TABLE learning_subjects
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_order INT4 DEFAULT 0,
  -- A weekly floor, not a daily one. A daily target turns one missed day into
  -- a failure; a weekly one absorbs an ordinary bad Tuesday.
  ADD COLUMN IF NOT EXISTS target_minutes_per_week INT;

ALTER TABLE learning_subjects DROP CONSTRAINT IF EXISTS learning_subjects_color_hex;
ALTER TABLE learning_subjects ADD CONSTRAINT learning_subjects_color_hex
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE learning_subjects DROP CONSTRAINT IF EXISTS learning_subjects_weekly_target_range;
ALTER TABLE learning_subjects ADD CONSTRAINT learning_subjects_weekly_target_range
  CHECK (target_minutes_per_week IS NULL OR (target_minutes_per_week >= 5 AND target_minutes_per_week <= 10080));


-- ── 4. Sessions ─────────────────────────────────────────────────────────────

ALTER TABLE learning_sessions
  ADD COLUMN IF NOT EXISTS ended_early BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE learning_sessions DROP CONSTRAINT IF EXISTS learning_sessions_duration_range;
ALTER TABLE learning_sessions ADD CONSTRAINT learning_sessions_duration_range
  CHECK (duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440));

CREATE INDEX IF NOT EXISTS learning_sessions_topic_id_idx ON learning_sessions(topic_id);
CREATE INDEX IF NOT EXISTS learning_sessions_start_time_idx ON learning_sessions(start_time);


-- ── 5. Backfill ─────────────────────────────────────────────────────────────
-- Topics enter the schedule as new rather than overdue. A tool that greets you
-- with a hundred overdue items on day one is one you close again.

UPDATE learning_topics SET due_date = NULL WHERE due_date IS NULL;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY subject_id ORDER BY created_at) AS rn
  FROM learning_topics
)
UPDATE learning_topics SET display_order = ordered.rn
FROM ordered WHERE learning_topics.id = ordered.id AND learning_topics.display_order = 0;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM learning_subjects
)
UPDATE learning_subjects SET display_order = ordered.rn
FROM ordered WHERE learning_subjects.id = ordered.id AND learning_subjects.display_order = 0;


-- ── 6. Recording a review ───────────────────────────────────────────────────
-- The schedule is computed here so a review and the topic state it produces
-- can never disagree — the client sends a rating, not an interval.

CREATE OR REPLACE FUNCTION record_learning_review(
  target_topic_id UUID,
  new_rating TEXT
)
RETURNS learning_topics AS $$
DECLARE
  t learning_topics;
  next_ease NUMERIC;
  next_interval INT;
  next_lapses INT;
BEGIN
  SELECT * INTO t FROM learning_topics
  WHERE id = target_topic_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found'; END IF;

  next_ease := t.ease;
  next_lapses := t.lapses;

  IF new_rating = 'again' THEN
    -- Back to tomorrow, and the topic is marked as harder than assumed.
    next_ease := GREATEST(1.3, t.ease - 0.2);
    next_interval := 1;
    next_lapses := t.lapses + 1;
  ELSIF new_rating = 'hard' THEN
    next_ease := GREATEST(1.3, t.ease - 0.15);
    next_interval := GREATEST(1, CEIL(GREATEST(t.interval_days, 1) * 1.2)::INT);
  ELSIF new_rating = 'good' THEN
    next_interval := CASE
      WHEN t.interval_days = 0 THEN 1
      WHEN t.interval_days = 1 THEN 3
      ELSE CEIL(t.interval_days * t.ease)::INT
    END;
  ELSIF new_rating = 'easy' THEN
    next_ease := LEAST(3.5, t.ease + 0.15);
    next_interval := CASE
      WHEN t.interval_days = 0 THEN 4
      ELSE CEIL(GREATEST(t.interval_days, 1) * t.ease * 1.3)::INT
    END;
  ELSE
    RAISE EXCEPTION 'Unknown rating %', new_rating;
  END IF;

  next_interval := LEAST(next_interval, 3650);

  INSERT INTO learning_reviews
    (topic_id, rating, interval_before, interval_after, ease_after)
  VALUES
    (target_topic_id, new_rating, t.interval_days, next_interval, next_ease);

  UPDATE learning_topics SET
    ease = next_ease,
    interval_days = next_interval,
    lapses = next_lapses,
    review_count = t.review_count + 1,
    last_reviewed_at = now(),
    due_date = (CURRENT_DATE + next_interval)::DATE
  WHERE id = target_topic_id
  RETURNING * INTO t;

  RETURN t;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
