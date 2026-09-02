-- ============================================================================
-- 015 — Not everything you learn is a flashcard
-- ============================================================================
--
-- A `learning_topics` row was one shape: a title you try to recall, and notes
-- revealed afterwards. That is a good shape for facts and the wrong one for
-- most of what studying actually involves — an explanation you need to *read*
-- before you can be asked anything, and a question with a right answer you can
-- be marked against.
--
-- Three kinds, which is the smallest set that makes the whole loop possible:
--
--   reference — material you read. Never enters the recall queue; being asked
--               to "recall" a page of explanation is what made the module feel
--               like it only did flashcards.
--   recall    — the existing behaviour, and the default, so every row that
--               exists today keeps working exactly as it does now.
--   quiz      — an explicit question with an answer, optionally multiple
--               choice, which is what certification practice needs: self-rating
--               how well you remembered is not the same as being marked.
--
-- `prompt` is separate from `title` on purpose. A title is a label you scan in
-- a list ("TCP handshake"); a prompt is the question you are actually asked
-- ("What are the three messages of a TCP handshake, in order?"). Overloading
-- one field means the list becomes unreadable or the question becomes vague.
--
-- Additive, defaulted, and safe to re-run: no existing row changes behaviour.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'learning_material_kind') THEN
    CREATE TYPE learning_material_kind AS ENUM ('reference', 'recall', 'quiz');
  END IF;
END $$;

ALTER TABLE learning_topics
  ADD COLUMN IF NOT EXISTS kind learning_material_kind NOT NULL DEFAULT 'recall';

ALTER TABLE learning_topics
  ADD COLUMN IF NOT EXISTS prompt TEXT;

ALTER TABLE learning_topics
  ADD COLUMN IF NOT EXISTS answer TEXT;

-- Multiple choice, when there is any. An array of strings; the correct one is
-- `answer`, matched by value rather than by index, because reordering the
-- options in the editor must not silently change which one is right.
ALTER TABLE learning_topics
  ADD COLUMN IF NOT EXISTS choices JSONB;

DO $$
BEGIN
  -- Bounds mirror the Zod schema, so a value the form accepts cannot be one
  -- Postgres rejects — which surfaces as an opaque save failure.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'learning_topics_prompt_len'
  ) THEN
    ALTER TABLE learning_topics
      ADD CONSTRAINT learning_topics_prompt_len
      CHECK (prompt IS NULL OR char_length(prompt) <= 2000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'learning_topics_answer_len'
  ) THEN
    ALTER TABLE learning_topics
      ADD CONSTRAINT learning_topics_answer_len
      CHECK (answer IS NULL OR char_length(answer) <= 2000);
  END IF;
END $$;

-- Reference material never becomes due, so it never appears in the queue and
-- never counts as overdue. The partial index matches the query that reads it.
CREATE INDEX IF NOT EXISTS learning_topics_reviewable_idx
  ON learning_topics(due_date)
  WHERE kind <> 'reference' AND archived_at IS NULL;
