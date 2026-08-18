-- db/schema.sql
--
-- Full database schema for the Personal Portfolio + Admin OS.
-- This script is IDEMPOTENT — safe to run multiple times.
-- Run this in the Supabase SQL Editor to set up or reset your database.

-- =========================================================
-- 1. HELPER FUNCTIONS
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if any admin user has been created (used on the signup page).
CREATE OR REPLACE FUNCTION check_admin_exists()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_count int;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;
  RETURN user_count > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION check_admin_exists() TO anon;
GRANT EXECUTE ON FUNCTION check_admin_exists() TO authenticated;

-- True when the current session has completed MFA/TOTP verification (AAL2).
-- Admin-write policies require this so a password-only (AAL1) session can
-- never write data, even when calling PostgREST directly.
CREATE OR REPLACE FUNCTION public.is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt()->>'aal', '') = 'aal2';
$$;
GRANT EXECUTE ON FUNCTION public.is_aal2() TO anon, authenticated;

-- True when the current session belongs to the admin — defined as the FIRST
-- registered user — and has completed MFA. Shared-content tables (site
-- identity, blog, portfolio, navigation) use this instead of the old
-- "any authenticated user" predicate so that a stray extra account can
-- never modify public content.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_aal2()
    AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1);
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Server-side signup guard: only the first account can ever be created.
-- The signup page's check_admin_exists() gate is client-side UX only;
-- this trigger is the actual enforcement against direct auth API calls.
CREATE OR REPLACE FUNCTION public.block_additional_signups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF (SELECT count(*) FROM auth.users) > 0 THEN
    RAISE EXCEPTION 'Signups are disabled: an admin account already exists.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS block_additional_signups ON auth.users;
CREATE TRIGGER block_additional_signups
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_additional_signups();


-- =========================================================
-- 2. CUSTOM ENUM TYPES (idempotent)
-- =========================================================

