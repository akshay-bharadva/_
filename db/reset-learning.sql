-- =============================================================================
-- RESET LEARNING — destructive. Read this before running it.
-- =============================================================================
--
--   THIS DELETES EVERY MODULE, TOPIC, NOTE, SESSION AND REVIEW.
--
-- It drops the four learning tables and rebuilds them from the current schema.
-- If your notes are worth anything, run `db/migrations/003-learning-review.sql`
-- instead — it is additive, keeps every row, and reaches the same shape.
--
-- Nothing outside these tables references them, so the CASCADE cannot reach
-- further. Run the whole file at once in the Supabase SQL editor.
-- =============================================================================


-- ── 1. Tear down ────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS learning_reviews CASCADE;
DROP TABLE IF EXISTS learning_sessions CASCADE;
DROP TABLE IF EXISTS learning_topics CASCADE;
DROP TABLE IF EXISTS learning_subjects CASCADE;
DROP FUNCTION IF EXISTS record_learning_review(UUID, TEXT);


-- ── 2. Modules ──────────────────────────────────────────────────────────────
-- Optional grouping. A topic works perfectly well without one — requiring a
-- syllabus before you can study anything is what made this feel like homework
-- about homework.

CREATE TABLE learning_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Weekly, not daily: a daily target turns one bad Tuesday into a failure.
  target_minutes_per_week INT
    CHECK (target_minutes_per_week IS NULL OR (target_minutes_per_week >= 5 AND target_minutes_per_week <= 10080)),
  archived_at TIMESTAMPTZ,
  display_order INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE learning_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage subjects" ON learning_subjects;
CREATE POLICY "Admin manage subjects" ON learning_subjects FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_learning_subjects_updated_at ON learning_subjects;
CREATE TRIGGER update_learning_subjects_updated_at BEFORE UPDATE ON learning_subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3. Topics ───────────────────────────────────────────────────────────────

CREATE TABLE learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject_id UUID REFERENCES learning_subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status learning_status DEFAULT 'To Learn',
  core_notes TEXT,
  resources JSONB,
  confidence_score INT2 CHECK (confidence_score BETWEEN 1 AND 5),

  -- Spaced review. `due_date` NULL means never reviewed — the topic is new,
  -- not overdue. That distinction is what keeps the queue from reading as debt.
  ease NUMERIC NOT NULL DEFAULT 2.5 CHECK (ease >= 1.3 AND ease <= 3.5),
  interval_days INT NOT NULL DEFAULT 0 CHECK (interval_days >= 0 AND interval_days <= 3650),
  due_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  review_count INT NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  lapses INT NOT NULL DEFAULT 0 CHECK (lapses >= 0),

  archived_at TIMESTAMPTZ,
  display_order INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX learning_topics_due_date_idx ON learning_topics(due_date);
CREATE INDEX learning_topics_archived_at_idx ON learning_topics(archived_at);

ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage topics" ON learning_topics;
CREATE POLICY "Admin manage topics" ON learning_topics FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_learning_topics_updated_at ON learning_topics;
CREATE TRIGGER update_learning_topics_updated_at BEFORE UPDATE ON learning_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 4. Sessions ─────────────────────────────────────────────────────────────

CREATE TABLE learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  topic_id UUID NOT NULL REFERENCES learning_topics(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INT CHECK (duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440)),
  journal_notes TEXT,
  ended_early BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX learning_sessions_topic_id_idx ON learning_sessions(topic_id);
CREATE INDEX learning_sessions_start_time_idx ON learning_sessions(start_time);

ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage sessions" ON learning_sessions;
CREATE POLICY "Admin manage sessions" ON learning_sessions FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 5. Reviews ──────────────────────────────────────────────────────────────
-- Kept apart from the topic's current state so the schedule can be recomputed
-- and so "am I actually retaining this?" is answerable.

CREATE TABLE learning_reviews (
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
CREATE INDEX learning_reviews_topic_id_idx ON learning_reviews(topic_id);
CREATE INDEX learning_reviews_reviewed_at_idx ON learning_reviews(reviewed_at);

ALTER TABLE learning_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage learning reviews" ON learning_reviews;
CREATE POLICY "Admin manage learning reviews" ON learning_reviews FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 6. Recording a review ───────────────────────────────────────────────────
-- The schedule is computed here so a review and the topic state it produces
-- can never disagree: the client sends a rating, never an interval.

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


-- ── 7. A starting point ─────────────────────────────────────────────────────
--
-- Deliberately small. The failure mode of this module was an evening of
-- enthusiastic curriculum-building followed by never opening it again, so this
-- seeds one module and five topics — enough to see the review loop work, few
-- enough that tomorrow's queue is not a wall.
--
-- `user_id` is set explicitly: the SQL editor runs as the service role, where
-- auth.uid() is NULL, and rows owned by nobody are invisible to the app and to
-- RLS. The first row in auth.users is the admin, the same rule is_admin() uses.
--
-- Every topic starts unreviewed, so they arrive as "new" rather than overdue.
--
-- Delete this section if you would rather start empty.

INSERT INTO learning_subjects (user_id, name, description, color, display_order)
SELECT u.id, 'Getting started', 'Delete this once you have your own.', '#8b5cf6', 1
FROM (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) u;

INSERT INTO learning_topics (user_id, subject_id, title, core_notes, display_order)
SELECT
  s.user_id, s.id, v.title, v.core_notes, v.display_order
FROM learning_subjects s
CROSS JOIN (VALUES
  (
    'How this works',
    E'You rate how well you recalled something. That rating sets when you see it next — nothing else.\n\n- **Again** brings it back tomorrow\n- **Good** pushes it out by roughly the interval times your ease\n- **Easy** pushes it out further\n\nThere is no score and no streak to break.',
    1
  ),
  (
    'Why recall before reading',
    E'Re-reading notes feels productive because recognition feels like knowing. It is not.\n\nTrying to retrieve something — and failing — is what makes it stick. That is why the notes stay hidden until you have had a go.',
    2
  ),
  (
    'Why the queue is capped',
    E'Twenty items a day, five of them new.\n\nA backlog you cannot see the end of is a backlog you do not start. Anything held back is not lost — it simply comes up over the following days.',
    3
  ),
  (
    'Add your own topics',
    E'One thing you want to remember. Not a syllabus.\n\nNotes can come later — a topic with a title and nothing else still enters the schedule.',
    4
  ),
  (
    'What the numbers mean',
    E'**Recall rate** is reviews you remembered over reviews you attempted. It is the only number worth watching.\n\nHours studied is not tracked as a goal, because time spent rewards sitting still rather than remembering.',
    5
  )
) AS v(title, core_notes, display_order)
WHERE s.name = 'Getting started';


-- ── 8. Check ────────────────────────────────────────────────────────────────
-- Expect 5 topics with a non-null owner. A null owner means this ran before any
-- user existed — delete the rows, sign in, then run section 7 again.

SELECT
  (SELECT count(*) FROM learning_subjects) AS modules,
  (SELECT count(*) FROM learning_topics) AS topics,
  (SELECT count(user_id) FROM learning_topics) AS with_owner;
