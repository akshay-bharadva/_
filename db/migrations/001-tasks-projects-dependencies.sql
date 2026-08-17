-- =============================================================================
-- 001 — Tasks: projects, scheduling, time, recurrence, dependencies
-- =============================================================================
--
-- Run once against an existing database. `db/schema.sql` carries the same
-- definitions so a fresh install arrives here directly.
--
-- Safe to re-run: every statement is guarded (IF NOT EXISTS / DROP ... IF
-- EXISTS), and nothing drops or rewrites existing task rows. Existing tasks
-- keep their title, status, priority and due date, and land in no project.
--
-- One ordering constraint: `ALTER TYPE ... ADD VALUE` cannot be used in the
-- same transaction that adds it, so the enum change is first and this file
-- must be run as a whole rather than statement-by-statement inside an
-- explicit BEGIN/COMMIT you manage yourself.
-- =============================================================================


-- ── 1. Status vocabulary ────────────────────────────────────────────────────
-- 'review' is a real state the owner sets. 'blocked' is deliberately NOT a
-- status: it is derived from unmet dependencies, so storing it by hand would
-- let the stored value disagree with the dependency graph.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'review' AFTER 'inprogress';


-- ── 2. Projects ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 120),
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  display_order INT4 DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE task_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage task projects" ON task_projects;
CREATE POLICY "Admin manage task projects" ON task_projects FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_task_projects_updated_at ON task_projects;
CREATE TRIGGER update_task_projects_updated_at BEFORE UPDATE ON task_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3. Task columns ─────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES task_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS display_order INT4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimate_minutes INT4,
  ADD COLUMN IF NOT EXISTS tracked_minutes INT4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurrence TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_interval INT4,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Bounds. The Zod schemas mirror these exactly; a value the form accepts and
-- Postgres rejects surfaces as an opaque write failure.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_dates_ordered;
ALTER TABLE tasks ADD CONSTRAINT tasks_dates_ordered
  CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_estimate_nonneg;
ALTER TABLE tasks ADD CONSTRAINT tasks_estimate_nonneg
  CHECK (estimate_minutes IS NULL OR (estimate_minutes >= 0 AND estimate_minutes <= 100000));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_tracked_nonneg;
ALTER TABLE tasks ADD CONSTRAINT tasks_tracked_nonneg
  CHECK (tracked_minutes IS NULL OR (tracked_minutes >= 0 AND tracked_minutes <= 100000));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_valid;
ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_valid
  CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'monthly'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_interval_valid;
ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_interval_valid
  CHECK (recurrence_interval IS NULL OR (recurrence_interval >= 1 AND recurrence_interval <= 365));

-- A repeat needs something to repeat from, or the next instance has no date.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_recurrence_needs_due_date;
ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_needs_due_date
  CHECK (recurrence IS NULL OR due_date IS NOT NULL);

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);


-- ── 4. Dependencies ─────────────────────────────────────────────────────────
-- `task_id` is blocked by `depends_on_id`.

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage task dependencies" ON task_dependencies;
CREATE POLICY "Admin manage task dependencies" ON task_dependencies FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS task_dependencies_task_id_idx ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_id_idx ON task_dependencies(depends_on_id);

-- Cycle rejection lives here rather than only in the client. A cycle makes
-- "is this task blocked?" non-terminating, and the client is not the
-- authority on what may be written.
CREATE OR REPLACE FUNCTION reject_dependency_cycle()
RETURNS TRIGGER AS $$
BEGIN
  -- Walk the chain forward from the proposed blocker. If it reaches the task
  -- being blocked, the new edge closes a loop.
  IF EXISTS (
    WITH RECURSIVE chain(id) AS (
      SELECT NEW.depends_on_id
      UNION
      SELECT d.depends_on_id
      FROM task_dependencies d
      JOIN chain c ON d.task_id = c.id
    )
    SELECT 1 FROM chain WHERE id = NEW.task_id
  ) THEN
    RAISE EXCEPTION 'Dependency would create a cycle';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_dependencies_no_cycle ON task_dependencies;
CREATE TRIGGER task_dependencies_no_cycle
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION reject_dependency_cycle();


-- ── 5. Completion timestamp ─────────────────────────────────────────────────
-- Set in one place so every write path agrees, including bulk status changes
-- and drag-to-column on the board.

CREATE OR REPLACE FUNCTION sync_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_sync_completed_at ON tasks;
CREATE TRIGGER tasks_sync_completed_at BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_completed_at();

-- Backfill: tasks already marked done get a completion time so the timeline
-- and any future reporting are not full of nulls.
UPDATE tasks SET completed_at = COALESCE(updated_at, created_at, now())
WHERE status = 'done' AND completed_at IS NULL;


-- ── 6. Manual ordering ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_task_order(task_ids UUID[])
RETURNS void AS $$
BEGIN
  FOR i IN 1..array_length(task_ids, 1) LOOP
    UPDATE tasks SET display_order = i
    WHERE id = task_ids[i] AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Seed an order for existing rows so manual sorting starts from something
-- stable rather than every task sharing display_order = 0.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM tasks
)
UPDATE tasks SET display_order = ordered.rn
FROM ordered WHERE tasks.id = ordered.id AND tasks.display_order = 0;