DO $$ BEGIN CREATE TYPE task_status AS ENUM ('todo', 'inprogress', 'review', 'done'); EXCEPTION WHEN duplicate_object THEN null; END $$;
-- Existing databases pick this up via db/migrations/001-tasks-projects-dependencies.sql.
-- 'blocked' is deliberately absent: it is derived from unmet dependencies, so a
-- stored value could disagree with the dependency graph.
DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE transaction_type AS ENUM ('earning', 'expense'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE transaction_frequency AS ENUM ('daily', 'weekly', 'bi-weekly', 'monthly', 'yearly'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE learning_status AS ENUM ('To Learn', 'Learning', 'Practicing', 'Mastered'); EXCEPTION WHEN duplicate_object THEN null; END $$;


-- =========================================================
-- 3. SITE CONFIGURATION & IDENTITY
-- =========================================================

-- Single-row table for global site identity.
-- Writes use is_admin() (not user_id ownership) because the seed row has no
-- user_id (inserted from SQL editor).
CREATE TABLE IF NOT EXISTS site_identity (
  id INT PRIMARY KEY DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB,
  social_links JSONB,
  footer_data JSONB,
  portfolio_mode TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row_enforcement CHECK (id = 1)
);
ALTER TABLE site_identity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read site identity" ON site_identity;
CREATE POLICY "Public read site identity" ON site_identity FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage site identity" ON site_identity;
CREATE POLICY "Admin manage site identity" ON site_identity FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS update_site_identity_updated_at ON site_identity;
CREATE TRIGGER update_site_identity_updated_at BEFORE UPDATE ON site_identity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Navigation Links
CREATE TABLE IF NOT EXISTS navigation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  display_order INT4 DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE navigation_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read visible navigation" ON navigation_links;
CREATE POLICY "Public read visible navigation" ON navigation_links FOR SELECT USING (is_visible = true);
DROP POLICY IF EXISTS "Admin manage navigation" ON navigation_links;
CREATE POLICY "Admin manage navigation" ON navigation_links FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Security Settings (single-row, lockdown/kill-switch)
CREATE TABLE IF NOT EXISTS security_settings (
  id INT PRIMARY KEY DEFAULT 1,
  lockdown_level INT DEFAULT 0 CHECK (lockdown_level BETWEEN 0 AND 3),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row_check CHECK (id = 1)
);
ALTER TABLE security_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read security" ON security_settings;
CREATE POLICY "Public read security" ON security_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage security" ON security_settings;
CREATE POLICY "Admin manage security" ON security_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- =========================================================
-- 4. CONTENT TABLES (Portfolio, Blog)
-- =========================================================

-- Portfolio Sections
CREATE TABLE IF NOT EXISTS portfolio_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('markdown', 'list_items', 'gallery')),
  content TEXT,
  display_order INT4 DEFAULT 0,
  page_path TEXT NOT NULL DEFAULT '/',
  layout_style TEXT NOT NULL DEFAULT 'default',
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE portfolio_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read sections" ON portfolio_sections;
CREATE POLICY "Public read sections" ON portfolio_sections FOR SELECT USING (is_visible = true);
DROP POLICY IF EXISTS "Admin manage sections" ON portfolio_sections;
CREATE POLICY "Admin manage sections" ON portfolio_sections FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS update_portfolio_sections_updated_at ON portfolio_sections;
CREATE TRIGGER update_portfolio_sections_updated_at BEFORE UPDATE ON portfolio_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Portfolio Items
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES portfolio_sections(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  date_from TEXT,
  date_to TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  tags TEXT[],
  internal_notes TEXT,
  display_order INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read items" ON portfolio_items;
CREATE POLICY "Public read items" ON portfolio_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage items" ON portfolio_items;
CREATE POLICY "Admin manage items" ON portfolio_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS update_portfolio_items_updated_at ON portfolio_items;
CREATE TRIGGER update_portfolio_items_updated_at BEFORE UPDATE ON portfolio_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Blog Posts
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT,
  cover_image_url TEXT,
  published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  show_toc BOOLEAN DEFAULT true,
  tags TEXT[],
  views BIGINT DEFAULT 0,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Denormalized word count (kept by Postgres) so list views can compute read
-- time without fetching full post bodies.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS word_count INT
  GENERATED ALWAYS AS (
    COALESCE(array_length(regexp_split_to_array(trim(content), '\s+'), 1), 0)
  ) STORED;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read posts" ON blog_posts;
CREATE POLICY "Public read posts" ON blog_posts FOR SELECT USING (published = true);
DROP POLICY IF EXISTS "Admin manage posts" ON blog_posts;
CREATE POLICY "Admin manage posts" ON blog_posts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =========================================================
-- 5. ADMIN TOOLS — Tasks, Notes, Events
-- =========================================================

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
CREATE POLICY "Admin manage task projects" ON task_projects FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_task_projects_updated_at ON task_projects;
CREATE TRIGGER update_task_projects_updated_at BEFORE UPDATE ON task_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  project_id UUID REFERENCES task_projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'todo',
  priority task_priority DEFAULT 'medium',
  start_date DATE,
  due_date DATE,
  tags TEXT[],
  display_order INT4 DEFAULT 0,
  estimate_minutes INT4,
  tracked_minutes INT4 DEFAULT 0,
  completed_at TIMESTAMPTZ,
  recurrence TEXT,
  recurrence_interval INT4,
  recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tasks_dates_ordered CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
  CONSTRAINT tasks_estimate_nonneg CHECK (estimate_minutes IS NULL OR (estimate_minutes >= 0 AND estimate_minutes <= 100000)),
  CONSTRAINT tasks_tracked_nonneg CHECK (tracked_minutes IS NULL OR (tracked_minutes >= 0 AND tracked_minutes <= 100000)),
  CONSTRAINT tasks_recurrence_valid CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT tasks_recurrence_interval_valid CHECK (recurrence_interval IS NULL OR (recurrence_interval >= 1 AND recurrence_interval <= 365)),
  CONSTRAINT tasks_recurrence_needs_due_date CHECK (recurrence IS NULL OR due_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage tasks" ON tasks;
CREATE POLICY "Admin manage tasks" ON tasks FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS sub_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE sub_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage subtasks" ON sub_tasks;
CREATE POLICY "Admin manage subtasks" ON sub_tasks FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());

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
CREATE POLICY "Admin manage task dependencies" ON task_dependencies FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
CREATE INDEX IF NOT EXISTS task_dependencies_task_id_idx ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_id_idx ON task_dependencies(depends_on_id);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT CHECK (title IS NULL OR length(title) <= 200),
  -- Markdown. `[[wikilinks]]` inside it are resolved in the client from the
  -- notes already loaded, so the link graph cannot fall out of step with the
  -- text that defines it and there is no join table to keep in sync.
  content TEXT CHECK (content IS NULL OR length(content) <= 100000),
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  tags TEXT[],
  is_pinned BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_archived_at_idx ON notes(archived_at);
CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(updated_at DESC);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage notes" ON notes;
CREATE POLICY "Admin manage notes" ON notes FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Excalidraw whiteboards. `elements`, `app_state`, and `files` are the scene
-- exactly as the library serializes it, so a board always round-trips.
-- `preview` is an SVG string rendered at save time, so the gallery can show
-- thumbnails without loading a single scene.
CREATE TABLE IF NOT EXISTS whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT,
  elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  app_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  files JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview TEXT,
  tags TEXT[],
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage whiteboards" ON whiteboards;
CREATE POLICY "Admin manage whiteboards" ON whiteboards FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_whiteboards_updated_at ON whiteboards;
CREATE TRIGGER update_whiteboards_updated_at BEFORE UPDATE ON whiteboards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage events" ON events;
CREATE POLICY "Admin manage events" ON events FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =========================================================
-- 6. FINANCE
-- =========================================================

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  type transaction_type NOT NULL,
  category TEXT,
  frequency transaction_frequency NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  occurrence_day INT,
  last_processed_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage recurring" ON recurring_transactions;
CREATE POLICY "Admin manage recurring" ON recurring_transactions FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_recurring_transactions_updated_at ON recurring_transactions;
CREATE TRIGGER update_recurring_transactions_updated_at BEFORE UPDATE ON recurring_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  type transaction_type NOT NULL,
  category TEXT,
  recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage transactions" ON transactions;
CREATE POLICY "Admin manage transactions" ON transactions FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC(12, 2) NOT NULL,
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  target_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE financial_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage goals" ON financial_goals;
CREATE POLICY "Admin manage goals" ON financial_goals FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_financial_goals_updated_at ON financial_goals;
CREATE TRIGGER update_financial_goals_updated_at BEFORE UPDATE ON financial_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =========================================================
-- 7. LEARNING HUB
-- =========================================================

CREATE TABLE IF NOT EXISTS learning_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Weekly, not daily: a daily target turns one bad Tuesday into a failure.
  target_minutes_per_week INT CHECK (target_minutes_per_week IS NULL OR (target_minutes_per_week >= 5 AND target_minutes_per_week <= 10080)),
  archived_at TIMESTAMPTZ,
  display_order INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE learning_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage subjects" ON learning_subjects;
CREATE POLICY "Admin manage subjects" ON learning_subjects FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_learning_subjects_updated_at ON learning_subjects;
CREATE TRIGGER update_learning_subjects_updated_at BEFORE UPDATE ON learning_subjects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject_id UUID REFERENCES learning_subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status learning_status DEFAULT 'To Learn',
  core_notes TEXT,
  resources JSONB,
  confidence_score INT2 CHECK (confidence_score BETWEEN 1 AND 5),
  -- Spaced review. `due_date` NULL means never reviewed — new, not overdue.
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
CREATE INDEX IF NOT EXISTS learning_topics_due_date_idx ON learning_topics(due_date);
CREATE INDEX IF NOT EXISTS learning_topics_archived_at_idx ON learning_topics(archived_at);
ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage topics" ON learning_topics;
CREATE POLICY "Admin manage topics" ON learning_topics FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_learning_topics_updated_at ON learning_topics;
CREATE TRIGGER update_learning_topics_updated_at BEFORE UPDATE ON learning_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS learning_sessions (
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
CREATE INDEX IF NOT EXISTS learning_sessions_topic_id_idx ON learning_sessions(topic_id);
CREATE INDEX IF NOT EXISTS learning_sessions_start_time_idx ON learning_sessions(start_time);

-- Review history, kept apart from the topic's current state so the schedule can
-- be recomputed and retention is answerable.
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
CREATE POLICY "Admin manage learning reviews" ON learning_reviews FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
CREATE INDEX IF NOT EXISTS learning_reviews_topic_id_idx ON learning_reviews(topic_id);
CREATE INDEX IF NOT EXISTS learning_reviews_reviewed_at_idx ON learning_reviews(reviewed_at);
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage sessions" ON learning_sessions;
CREATE POLICY "Admin manage sessions" ON learning_sessions FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- =========================================================
-- 8. LIFESTYLE — Habits, Focus, Inventory
-- =========================================================

CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  color TEXT DEFAULT '#0ea5e9',
  -- 'build' is a habit to do, 'quit' one to avoid, where a log is a slip.
  kind TEXT NOT NULL DEFAULT 'build' CHECK (kind IN ('build', 'quit')),
  -- Quantified habits; a plain check-in is target_value 1 with no unit.
  target_value NUMERIC NOT NULL DEFAULT 1 CHECK (target_value > 0 AND target_value <= 100000),
  unit TEXT CHECK (unit IS NULL OR length(unit) <= 24),
  step NUMERIC NOT NULL DEFAULT 1 CHECK (step > 0 AND step <= 100000),
  -- Which days it is due. Without this, target_per_week had no notion of
  -- *when*, so a Mon/Wed/Fri habit broke its streak every Tuesday.
  schedule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('daily', 'weekdays', 'weekends', 'custom', 'weekly_count')),
  schedule_days INT[],  -- ISO weekdays, 1 = Monday … 7 = Sunday
  target_per_week INT DEFAULT 7 CHECK (target_per_week IS NULL OR (target_per_week >= 1 AND target_per_week <= 7)),
  time_of_day TEXT NOT NULL DEFAULT 'anytime' CHECK (time_of_day IN ('anytime', 'morning', 'afternoon', 'evening')),
  category TEXT,
  notes TEXT,
  display_order INT4 DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT habits_custom_needs_days CHECK (schedule <> 'custom' OR (schedule_days IS NOT NULL AND array_length(schedule_days, 1) >= 1)),
  CONSTRAINT habits_schedule_days_valid CHECK (schedule_days IS NULL OR (
    array_length(schedule_days, 1) <= 7
    -- `<@` rather than a subquery: CHECK constraints cannot contain one,
    -- and Postgres rejects the whole statement if they do.
    AND schedule_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
  ))
);
CREATE INDEX IF NOT EXISTS habits_archived_at_idx ON habits(archived_at);
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage habits" ON habits;
CREATE POLICY "Admin manage habits" ON habits FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_habits_updated_at ON habits;
CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON habits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  -- How much was done that day. Absent row means "not done"; a zero-value row
  -- would mean every untouched day needed one.
  value NUMERIC NOT NULL DEFAULT 1 CHECK (value >= 0 AND value <= 100000),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, completed_date)
);
CREATE INDEX IF NOT EXISTS habit_logs_completed_date_idx ON habit_logs(completed_date);
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage habit logs" ON habit_logs;
CREATE POLICY "Admin manage habit logs" ON habit_logs FOR ALL USING (
  public.is_aal2()
  AND EXISTS (SELECT 1 FROM habits WHERE id = habit_logs.habit_id AND user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS focus_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  completed BOOLEAN DEFAULT false,
  mode TEXT CHECK (mode IN ('work', 'break')) DEFAULT 'work',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE focus_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage focus" ON focus_logs;
CREATE POLICY "Admin manage focus" ON focus_logs FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  category TEXT,
  serial_number TEXT,
  purchase_date DATE,
  warranty_expiry DATE,
  purchase_price NUMERIC(10, 2),
  current_value NUMERIC(10, 2),
  image_url TEXT,
  notes TEXT,
  -- Where the thing is. The question a home inventory is actually asked.
  location TEXT CHECK (location IS NULL OR length(location) <= 120),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 100000),
  tags TEXT[],
  -- Sold, gifted, lost, discarded — the object is gone but its purchase price
  -- is the one number still worth keeping.
  archived_at TIMESTAMPTZ,
  archived_reason TEXT CHECK (archived_reason IS NULL OR archived_reason IN ('sold', 'gifted', 'lost', 'discarded', 'returned')),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT inventory_reason_needs_archive CHECK (archived_reason IS NULL OR archived_at IS NOT NULL),
  CONSTRAINT inventory_warranty_after_purchase CHECK (purchase_date IS NULL OR warranty_expiry IS NULL OR warranty_expiry >= purchase_date)
);
CREATE INDEX IF NOT EXISTS inventory_items_archived_at_idx ON inventory_items(archived_at);
CREATE INDEX IF NOT EXISTS inventory_items_warranty_expiry_idx ON inventory_items(warranty_expiry);
CREATE INDEX IF NOT EXISTS inventory_items_location_idx ON inventory_items(location);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage inventory" ON inventory_items;
CREATE POLICY "Admin manage inventory" ON inventory_items FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory_items;
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage Assets Metadata
CREATE TABLE IF NOT EXISTS storage_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_kb NUMERIC,
  alt_text TEXT,
  used_in JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE storage_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage assets" ON storage_assets;
CREATE POLICY "Admin manage assets" ON storage_assets FOR ALL USING (auth.uid() = user_id AND public.is_aal2()) WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- =========================================================
-- 9. PUBLIC NOTES (Life Updates)
-- =========================================================

CREATE TABLE IF NOT EXISTS public_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT,
  content TEXT,
  category TEXT CHECK (category IN ('watching', 'activity', 'photo', 'thought', 'milestone')) DEFAULT 'thought',
  image_url TEXT,
  tags TEXT[],
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read published notes" ON public_notes;
CREATE POLICY "Public read published notes" ON public_notes FOR SELECT USING (is_published = true);
DROP POLICY IF EXISTS "Admin manage public notes" ON public_notes;
CREATE POLICY "Admin manage public notes" ON public_notes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS update_public_notes_updated_at ON public_notes;
CREATE TRIGGER update_public_notes_updated_at BEFORE UPDATE ON public_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =========================================================
-- 10. CONTACT SUBMISSIONS
-- =========================================================

-- The only table an unauthenticated visitor may write to. Bounds mirror LIMITS
-- in src/lib/schemas.ts, and the rate-limit trigger below is the only thing
-- standing between `WITH CHECK (true)` and an unbounded number of rows.
CREATE TABLE IF NOT EXISTS contact_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT contact_submissions_length_check CHECK (
    char_length(name)    BETWEEN 2 AND 200
    AND char_length(email)   BETWEEN 3 AND 320
    AND char_length(subject) BETWEEN 3 AND 200
    AND char_length(message) BETWEEN 10 AND 5000
  )
);
CREATE INDEX IF NOT EXISTS contact_submissions_inbox_idx
  ON contact_submissions (is_archived, created_at DESC);
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert contact" ON contact_submissions;
CREATE POLICY "Public insert contact" ON contact_submissions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admin read contact" ON contact_submissions;
CREATE POLICY "Admin read contact" ON contact_submissions FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "Admin update contact" ON contact_submissions;
CREATE POLICY "Admin update contact" ON contact_submissions FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admin delete contact" ON contact_submissions;
CREATE POLICY "Admin delete contact" ON contact_submissions FOR DELETE USING (public.is_admin());

-- Refuses 3 submissions per address per hour, or 10 site-wide per minute.
CREATE OR REPLACE FUNCTION public.limit_contact_submissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_email INT;
  per_minute INT;
BEGIN
  SELECT count(*) INTO per_email FROM contact_submissions
   WHERE lower(email) = lower(NEW.email) AND created_at > now() - interval '1 hour';
  IF per_email >= 3 THEN
    RAISE EXCEPTION 'Too many messages from this address. Try again later.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO per_minute FROM contact_submissions
   WHERE created_at > now() - interval '1 minute';
  IF per_minute >= 10 THEN
    RAISE EXCEPTION 'The contact form is busy. Try again in a moment.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS limit_contact_submissions ON contact_submissions;
CREATE TRIGGER limit_contact_submissions BEFORE INSERT ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.limit_contact_submissions();


-- Integration secrets. Deliberately NOT in site_identity, which is
-- `FOR SELECT USING (true)` — a webhook URL there would be world-readable.
-- There is no public read policy; the notify trigger reaches the row through
-- SECURITY DEFINER so an anonymous INSERT can fire a notification without the
-- anon role ever being able to read the URL.
CREATE TABLE IF NOT EXISTS integration_settings (
  id                  INT PRIMARY KEY DEFAULT 1,
  contact_webhook_url TEXT,
  notify_on_contact   BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT integration_settings_single_row CHECK (id = 1)
);
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage integrations" ON integration_settings;
CREATE POLICY "Admin manage integrations" ON integration_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP TRIGGER IF EXISTS update_integration_settings_updated_at ON integration_settings;
CREATE TRIGGER update_integration_settings_updated_at BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_contact_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  settings integration_settings%ROWTYPE;
BEGIN
  SELECT * INTO settings FROM integration_settings WHERE id = 1;

  IF settings.contact_webhook_url IS NULL
     OR settings.contact_webhook_url = ''
     OR NOT settings.notify_on_contact THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := settings.contact_webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
      'username', 'Portfolio Contact',
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', 'New contact form submission',
        'color', 5814783,
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Name',    'value', left(NEW.name, 256),  'inline', true),
          jsonb_build_object('name', 'Email',   'value', left(NEW.email, 256), 'inline', true),
          jsonb_build_object('name', 'Subject', 'value', left(NEW.subject, 256)),
          jsonb_build_object('name', 'Message', 'value', left(NEW.message, 1000))
        ),
        'timestamp', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'footer', jsonb_build_object('text', 'Reply from Admin → Inbox')
      ))
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: losing the ping is a nuisance, losing the message is not
  -- acceptable.
  RAISE WARNING 'contact notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_contact_submission ON contact_submissions;
CREATE TRIGGER notify_contact_submission AFTER INSERT ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_contact_submission();


-- =========================================================
-- 11. RPC FUNCTIONS
-- =========================================================

-- Ping (health check)
CREATE OR REPLACE FUNCTION ping() RETURNS text AS $$ BEGIN RETURN 'pong'; END; $$ LANGUAGE plpgsql;

-- Blog View Counter
CREATE OR REPLACE FUNCTION increment_blog_post_view(post_id_to_increment UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE blog_posts SET views = views + 1 WHERE id = post_id_to_increment AND published = true;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_blog_post_view(UUID) TO anon, authenticated;

-- Focus time is added in the database, not read-modify-written by the client:
-- a session finishing while another tab holds a stale task row would otherwise
-- overwrite the other session's minutes.
CREATE OR REPLACE FUNCTION add_task_time(target_task_id UUID, minutes INT)
RETURNS void AS $$
BEGIN
  IF minutes IS NULL OR minutes <= 0 THEN RETURN; END IF;
  UPDATE tasks SET tracked_minutes = LEAST(COALESCE(tracked_minutes, 0) + minutes, 100000)
  WHERE id = target_task_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Habit logging. One round trip and idempotent: incrementing from the today
-- view fires once per tap, and a select-then-insert would double-count a race.
CREATE OR REPLACE FUNCTION set_habit_log(target_habit_id UUID, target_date DATE, new_value NUMERIC)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM habits WHERE id = target_habit_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Habit not found';
  END IF;
  IF new_value IS NULL OR new_value <= 0 THEN
    DELETE FROM habit_logs WHERE habit_id = target_habit_id AND completed_date = target_date;
    RETURN;
  END IF;
  INSERT INTO habit_logs (habit_id, completed_date, value)
  VALUES (target_habit_id, target_date, LEAST(new_value, 100000))
  ON CONFLICT (habit_id, completed_date) DO UPDATE SET value = LEAST(EXCLUDED.value, 100000);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION update_habit_order(habit_ids UUID[])
RETURNS void AS $$
BEGIN
  FOR i IN 1..array_length(habit_ids, 1) LOOP
    UPDATE habits SET display_order = i WHERE id = habit_ids[i] AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Spaced review. The schedule is computed here so a review and the topic
-- state it produces can never disagree: the client sends a rating, not an
-- interval.
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

-- Task Reordering
CREATE OR REPLACE FUNCTION update_task_order(task_ids UUID[])
RETURNS void AS $$
BEGIN
  FOR i IN 1..array_length(task_ids, 1) LOOP
    UPDATE tasks SET display_order = i WHERE id = task_ids[i] AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- A dependency cycle makes "is this task blocked?" non-terminating, so it is
-- rejected by the database rather than only by the client.
CREATE OR REPLACE FUNCTION reject_dependency_cycle()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE chain(id) AS (
      SELECT NEW.depends_on_id
      UNION
      SELECT d.depends_on_id FROM task_dependencies d JOIN chain c ON d.task_id = c.id
    )
    SELECT 1 FROM chain WHERE id = NEW.task_id
  ) THEN
    RAISE EXCEPTION 'Dependency would create a cycle';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_dependencies_no_cycle ON task_dependencies;
CREATE TRIGGER task_dependencies_no_cycle BEFORE INSERT OR UPDATE ON task_dependencies FOR EACH ROW EXECUTE FUNCTION reject_dependency_cycle();

-- Completion time is set in one place so every write path agrees, including
-- drag-to-column on the board and bulk status changes.
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
CREATE TRIGGER tasks_sync_completed_at BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION sync_task_completed_at();

-- Section Reordering
CREATE OR REPLACE FUNCTION update_section_order(section_ids UUID[])
RETURNS void AS $$
BEGIN
  FOR i IN 1..array_length(section_ids, 1) LOOP
    UPDATE portfolio_sections SET display_order = i WHERE id = section_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Total Blog Views
CREATE OR REPLACE FUNCTION get_total_blog_views()
RETURNS BIGINT AS $$
DECLARE total_views BIGINT;
BEGIN
  SELECT SUM(views) INTO total_views FROM blog_posts WHERE published = true;
  RETURN COALESCE(total_views, 0);
END;
$$ LANGUAGE plpgsql;

-- Learning Heatmap
CREATE OR REPLACE FUNCTION get_learning_heatmap_data(start_date DATE, end_date DATE)
RETURNS TABLE(day DATE, total_minutes INT) AS $$
BEGIN
  RETURN QUERY
  SELECT DATE(s.start_time AT TIME ZONE 'UTC') AS day, COALESCE(SUM(s.duration_minutes), 0)::INT AS total_minutes
  FROM learning_sessions s
  WHERE s.user_id = auth.uid()
    AND s.start_time AT TIME ZONE 'UTC' >= start_date
    AND s.start_time AT TIME ZONE 'UTC' <= end_date
  GROUP BY day ORDER BY day;
END;
$$ LANGUAGE plpgsql;

-- Calendar Data (aggregated view of events, tasks, habits, finance)
CREATE OR REPLACE FUNCTION get_calendar_data(start_date_param date, end_date_param date)
RETURNS TABLE(item_id UUID, title TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, item_type TEXT, data JSONB) AS $$
BEGIN
  RETURN QUERY
  -- Events
  SELECT e.id, e.title, e.start_time, e.end_time, 'event' AS item_type,
    jsonb_build_object('description', e.description, 'is_all_day', e.is_all_day)
  FROM events e WHERE e.user_id = auth.uid() AND e.start_time::date BETWEEN start_date_param AND end_date_param
  UNION ALL
  -- Tasks
  SELECT t.id, t.title, (t.due_date + interval '9 hour')::timestamptz, NULL::timestamptz, 'task' AS item_type,
    jsonb_build_object('status', t.status, 'priority', t.priority)
  FROM tasks t WHERE t.user_id = auth.uid() AND t.due_date BETWEEN start_date_param AND end_date_param
  UNION ALL
  -- Habit Summary (grouped per day)
  SELECT gen_random_uuid(), 'Habits Completed', (hl.completed_date + interval '7 hour')::timestamptz, NULL::timestamptz, 'habit_summary' AS item_type,
    jsonb_build_object('count', COUNT(*), 'completed_habits', jsonb_agg(jsonb_build_object('title', h.title, 'color', h.color)))
  FROM habit_logs hl JOIN habits h ON hl.habit_id = h.id
  WHERE h.user_id = auth.uid() AND hl.completed_date BETWEEN start_date_param AND end_date_param
  GROUP BY hl.completed_date
  UNION ALL
  -- Transaction Summary (grouped per day)
  SELECT gen_random_uuid(), 'Daily Finance', (tr.date + interval '12 hour')::timestamptz, NULL::timestamptz, 'transaction_summary' AS item_type,
    jsonb_build_object(
      'count', COUNT(*),
      'total_earning', COALESCE(SUM(CASE WHEN tr.type = 'earning' THEN tr.amount ELSE 0 END), 0),
      'total_expense', COALESCE(SUM(CASE WHEN tr.type = 'expense' THEN tr.amount ELSE 0 END), 0),
      'transactions', jsonb_agg(jsonb_build_object('description', tr.description, 'amount', tr.amount, 'type', tr.type, 'category', tr.category))
    )
  FROM transactions tr WHERE tr.user_id = auth.uid() AND tr.date BETWEEN start_date_param AND end_date_param
  GROUP BY tr.date;
END;
$$ LANGUAGE plpgsql;

-- Analytics Overview
CREATE OR REPLACE FUNCTION get_analytics_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  analytics_data JSONB;
  current_user_id UUID := auth.uid();
BEGIN
  WITH
  task_stats AS (
    SELECT status, count(*) AS count FROM tasks WHERE user_id = current_user_id GROUP BY status
  ),
  tasks_completed_weekly AS (
    SELECT date_trunc('week', updated_at)::date AS week_start, count(*) AS completed_count
    FROM tasks WHERE user_id = current_user_id AND status = 'done' AND updated_at > now() - interval '8 weeks'
    GROUP BY week_start ORDER BY week_start
  ),
  productivity_heatmap AS (
    SELECT (updated_at AT TIME ZONE 'UTC')::date AS day, count(*)::INT AS count
    FROM tasks WHERE user_id = current_user_id AND status = 'done' GROUP BY day
  ),
  blog_stats AS (
    SELECT id, title, slug, views FROM blog_posts WHERE user_id = current_user_id AND published = true ORDER BY views DESC LIMIT 5
  ),
  learning_stats AS (
    SELECT ls.name AS subject_name, SUM(lse.duration_minutes)::INT AS total_minutes
    FROM learning_sessions lse
    JOIN learning_topics lt ON lse.topic_id = lt.id
    JOIN learning_subjects ls ON lt.subject_id = ls.id
    WHERE lse.user_id = current_user_id GROUP BY ls.name
  )
  SELECT jsonb_build_object(
    'task_status_distribution', (SELECT jsonb_agg(jsonb_build_object('name', status, 'value', count)) FROM task_stats),
    'tasks_completed_weekly', (SELECT jsonb_agg(jsonb_build_object('week', to_char(week_start, 'Mon DD'), 'completed', completed_count)) FROM tasks_completed_weekly),
    'productivity_heatmap', (SELECT jsonb_agg(jsonb_build_object('date', day, 'count', count)) FROM productivity_heatmap),
    'top_blog_posts', (SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'slug', slug, 'views', views)) FROM blog_stats),
    'learning_time_by_subject', (SELECT jsonb_agg(jsonb_build_object('name', subject_name, 'value', total_minutes)) FROM learning_stats)
  ) INTO analytics_data;
  RETURN analytics_data;
END;
$$;

-- Asset Usage Tracker
CREATE OR REPLACE FUNCTION update_asset_usage()
RETURNS void AS $$
DECLARE asset RECORD; usage JSONB;
BEGIN
  FOR asset IN SELECT id, file_path FROM storage_assets LOOP
    usage := '[]'::jsonb;
    IF EXISTS (SELECT 1 FROM blog_posts WHERE cover_image_url LIKE '%' || asset.file_path || '%') THEN
      usage := usage || jsonb_build_object('type', 'Blog Cover', 'id', (SELECT id FROM blog_posts WHERE cover_image_url LIKE '%' || asset.file_path || '%' LIMIT 1));
    END IF;
    IF EXISTS (SELECT 1 FROM blog_posts WHERE content LIKE '%' || asset.file_path || '%') THEN
      usage := usage || jsonb_build_object('type', 'Blog Content', 'id', (SELECT id FROM blog_posts WHERE content LIKE '%' || asset.file_path || '%' LIMIT 1));
    END IF;
    IF EXISTS (SELECT 1 FROM portfolio_items WHERE image_url LIKE '%' || asset.file_path || '%') THEN
      usage := usage || jsonb_build_object('type', 'Portfolio Item', 'id', (SELECT id FROM portfolio_items WHERE image_url LIKE '%' || asset.file_path || '%' LIMIT 1));
    END IF;
    UPDATE storage_assets SET used_in = usage WHERE id = asset.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Transaction Category Management
CREATE OR REPLACE FUNCTION rename_transaction_category(old_name TEXT, new_name TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE transactions SET category = new_name WHERE user_id = auth.uid() AND category = old_name;
  UPDATE recurring_transactions SET category = new_name WHERE user_id = auth.uid() AND category = old_name;
END;
$$;

CREATE OR REPLACE FUNCTION merge_transaction_categories(source_name TEXT, target_name TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE transactions SET category = target_name WHERE user_id = auth.uid() AND category = source_name;
  UPDATE recurring_transactions SET category = target_name WHERE user_id = auth.uid() AND category = source_name;
END;
$$;

CREATE OR REPLACE FUNCTION delete_transaction_category(category_name TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE transactions SET category = NULL WHERE user_id = auth.uid() AND category = category_name;
  UPDATE recurring_transactions SET category = NULL WHERE user_id = auth.uid() AND category = category_name;
END;
$$;


-- =========================================================
-- 12. STORAGE BUCKET & POLICIES
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read access assets" ON storage.objects;
CREATE POLICY "Public read access assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Admin upload access assets" ON storage.objects;
CREATE POLICY "Admin upload access assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admin update access assets" ON storage.objects;
CREATE POLICY "Admin update access assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admin delete access assets" ON storage.objects;
CREATE POLICY "Admin delete access assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'assets' AND public.is_admin());


-- =========================================================
-- 13. SEED DATA
-- =========================================================

-- Site Identity (required for the portfolio to render on first load)
INSERT INTO site_identity (id, profile_data, social_links, footer_data, portfolio_mode)
VALUES (1,
  '{
    "name": "Your Name",
    "title": "Your Professional Title",
    "description": "A brief, compelling description about who you are and what you do. This will appear on your homepage.",
    "profile_picture_url": "",
    "show_profile_picture": false,
    "default_theme": "theme-blueprint",
    "logo": { "main": "YOUR", "highlight": ".DEV" },
    "status_panel": {
      "show": true,
      "design": "minimal",
      "title": "status.panel",
      "availability": "Open for new opportunities",
      "currently_exploring": { "title": "Exploring", "items": ["New Tech 1", "New Tech 2"] },
      "latestProject": { "name": "My Latest Project", "linkText": "View all projects", "href": "/projects" }
    },
    "bio": [
      "This is the first paragraph of your bio on the About page. Share your story, your passion for your work, and what drives you.",
      "This is the second paragraph. You can talk about your philosophy, interests outside of work, or your long-term goals."
    ],
    "github_projects_config": {
      "username": "your-github-username",
      "show": true,
      "sort_by": "pushed",
      "exclude_forks": true,
      "exclude_archived": true,
      "exclude_profile_repo": true,
      "min_stars": 0,
      "projects_per_page": 9
    },
    "contact_page": {
      "show_contact_form": true,
      "show_availability_badge": true,
      "show_services": true
    }
  }',
  '[
    {"id": "github", "label": "GitHub", "url": "https://github.com/your-username", "is_visible": true},
    {"id": "linkedin", "label": "LinkedIn", "url": "https://linkedin.com/in/your-profile", "is_visible": true},
    {"id": "email", "label": "Email", "url": "mailto:your-email@example.com", "is_visible": true}
  ]',
  '{ "copyright_text": "Crafted with Next.js & Supabase. Deployed on GitHub Pages." }',
  'multi-page'
) ON CONFLICT (id) DO NOTHING;

-- Security Settings (default: no lockdown)
INSERT INTO security_settings (id, lockdown_level) VALUES (1, 0) ON CONFLICT DO NOTHING;
INSERT INTO integration_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Default Navigation Links
INSERT INTO navigation_links (label, href, display_order, is_visible) VALUES
  ('Home',     '/',         0, true),
  ('Showcase', '/showcase', 1, true),
  ('About',    '/about',    2, true),
  ('Projects', '/projects', 3, true),
  ('Blog',     '/blog',     4, true),
  ('Updates',     '/updates',     5, true),
  ('Contact',  '/contact',  6, true)
ON CONFLICT DO NOTHING;
