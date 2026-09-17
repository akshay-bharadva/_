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
  -- Hidden titles stay in the markup, screen-reader-only (migration 019).
  show_title BOOLEAN NOT NULL DEFAULT true,
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
-- A branch that fed into another item. Derived concurrency is honest, but a
-- *merge* is a relationship between two items and needs saying explicitly —
-- inferring it from adjacency would draw a claim nobody made. See
-- db/migrations/017.
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
-- `updated_at` on a note means "the content changed", so filing a note —
-- pinning it, reordering it — deliberately leaves the timestamp alone. See
-- db/migrations/013 for why. Written as a JSONB difference rather than a list
-- of comparisons so a column added later counts as content by default.
CREATE OR REPLACE FUNCTION public.touch_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
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
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION public.touch_notes_updated_at();

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

-- Contributions themselves are created further down, after `finance_accounts`
-- exists — see "3b. Goal contributions" in the FINANCE section. The function
-- below can stay here because a plpgsql body is resolved when it runs, not when
-- it is created.

-- ----------------------------------------------------------------------------
-- Recording one, atomically.
-- ----------------------------------------------------------------------------
--
-- The contribution row and the running total on the goal must not be written
-- separately: a client-side read-modify-write loses an amount whenever two
-- operations race, which is the reason every other multi-step write in this
-- schema is an RPC.
--
-- SECURITY DEFINER, so it steps over RLS and has to re-check AAL2 itself.
-- `GRANT ... TO authenticated` is not that check: `authenticated` includes a
-- session that has passed a password and not the second factor. This is the
-- lesson migration 011 exists for.
CREATE OR REPLACE FUNCTION public.record_goal_contribution(
  p_goal_id UUID,
  p_amount NUMERIC,
  p_account_id UUID DEFAULT NULL,
  p_occurred_on DATE DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS financial_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_goal           financial_goals;
  v_transaction_id UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_amount = 0 OR p_amount IS NULL THEN
    RAISE EXCEPTION 'A contribution of nothing is not a contribution';
  END IF;

  SELECT * INTO v_goal FROM financial_goals
   WHERE id = p_goal_id AND user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;

  -- An account, when given, has to be the caller's own. Without this check a
  -- definer function would happily attribute an earmark to somebody else's
  -- account id.
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM finance_accounts
     WHERE id = p_account_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  -- Floored at zero: a goal holding a negative amount describes nothing, and
  -- the arithmetic that produced it is a mistake the reader cannot see.
  IF v_goal.current_amount + p_amount < 0 THEN
    RAISE EXCEPTION 'That is more than the goal holds';
  END IF;

  -- The ledger row, only when an account was named. Putting money aside is a
  -- spend from that account; taking it back is money returning to it. With no
  -- account there is nothing to debit, and inventing one would be worse than
  -- recording the contribution alone.
  IF p_account_id IS NOT NULL THEN
    INSERT INTO transactions
      (user_id, date, description, amount, type, category, account_id)
    VALUES (
      v_uid,
      COALESCE(p_occurred_on, CURRENT_DATE),
      CASE WHEN p_amount > 0
        THEN 'To goal: ' || v_goal.name
        ELSE 'From goal: ' || v_goal.name
      END,
      abs(p_amount),
      CASE WHEN p_amount > 0 THEN 'expense' ELSE 'earning' END::transaction_type,
      'Savings & Goals',
      p_account_id
    )
    RETURNING id INTO v_transaction_id;
  END IF;

  INSERT INTO finance_goal_contributions
    (user_id, goal_id, account_id, amount, occurred_on, note, transaction_id)
  VALUES
    (v_uid, p_goal_id, p_account_id, p_amount,
     COALESCE(p_occurred_on, CURRENT_DATE), p_note, v_transaction_id);

  UPDATE financial_goals
     SET current_amount = current_amount + p_amount
   WHERE id = p_goal_id
  RETURNING * INTO v_goal;

  RETURN v_goal;
END;
$$;

REVOKE ALL ON FUNCTION public.record_goal_contribution(UUID, NUMERIC, UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_goal_contribution(UUID, NUMERIC, UUID, DATE, TEXT) TO authenticated;



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
-- Not everything you learn is a flashcard: reference material is read,
-- recall is the classic prompt-then-reveal, and quiz carries a right answer to
-- be marked against. See db/migrations/015.
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
  visit_webhook_url   TEXT,
  -- Off by default: a ping per visit is noise you mute within a week, and a
  -- muted channel tells you nothing.
  notify_on_visit     BOOLEAN NOT NULL DEFAULT false,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT integration_settings_single_row CHECK (id = 1)
);
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage integrations" ON integration_settings;
CREATE POLICY "Admin manage integrations" ON integration_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS market_data_key TEXT;

ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS market_data_provider TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_settings_market_key_len'
  ) THEN
    ALTER TABLE integration_settings
      ADD CONSTRAINT integration_settings_market_key_len
      CHECK (market_data_key IS NULL OR char_length(market_data_key) <= 200);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- The watchlist
-- ----------------------------------------------------------------------------
--
-- Stores *what to ask for*, never what came back — the same rule the rest of
-- Discover follows. Caching a quote means deciding when it goes stale, and a
-- stale quote presented as current is worse than no quote at all.

CREATE TABLE IF NOT EXISTS discover_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- The ticker as the provider spells it. Case is preserved because some
  -- venues are case-sensitive; uniqueness is not, because typing "aapl" twice
  -- should not produce two rows.
  symbol TEXT NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 32),
  name TEXT CHECK (name IS NULL OR char_length(name) <= 200),
  kind TEXT NOT NULL DEFAULT 'stock'
    CHECK (kind IN ('stock', 'etf', 'fund', 'index', 'crypto', 'bond')),
  -- Where it trades, when the symbol alone is ambiguous — SHOP is Shopify on
  -- both the NYSE and the TSX, at different prices in different currencies.
  exchange TEXT CHECK (exchange IS NULL OR char_length(exchange) <= 32),
  currency TEXT CHECK (currency IS NULL OR char_length(currency) = 3),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  display_order INT4 DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discover_watchlist_symbol_idx
  ON discover_watchlist(user_id, lower(symbol), coalesce(exchange, ''));

ALTER TABLE discover_watchlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage watchlist" ON discover_watchlist;
CREATE POLICY "Admin manage watchlist" ON discover_watchlist
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

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
-- 10b. VISITOR ANALYTICS
-- =========================================================
-- One row per visit. No IP address is ever stored: the trigger reads
-- x-forwarded-for from the PostgREST request and keeps only
-- sha256(secret || current_date || ip || user_agent), so unique-visitor
-- counts are accurate within a day and the column identifies nobody.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ── 1. The secret behind the hash ───────────────────────────────────────────
--
-- Its own table with no policies at all, so no client role can read it through
-- PostgREST under any circumstances. Only SECURITY DEFINER functions reach it.

CREATE TABLE IF NOT EXISTS analytics_secret (
  id     INT PRIMARY KEY DEFAULT 1,
  secret TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  CONSTRAINT analytics_secret_single_row CHECK (id = 1)
);
ALTER TABLE analytics_secret ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy. RLS with no policy denies everything.
INSERT INTO analytics_secret (id) VALUES (1) ON CONFLICT DO NOTHING;


-- ── 2. Visits ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Daily-salted, irreversible. Set by the trigger; anything the client sends
  -- for this column is overwritten.
  visitor_hash  TEXT,

  path          TEXT NOT NULL,
  -- Host only. A full referrer URL can carry someone else's query string.
  referrer_host TEXT,
  source        TEXT,
  channel       TEXT CHECK (channel IN ('direct','search','social','referral','campaign')),
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,

  country       TEXT,
  region        TEXT,
  city          TEXT,
  network       TEXT,
  timezone      TEXT,
  language      TEXT,

  browser       TEXT,
  os            TEXT,
  device        TEXT CHECK (device IN ('desktop','mobile','tablet')),
  screen_width  INT,

  is_bot        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The same discipline as contact_submissions: this is a table an anonymous
  -- visitor writes to, so every free-text column has a ceiling.
  CONSTRAINT site_visits_length_check CHECK (
    char_length(path) <= 512
    AND char_length(coalesce(referrer_host, '')) <= 255
    AND char_length(coalesce(source, '')) <= 128
    AND char_length(coalesce(utm_source, '')) <= 128
    AND char_length(coalesce(utm_medium, '')) <= 128
    AND char_length(coalesce(utm_campaign, '')) <= 128
    AND char_length(coalesce(country, '')) <= 2
    AND char_length(coalesce(region, '')) <= 128
    AND char_length(coalesce(city, '')) <= 128
    AND char_length(coalesce(network, '')) <= 200
    AND char_length(coalesce(timezone, '')) <= 64
    AND char_length(coalesce(language, '')) <= 32
    AND char_length(coalesce(browser, '')) <= 64
    AND char_length(coalesce(os, '')) <= 64
  )
);

-- Every dashboard query is "recent, excluding bots", then grouped.
CREATE INDEX IF NOT EXISTS site_visits_recent_idx
  ON site_visits (created_at DESC) WHERE is_bot = false;
CREATE INDEX IF NOT EXISTS site_visits_visitor_idx
  ON site_visits (visitor_hash, created_at DESC);

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public insert visits" ON site_visits;
CREATE POLICY "Public insert visits" ON site_visits FOR INSERT WITH CHECK (true);

-- Read is the owner's alone. A public SELECT here would publish the whole
-- audience log to anyone who found the table name.
DROP POLICY IF EXISTS "Admin read visits" ON site_visits;
CREATE POLICY "Admin read visits" ON site_visits FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "Admin delete visits" ON site_visits;
CREATE POLICY "Admin delete visits" ON site_visits FOR DELETE USING (public.is_admin());
-- No UPDATE policy: a visit is a fact, not a record to be edited.


-- ── 3. Server-side enrichment ───────────────────────────────────────────────
--
-- Everything the client cannot be trusted with, or does not know.

CREATE OR REPLACE FUNCTION public.enrich_site_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  headers   JSON;
  forwarded TEXT;
  client_ip TEXT;
  agent     TEXT;
  salt      TEXT;
BEGIN
  headers := nullif(current_setting('request.headers', true), '')::json;

  IF headers IS NOT NULL THEN
    forwarded := headers ->> 'x-forwarded-for';
    agent     := headers ->> 'user-agent';
  END IF;

  -- "client, proxy1, proxy2" — the first entry is the original client. It is
  -- forgeable by the caller, which for a personal analytics table means someone
  -- can corrupt their own row in your statistics and nothing else.
  client_ip := split_part(coalesce(forwarded, ''), ',', 1);
  client_ip := btrim(client_ip);

  SELECT secret INTO salt FROM analytics_secret WHERE id = 1;

  IF client_ip <> '' AND salt IS NOT NULL THEN
    NEW.visitor_hash := encode(
      extensions.digest(
        salt || current_date::text || client_ip || coalesce(agent, ''),
        'sha256'
      ),
      'hex'
    );
  ELSE
    NEW.visitor_hash := NULL;
  END IF;

  -- Bots are flagged, not refused. "60% of this traffic is Googlebot" is worth
  -- knowing, and a filter that silently discards is one you cannot check.
  IF agent IS NOT NULL AND agent ~* '(bot\b|crawler|spider|crawl|slurp|facebookexternalhit|headlesschrome|lighthouse|pagespeed|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|applebot|discordbot|slackbot|telegrambot|twitterbot|linkedinbot|preview|monitor|curl|wget|python-requests|node-fetch|go-http-client|okhttp)' THEN
    NEW.is_bot := true;
  END IF;

  -- Never client-settable.
  NEW.created_at := now();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enrich_site_visit() IS
  'Derives visitor_hash from the request IP and a daily-rotating secret salt, and flags known bots. The raw IP is used and discarded within the statement — it is never stored.';

DROP TRIGGER IF EXISTS enrich_site_visit ON site_visits;
CREATE TRIGGER enrich_site_visit
  BEFORE INSERT ON site_visits
  FOR EACH ROW EXECUTE FUNCTION public.enrich_site_visit();


-- ── 4. Rate limit ───────────────────────────────────────────────────────────
--
-- The same exposure as contact_submissions: an anonymous INSERT policy with no
-- ceiling is an invitation to fill the database. Generous enough that a person
-- clicking through every page never notices.

CREATE OR REPLACE FUNCTION public.limit_site_visits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent INT;
BEGIN
  IF NEW.visitor_hash IS NOT NULL THEN
    SELECT count(*) INTO recent FROM site_visits
     WHERE visitor_hash = NEW.visitor_hash
       AND created_at > now() - interval '1 minute';
    IF recent >= 30 THEN
      RETURN NULL; -- Silently dropped: telemetry must never break a page view.
    END IF;
  END IF;

  SELECT count(*) INTO recent FROM site_visits
   WHERE created_at > now() - interval '1 minute';
  IF recent >= 600 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Must run after enrichment, since it filters on the hash that trigger derives.
-- Postgres fires BEFORE triggers in alphabetical order by trigger name, and
-- "enrich_site_visit" sorts before "limit_site_visits" — that is load-bearing,
-- so do not rename either without checking the other.
DROP TRIGGER IF EXISTS limit_site_visits ON site_visits;
CREATE TRIGGER limit_site_visits
  BEFORE INSERT ON site_visits
  FOR EACH ROW EXECUTE FUNCTION public.limit_site_visits();


-- ── 5. Retention ────────────────────────────────────────────────────────────
--
-- The free tier gives 500 MB. A visit row is roughly 200 bytes, so a year of
-- serious traffic is still small — but a table nothing ever deletes from grows
-- until it is a problem, and the interesting window is the last few months.
--
-- Call it from the admin, or schedule it if pg_cron is enabled:
--   SELECT cron.schedule('prune-visits', '0 4 * * *', 'SELECT prune_site_visits()');

CREATE OR REPLACE FUNCTION public.prune_site_visits(keep_days INT DEFAULT 400)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  DELETE FROM site_visits WHERE created_at < now() - (keep_days || ' days')::interval;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_site_visits(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_site_visits(INT) TO authenticated;


-- ── 6. The aggregate the dashboard reads ────────────────────────────────────
--
-- Aggregating in Postgres rather than shipping rows to the browser: a year of
-- traffic is tens of thousands of rows, and the admin only ever renders the
-- summary of them.

CREATE OR REPLACE FUNCTION public.get_visitor_analytics(
  days       INT DEFAULT 30,
  with_bots  BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  since  TIMESTAMPTZ := now() - (greatest(days, 1) || ' days')::interval;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH scoped AS (
    SELECT * FROM site_visits
     WHERE created_at >= since
       AND (with_bots OR is_bot = false)
  ),
  by_day AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::INT AS views,
           count(DISTINCT visitor_hash)::INT AS visitors
      FROM scoped GROUP BY day ORDER BY day
  ),
  top_pages AS (
    SELECT path AS name, count(*)::INT AS value
      FROM scoped GROUP BY path ORDER BY value DESC LIMIT 10
  ),
  top_sources AS (
    SELECT coalesce(source, 'Direct') AS name, count(*)::INT AS value
      FROM scoped GROUP BY 1 ORDER BY value DESC LIMIT 10
  ),
  by_channel AS (
    SELECT coalesce(channel, 'direct') AS name, count(*)::INT AS value
      FROM scoped GROUP BY 1 ORDER BY value DESC
  ),
  by_country AS (
    SELECT country AS name, count(*)::INT AS value,
           count(DISTINCT visitor_hash)::INT AS visitors
      FROM scoped WHERE country IS NOT NULL GROUP BY country
     ORDER BY value DESC LIMIT 20
  ),
  by_city AS (
    SELECT city AS name, country, count(*)::INT AS value
      FROM scoped WHERE city IS NOT NULL GROUP BY city, country
     ORDER BY value DESC LIMIT 10
  ),
  by_network AS (
    SELECT network AS name, count(*)::INT AS value
      FROM scoped WHERE network IS NOT NULL GROUP BY network
     ORDER BY value DESC LIMIT 10
  ),
  by_browser AS (
    SELECT coalesce(browser, 'Other') AS name, count(*)::INT AS value
      FROM scoped GROUP BY 1 ORDER BY value DESC LIMIT 8
  ),
  by_os AS (
    SELECT coalesce(os, 'Other') AS name, count(*)::INT AS value
      FROM scoped GROUP BY 1 ORDER BY value DESC LIMIT 8
  ),
  by_device AS (
    SELECT coalesce(device, 'desktop') AS name, count(*)::INT AS value
      FROM scoped GROUP BY 1 ORDER BY value DESC
  ),
  by_hour AS (
    SELECT extract(hour FROM created_at AT TIME ZONE 'UTC')::INT AS hour,
           count(*)::INT AS value
      FROM scoped GROUP BY hour ORDER BY hour
  )
  SELECT jsonb_build_object(
    'range_days',    days,
    'total_views',   (SELECT count(*)::INT FROM scoped),
    'total_visitors',(SELECT count(DISTINCT visitor_hash)::INT FROM scoped),
    'bot_views',     (SELECT count(*)::INT FROM site_visits WHERE created_at >= since AND is_bot),
    'by_day',        coalesce((SELECT jsonb_agg(to_jsonb(by_day)) FROM by_day), '[]'::jsonb),
    'top_pages',     coalesce((SELECT jsonb_agg(to_jsonb(top_pages)) FROM top_pages), '[]'::jsonb),
    'top_sources',   coalesce((SELECT jsonb_agg(to_jsonb(top_sources)) FROM top_sources), '[]'::jsonb),
    'by_channel',    coalesce((SELECT jsonb_agg(to_jsonb(by_channel)) FROM by_channel), '[]'::jsonb),
    'by_country',    coalesce((SELECT jsonb_agg(to_jsonb(by_country)) FROM by_country), '[]'::jsonb),
    'by_city',       coalesce((SELECT jsonb_agg(to_jsonb(by_city)) FROM by_city), '[]'::jsonb),
    'by_network',    coalesce((SELECT jsonb_agg(to_jsonb(by_network)) FROM by_network), '[]'::jsonb),
    'by_browser',    coalesce((SELECT jsonb_agg(to_jsonb(by_browser)) FROM by_browser), '[]'::jsonb),
    'by_os',         coalesce((SELECT jsonb_agg(to_jsonb(by_os)) FROM by_os), '[]'::jsonb),
    'by_device',     coalesce((SELECT jsonb_agg(to_jsonb(by_device)) FROM by_device), '[]'::jsonb),
    'by_hour',       coalesce((SELECT jsonb_agg(to_jsonb(by_hour)) FROM by_hour), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_analytics(INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visitor_analytics(INT, BOOLEAN) TO authenticated;


-- ── 7. Where the visit webhook lives now ────────────────────────────────────
--
-- Same move as the contact webhook in 007, for the same reason:
-- `NEXT_PUBLIC_VISIT_NOTIFIER_URL` is compiled into the public bundle, and a
-- Discord webhook URL is full authority to post in that channel.
--
-- Deduplicated to the first visit of the day per visitor, because a ping on
-- every page view is noise you will mute within a week — and a muted channel
-- tells you nothing.

CREATE OR REPLACE FUNCTION public.notify_site_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  settings integration_settings%ROWTYPE;
  seen     INT;
BEGIN
  IF NEW.is_bot THEN RETURN NEW; END IF;

  SELECT * INTO settings FROM integration_settings WHERE id = 1;
  IF settings.visit_webhook_url IS NULL
     OR settings.visit_webhook_url = ''
     OR NOT settings.notify_on_visit THEN
    RETURN NEW;
  END IF;

  -- First visit of the day for this visitor, or nothing.
  SELECT count(*) INTO seen FROM site_visits
   WHERE visitor_hash = NEW.visitor_hash
     AND id <> NEW.id
     AND created_at >= current_date;
  IF seen > 0 THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := settings.visit_webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
      'username', 'Portfolio',
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', 'New visitor',
        'color', 3447003,
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'Page',    'value', left(NEW.path, 256), 'inline', true),
          jsonb_build_object('name', 'From',    'value', coalesce(NEW.source, 'Direct'), 'inline', true),
          jsonb_build_object('name', 'Where',   'value', coalesce(nullif(concat_ws(', ', NEW.city, NEW.country), ''), 'Unknown'), 'inline', true),
          jsonb_build_object('name', 'Device',  'value', concat_ws(' · ', NEW.browser, NEW.os, NEW.device), 'inline', true)
        ),
        'timestamp', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ))
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'visit notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_site_visit ON site_visits;
CREATE TRIGGER notify_site_visit
  AFTER INSERT ON site_visits
  FOR EACH ROW EXECUTE FUNCTION public.notify_site_visit();

-- =========================================================
-- 10c. FINANCE FOUNDATION
-- =========================================================
-- Multi-currency, accounts, categories, budgets, scenarios.
--
-- Two decisions shape all of it. Rates are frozen at the transaction, so a
-- historical report never re-prices itself when the market moves. And an
-- account balance anchors on a reconciliation rather than a complete ledger,
-- so a credit card whose bill is unknown until it lands stays tractable.
--
-- Note the two vocabularies: `transaction_type` is ('earning','expense') and
-- describes a transaction's direction; `category_bucket` is
-- ('income','need','want','save','transfer') and classifies a category for
-- 50/30/20. Mixing them is a runtime error, not a type error.

-- ── 1. Currency reference ───────────────────────────────────────────────────
--
-- The user's chosen base currency: the one every report totals in. Stored per
-- user rather than per row, because it is a viewing preference — the frozen
-- rates below are what make changing it non-destructive.

CREATE TABLE IF NOT EXISTS finance_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  base_currency     CHAR(3) NOT NULL DEFAULT 'CAD',
  -- The corridor this person actually sends money along, so the FX view has a
  -- default worth showing on first open.
  home_currency     CHAR(3),
  -- 50/30/20 is the default coaching frame; these let it be tuned or ignored.
  needs_target_pct  NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (needs_target_pct BETWEEN 0 AND 100),
  wants_target_pct  NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (wants_target_pct BETWEEN 0 AND 100),
  save_target_pct   NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (save_target_pct BETWEEN 0 AND 100),
  -- Months of essential spending the emergency fund should cover.
  runway_target_months NUMERIC(4,1) NOT NULL DEFAULT 6 CHECK (runway_target_months >= 0),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage finance settings" ON finance_settings;
CREATE POLICY "Admin manage finance settings" ON finance_settings FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_settings_updated_at ON finance_settings;
CREATE TRIGGER update_finance_settings_updated_at BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. Exchange rates ───────────────────────────────────────────────────────
--
-- Quoted against a single base per row so any pair can be crossed as a ratio.
-- NUMERIC(20,10): IDR/KWD is around 0.0000010, and rounding a rate to four
-- places turns a real conversion into a wrong one.
--
-- Publicly readable is deliberate and safe — an ECB reference rate is not
-- anybody's private information, and sharing the cache across the (single)
-- user costs nothing.

CREATE TABLE IF NOT EXISTS fx_rates (
  base   CHAR(3) NOT NULL,
  quote  CHAR(3) NOT NULL,
  as_of  DATE    NOT NULL,
  rate   NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  source TEXT,
  PRIMARY KEY (base, quote, as_of)
);
CREATE INDEX IF NOT EXISTS fx_rates_recent_idx ON fx_rates (base, quote, as_of DESC);
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read fx rates" ON fx_rates;
CREATE POLICY "Read fx rates" ON fx_rates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write fx rates" ON fx_rates;
CREATE POLICY "Admin write fx rates" ON fx_rates FOR ALL
  USING (public.is_aal2()) WITH CHECK (public.is_aal2());


-- ── 3. Accounts ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE account_kind AS ENUM
    ('chequing','savings','credit','cash','investment','loan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS finance_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind         account_kind NOT NULL DEFAULT 'chequing',
  currency     CHAR(3) NOT NULL,
  institution  TEXT CHECK (char_length(coalesce(institution,'')) <= 120),

  -- The reconciliation anchor. "On opening_date this account really held
  -- opening_balance." Everything after is derived from transactions, so
  -- correcting a drifted balance is editing two fields rather than hunting for
  -- a missing row.
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Credit cards only. The limit powers a utilisation warning; the two days
  -- power "your statement lands in 3 days" in the forecast.
  credit_limit    NUMERIC(18,4) CHECK (credit_limit IS NULL OR credit_limit > 0),
  statement_day   INT CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  payment_due_day INT CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),

  -- Excluded from net worth and from "safe to spend", but still ledgered:
  -- a locked retirement account is real money you cannot touch this month.
  is_liquid    BOOLEAN NOT NULL DEFAULT true,
  color        TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  sort_order   INT NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_accounts_user_idx
  ON finance_accounts (user_id, sort_order) WHERE archived_at IS NULL;
ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage accounts" ON finance_accounts;
CREATE POLICY "Admin manage accounts" ON finance_accounts FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_accounts_updated_at ON finance_accounts;
CREATE TRIGGER update_finance_accounts_updated_at BEFORE UPDATE ON finance_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3b. Goal contributions ──────────────────────────────────────────────────
--
-- The history of what was set aside, and where from. Deliberately an *earmark*,
-- not a transfer: money moved into a goal is still in the account, so writing
-- ledger rows for it would double-count against the transactions that earned or
-- spent it. See db/migrations/014.
--
-- HERE, rather than beside `financial_goals` where it reads more naturally,
-- because `account_id` is a foreign key to `finance_accounts` and Postgres
-- resolves that when the table is created. It sat ~1,100 lines earlier for a
-- while, which meant a fresh run of this file failed to create the table at all
-- — and its index, RLS and policy with it. Existing databases were unaffected,
-- having got the table from migration 014 where `finance_accounts` already
-- existed, so nothing ever surfaced it. Guarded now by
-- src/lib/schema-order.test.ts.
CREATE TABLE IF NOT EXISTS finance_goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  -- Nullable, and ON DELETE SET NULL: closing an account must not erase the
  -- history of what was set aside from it.
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  -- Positive puts money aside, negative takes it back out.
  amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  -- The ledger row this produced. Nullable so history survives a transaction
  -- being deleted from the ledger, rather than the contribution vanishing with
  -- it and the goal total then describing nothing.
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_goal_contributions_goal_idx
  ON finance_goal_contributions(goal_id, occurred_on DESC);

ALTER TABLE finance_goal_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage goal contributions" ON finance_goal_contributions;
CREATE POLICY "Admin manage goal contributions" ON finance_goal_contributions
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 4. Categories ───────────────────────────────────────────────────────────
--
-- `category` was free text on every transaction, so "Groceries", "groceries"
-- and "Grocery" were three categories and no budget could be attached to any
-- of them. A real table also carries the one field the coaching needs:
-- `bucket`, which is what makes a 50/30/20 check possible at all.

-- 'income' here is the 50/30/20 vocabulary for classifying a *category*.
-- The existing `transaction_type` enum uses 'earning' for the direction of a
-- *transaction*. They are different things; do not assume one from the other.
DO $$ BEGIN
  CREATE TYPE category_bucket AS ENUM ('income','need','want','save','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS finance_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  bucket      category_bucket NOT NULL DEFAULT 'want',
  icon        TEXT CHECK (char_length(coalesce(icon,'')) <= 40),
  color       TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  -- Essential in the runway sense: what you would still be paying if income
  -- stopped tomorrow. Distinct from `need`, which is about budgeting shape.
  is_essential BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage categories" ON finance_categories;
CREATE POLICY "Admin manage categories" ON finance_categories FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_categories_updated_at ON finance_categories;
CREATE TRIGGER update_finance_categories_updated_at BEFORE UPDATE ON finance_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 5. Transactions gain currency, an account, and a home ───────────────────
--
-- Existing rows keep working: everything added is nullable or defaulted, and a
-- row with no account_id is simply unassigned rather than broken.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id   UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id  UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency     CHAR(3),
  -- Units of base currency per unit of `currency`, on the day of the
  -- transaction. 1 when they are the same. This column is the whole reason a
  -- historical report stays put.
  ADD COLUMN IF NOT EXISTS fx_rate      NUMERIC(20,10) CHECK (fx_rate IS NULL OR fx_rate > 0),
  -- Denormalised `amount * fx_rate`, so every aggregate is a plain SUM instead
  -- of a join to a rate table per row.
  ADD COLUMN IF NOT EXISTS base_amount  NUMERIC(18,4),
  -- Both legs of a transfer share this. A transfer is two rows, not a special
  -- table, so the ledger stays one queryable thing.
  ADD COLUMN IF NOT EXISTS transfer_group UUID,
  -- What the transfer itself cost — wire fee, FX margin. The number that makes
  -- "which service should I send through" answerable.
  ADD COLUMN IF NOT EXISTS fee_amount   NUMERIC(18,4) CHECK (fee_amount IS NULL OR fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS merchant     TEXT CHECK (char_length(coalesce(merchant,'')) <= 200),
  ADD COLUMN IF NOT EXISTS notes        TEXT CHECK (char_length(coalesce(notes,'')) <= 2000),
  -- Pending until it clears the bank. Kept out of "what do I actually have".
  ADD COLUMN IF NOT EXISTS is_pending   BOOLEAN NOT NULL DEFAULT false,
  -- Set when a confirmed recurring occurrence produced this row, so the same
  -- occurrence is never proposed twice.
  ADD COLUMN IF NOT EXISTS occurrence_date DATE;

CREATE INDEX IF NOT EXISTS transactions_account_date_idx
  ON transactions (account_id, date DESC);
CREATE INDEX IF NOT EXISTS transactions_transfer_idx
  ON transactions (transfer_group) WHERE transfer_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_occurrence_idx
  ON transactions (recurring_transaction_id, occurrence_date)
  WHERE recurring_transaction_id IS NOT NULL;

/**
 * Fill currency, rate and base amount on write.
 *
 * Doing this in the database rather than the client means a row inserted from
 * the SQL editor, a CSV import or a future script is as consistent as one typed
 * into the form — and `base_amount` can never disagree with `amount * fx_rate`,
 * which is the kind of drift that makes a total quietly wrong.
 */
CREATE OR REPLACE FUNCTION public.fill_transaction_money()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Named `base_ccy`, not `base`. `fx_rates` has a column called `base`, and a
  -- plpgsql variable of the same name makes every reference to it ambiguous —
  -- which Postgres reports at runtime, from inside a trigger, on the first
  -- transaction anyone saves.
  base_ccy CHAR(3);
BEGIN
  SELECT s.base_currency INTO base_ccy
    FROM finance_settings s WHERE s.user_id = NEW.user_id;
  base_ccy := coalesce(base_ccy, 'CAD');

  IF NEW.currency IS NULL THEN
    -- Inherit the account's currency; fall back to base for an unassigned row.
    SELECT a.currency INTO NEW.currency
      FROM finance_accounts a WHERE a.id = NEW.account_id;
    NEW.currency := coalesce(NEW.currency, base_ccy);
  END IF;

  IF NEW.fx_rate IS NULL THEN
    IF NEW.currency = base_ccy THEN
      NEW.fx_rate := 1;
    ELSE
      -- Most recent rate on or before the transaction date. A rate from after
      -- the fact would be exactly the retro-pricing this design exists to stop.
      SELECT r.rate INTO NEW.fx_rate
        FROM fx_rates r
       WHERE r.base = NEW.currency AND r.quote = base_ccy AND r.as_of <= NEW.date
       ORDER BY r.as_of DESC LIMIT 1;

      IF NEW.fx_rate IS NULL THEN
        -- Only the opposite direction is cached, so invert it.
        SELECT 1 / r.rate INTO NEW.fx_rate
          FROM fx_rates r
         WHERE r.base = base_ccy AND r.quote = NEW.currency AND r.as_of <= NEW.date
         ORDER BY r.as_of DESC LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- No rate available is not an error: the row is worth keeping, and the UI
  -- reports it as unconverted rather than inventing a number.
  IF NEW.fx_rate IS NOT NULL THEN
    NEW.base_amount := round(NEW.amount * NEW.fx_rate, 4);
  ELSE
    NEW.base_amount := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_transaction_money ON transactions;
CREATE TRIGGER fill_transaction_money
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.fill_transaction_money();


-- ── 6. Recurring rules: propose, do not post ────────────────────────────────

ALTER TABLE recurring_transactions
  ADD COLUMN IF NOT EXISTS account_id  UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency    CHAR(3),
  -- Off by default, and that default is the point. A biweekly salary is 1,000
  -- until two days of unpaid leave make it 800, and a utility bill is a guess
  -- until it arrives — so an occurrence is a proposal with the expected amount
  -- pre-filled, and becomes real only when confirmed. Opt in per rule for the
  -- genuinely fixed ones.
  ADD COLUMN IF NOT EXISTS auto_post   BOOLEAN NOT NULL DEFAULT false,
  -- Marks the amount as a typical figure rather than a fixed one, so the
  -- forecast can show a band instead of a false straight line.
  ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes       TEXT CHECK (char_length(coalesce(notes,'')) <= 2000),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- An occurrence deliberately passed over — a month you were not billed, a
-- paycheque that did not come. The only part of the confirm queue that needs
-- storing: everything else is derived from the rules minus what was posted.
CREATE TABLE IF NOT EXISTS recurring_skips (
  recurring_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  due_date     DATE NOT NULL,
  reason       TEXT CHECK (char_length(coalesce(reason,'')) <= 200),
  created_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (recurring_id, due_date)
);
ALTER TABLE recurring_skips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage recurring skips" ON recurring_skips;
CREATE POLICY "Admin manage recurring skips" ON recurring_skips FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 7. Budgets ──────────────────────────────────────────────────────────────
--
-- One row per category per month. `period` is the first of the month, so a
-- budget is addressable without a range query, and last month's number is a
-- fact rather than something recomputed from a "current" budget.

CREATE TABLE IF NOT EXISTS finance_budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category_id UUID NOT NULL REFERENCES finance_categories(id) ON DELETE CASCADE,
  period      DATE NOT NULL,
  amount      NUMERIC(18,4) NOT NULL CHECK (amount >= 0),
  -- Underspend carries into next month rather than evaporating, which is what
  -- makes a budget survive an irregular expense instead of being abandoned.
  rollover    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_id, period),
  CONSTRAINT finance_budgets_period_is_month CHECK (date_trunc('month', period) = period)
);
ALTER TABLE finance_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage budgets" ON finance_budgets;
CREATE POLICY "Admin manage budgets" ON finance_budgets FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_budgets_updated_at ON finance_budgets;
CREATE TRIGGER update_finance_budgets_updated_at BEFORE UPDATE ON finance_budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 8. Scenarios ────────────────────────────────────────────────────────────
--
-- "What if I cut dining by 30%", "what if rent rises 200", "what if I send 500
-- home every month". Adjustments are JSONB because the shape is a union that
-- will grow, and the app validates it — a table per adjustment kind would be
-- three joins to answer one question.

CREATE TABLE IF NOT EXISTS finance_scenarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (char_length(coalesce(description,'')) <= 2000),
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE finance_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage scenarios" ON finance_scenarios;
CREATE POLICY "Admin manage scenarios" ON finance_scenarios FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_scenarios_updated_at ON finance_scenarios;
CREATE TRIGGER update_finance_scenarios_updated_at BEFORE UPDATE ON finance_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 9. Goals gain a currency and a link ─────────────────────────────────────

ALTER TABLE financial_goals
  ADD COLUMN IF NOT EXISTS currency   CHAR(3),
  -- A goal funded by a real account shows real progress instead of a number
  -- you remembered to update.
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind       TEXT CHECK (kind IS NULL OR kind IN ('save','payoff','buffer')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;


-- ── 10. Derived account balance ─────────────────────────────────────────────
--
-- The anchor plus everything since. Written as a function rather than a stored
-- column because a stored balance is a copy of a derivable fact, and it drifts
-- the first time any write path forgets to update it.

CREATE OR REPLACE FUNCTION public.account_balance(
  account UUID,
  as_of   DATE DEFAULT CURRENT_DATE,
  include_pending BOOLEAN DEFAULT false
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(a.opening_balance, 0)
    + coalesce((
        SELECT sum(
          -- `transaction_type` is ('earning','expense') — NOT ('income',...).
          -- `category_bucket` below does use 'income', because it classifies
          -- a category rather than a transaction's direction. Two enums, two
          -- vocabularies, and mixing them is a runtime error not a type one.
          CASE WHEN t.type = 'earning' THEN t.amount ELSE -t.amount END
          - coalesce(t.fee_amount, 0)
        )
        FROM transactions t
        WHERE t.account_id = a.id
          AND t.date >= a.opening_date
          AND t.date <= account_balance.as_of
          AND (include_pending OR NOT t.is_pending)
      ), 0)
  FROM finance_accounts a
  WHERE a.id = account_balance.account
    AND a.user_id = auth.uid()
    -- A plain SQL function has no place for an IF, so the second-factor check
    -- is a predicate: an unverified session matches no row and gets NULL
    -- rather than a balance. Fails closed.
    AND public.is_aal2();
$$;

REVOKE ALL ON FUNCTION public.account_balance(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_balance(UUID, DATE, BOOLEAN) TO authenticated;


-- ── 11. Seed the defaults a new user needs ──────────────────────────────────
--
-- A category list you have to invent from nothing is a module you abandon on
-- day one. `bucket` and `is_essential` are pre-set because they are the fields
-- that make the coaching work, and nobody would guess to fill them in.

CREATE OR REPLACE FUNCTION public.seed_finance_defaults(base CHAR(3) DEFAULT 'CAD')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO finance_settings (user_id, base_currency)
  VALUES (uid, base) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO finance_categories (user_id, name, bucket, is_essential, sort_order)
  VALUES
    (uid, 'Salary',              'income',   false, 10),
    (uid, 'Freelance',           'income',   false, 20),
    (uid, 'Interest',            'income',   false, 25),
    (uid, 'Government benefits', 'income',   false, 26),
    (uid, 'Money received',      'income',   false, 27),
    (uid, 'Cashback & rewards',  'income',   false, 28),
    (uid, 'Rent',                'need',     true,  30),
    (uid, 'Utilities',           'need',     true,  40),
    (uid, 'Groceries',           'need',     true,  50),
    (uid, 'Transport',           'need',     true,  60),
    (uid, 'Phone & internet',    'need',     true,  70),
    (uid, 'Insurance',           'need',     true,  80),
    (uid, 'Healthcare',          'need',     true,  90),
    (uid, 'Bank fees',           'need',     false, 95),
    (uid, 'Government fees',     'need',     false, 96),
    (uid, 'Education',           'need',     false, 97),
    (uid, 'Family support',      'need',     true,  100),
    (uid, 'Dining out',          'want',     false, 110),
    (uid, 'Shopping',            'want',     false, 120),
    (uid, 'Cash',                'want',     false, 125),
    (uid, 'Entertainment',       'want',     false, 130),
    (uid, 'Payments to people',  'want',     false, 135),
    (uid, 'Travel',              'want',     false, 140),
    (uid, 'Subscriptions',       'want',     false, 150),
    (uid, 'Personal care',       'want',     false, 152),
    (uid, 'Alcohol & vape',      'want',     false, 154),
    (uid, 'Pets',                'want',     false, 156),
    (uid, 'Savings',             'save',     false, 160),
    (uid, 'Investments',         'save',     false, 170),
    (uid, 'Debt repayment',      'save',     false, 180),
    (uid, 'Transfer',            'transfer', false, 190)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_defaults(CHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_defaults(CHAR) TO authenticated;

-- =========================================================
-- 10d. CALENDAR
-- =========================================================
-- Calendars, recurrence and a range query that filters on overlap.
--
-- The previous get_calendar_data filtered on start_time::date BETWEEN, so
-- any event spanning a view boundary was invisible from the far side. It
-- also gave summary rows a fresh gen_random_uuid() on every call, and
-- invented clock times for date-only records (tasks 09:00, habits 07:00,
-- transactions 12:00). All three are fixed below.
--
-- Recurring series are returned unexpanded with their rule attached: a
-- weekly 09:00 standup is 09:00 local on both sides of a clock change,
-- which is a property of the viewer's timezone rather than of the row.

-- ── 1. Calendars ────────────────────────────────────────────────────────────
--
-- Colour is stored as a **token name**, not a hex value. The previous module
-- hard-coded nine literals copied from Google Calendar's palette, which do not
-- move with any of the 52 theme presets — the v3 rules forbid exactly that.

CREATE TABLE IF NOT EXISTS calendars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- One of the app's chart tokens, resolved to a real colour at render time.
  color_token TEXT NOT NULL DEFAULT 'chart-1'
              CHECK (color_token ~ '^chart-[1-5]$'),
  is_visible  BOOLEAN NOT NULL DEFAULT true,
  -- Where a new event lands when you do not pick one.
  is_default  BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage calendars" ON calendars;
CREATE POLICY "Admin manage calendars" ON calendars FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_calendars_updated_at ON calendars;
CREATE TRIGGER update_calendars_updated_at BEFORE UPDATE ON calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Only one default at a time, enforced rather than hoped for.
CREATE UNIQUE INDEX IF NOT EXISTS calendars_one_default_idx
  ON calendars (user_id) WHERE is_default;


-- ── 2. Events grow up ───────────────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS calendar_id UUID REFERENCES calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location    TEXT CHECK (char_length(coalesce(location,'')) <= 300),
  -- Its own field rather than a URL buried in the description, so it can be a
  -- button you press thirty seconds before a call.
  ADD COLUMN IF NOT EXISTS meeting_url TEXT CHECK (char_length(coalesce(meeting_url,'')) <= 2048),
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'confirmed'
              CHECK (status IN ('confirmed','tentative','cancelled')),
  /**
   * An RFC 5545 recurrence rule, stored as one string.
   *
   * A rule, not a thousand rows: a weekly standup with no end date is one
   * event, expanded for whatever range is on screen. Materialising occurrences
   * would mean deciding how far into the future to write, and rewriting all of
   * them every time the series is edited.
   *
   * Deliberately a text column with no CHECK. The app parses a focused subset
   * (FREQ, INTERVAL, BYDAY, COUNT, UNTIL) and a constraint here would either
   * duplicate that grammar badly or reject rules a future version understands.
   */
  ADD COLUMN IF NOT EXISTS rrule       TEXT CHECK (char_length(coalesce(rrule,'')) <= 500),
  -- Denormalised stop date, so a range query can skip series that ended.
  ADD COLUMN IF NOT EXISTS recurrence_end DATE,
  -- Overrides the calendar's colour for one event.
  ADD COLUMN IF NOT EXISTS color_token TEXT CHECK (color_token IS NULL OR color_token ~ '^chart-[1-5]$'),
  ADD COLUMN IF NOT EXISTS travel_minutes INT CHECK (travel_minutes IS NULL OR travel_minutes BETWEEN 0 AND 1440),
  ADD COLUMN IF NOT EXISTS reminder_minutes INT CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 40320),
  -- A time block for a task. Completing one completes the other.
  ADD COLUMN IF NOT EXISTS task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- The range query below scans on overlap, so both ends are indexed.
CREATE INDEX IF NOT EXISTS events_range_idx ON events (user_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS events_recurring_idx
  ON events (user_id) WHERE rrule IS NOT NULL;


-- ── 3. Exceptions to a series ───────────────────────────────────────────────
--
-- What lets you skip one standup, or move a single Thursday, without deleting
-- the rule. Keyed by the occurrence's *original* start, because that is the
-- only stable identifier an expanded occurrence has — it is computed from the
-- rule rather than stored.

CREATE TABLE IF NOT EXISTS event_exceptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  /** The start this occurrence would have had, before any override. */
  original_start TIMESTAMPTZ NOT NULL,
  /** True for a deleted occurrence; the override columns are then ignored. */
  is_cancelled   BOOLEAN NOT NULL DEFAULT false,
  new_start      TIMESTAMPTZ,
  new_end        TIMESTAMPTZ,
  new_title      TEXT CHECK (char_length(coalesce(new_title,'')) <= 300),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, original_start)
);
ALTER TABLE event_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage event exceptions" ON event_exceptions;
CREATE POLICY "Admin manage event exceptions" ON event_exceptions FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── 4. Calendar settings ────────────────────────────────────────────────────
--
-- `home_timezone` is the whole reason the week grid has two hour gutters. Same
-- shape as `finance_settings.home_currency`: the module knows you live away
-- from the people you are trying to call.

CREATE TABLE IF NOT EXISTS calendar_settings (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  /** IANA zone, e.g. 'Asia/Kolkata'. Null hides the second gutter entirely. */
  home_timezone  TEXT CHECK (char_length(coalesce(home_timezone,'')) <= 64),
  /** Where the grid starts and stops, so the day is not 24 rows of nothing. */
  day_start_hour INT NOT NULL DEFAULT 7 CHECK (day_start_hour BETWEEN 0 AND 23),
  day_end_hour   INT NOT NULL DEFAULT 22 CHECK (day_end_hour BETWEEN 1 AND 24),
  week_starts_on INT NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  default_view   TEXT NOT NULL DEFAULT 'week'
                 CHECK (default_view IN ('day','week','month','agenda')),
  /** Overlay toggles for the aggregated modules. */
  show_tasks     BOOLEAN NOT NULL DEFAULT true,
  show_habits    BOOLEAN NOT NULL DEFAULT false,
  show_finance   BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT calendar_day_bounds CHECK (day_end_hour > day_start_hour)
);
ALTER TABLE calendar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage calendar settings" ON calendar_settings;
CREATE POLICY "Admin manage calendar settings" ON calendar_settings FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_calendar_settings_updated_at ON calendar_settings;
CREATE TRIGGER update_calendar_settings_updated_at BEFORE UPDATE ON calendar_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 5. The rewritten range query ────────────────────────────────────────────
--
-- Three fixes, described at the top of this file: overlap instead of start
-- date, deterministic ids, and no invented clock times.
--
-- Recurring events are returned as their **series rows**, unexpanded, with the
-- rule attached. Expansion happens on the client, which already knows the
-- viewer's timezone — expanding in Postgres would mean deciding a zone in SQL,
-- and a weekly 09:00 standup is 09:00 local on both sides of a clock change,
-- which is a property of the viewer rather than of the row.

CREATE OR REPLACE FUNCTION public.get_calendar_data(
  start_date_param DATE,
  end_date_param   DATE
)
RETURNS TABLE (
  item_id    TEXT,
  title      TEXT,
  start_time TIMESTAMPTZ,
  end_time   TIMESTAMPTZ,
  item_type  TEXT,
  is_all_day BOOLEAN,
  data       JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  -- AAL2 as well as signed in. SECURITY DEFINER bypasses RLS, and every table
  -- read below is protected by a policy requiring the second factor — so
  -- without this the function hands a password-only session data the policies
  -- would have withheld.
  IF uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  -- Events. Overlap, not start date: an event belongs in the window if it
  -- starts before the window ends and finishes after the window begins.
  -- Recurring series are always returned so the client can expand them.
  SELECT
    e.id::text,
    e.title,
    e.start_time,
    e.end_time,
    'event',
    coalesce(e.is_all_day, false),
    jsonb_build_object(
      'description', e.description,
      'location', e.location,
      'meeting_url', e.meeting_url,
      'calendar_id', e.calendar_id,
      'color_token', e.color_token,
      'status', e.status,
      'rrule', e.rrule,
      'recurrence_end', e.recurrence_end,
      'travel_minutes', e.travel_minutes,
      'reminder_minutes', e.reminder_minutes,
      'task_id', e.task_id
    )
  FROM events e
  WHERE e.user_id = uid
    AND (
      e.rrule IS NOT NULL
        AND (e.recurrence_end IS NULL OR e.recurrence_end >= start_date_param)
        AND e.start_time < (end_date_param + 1)
      OR
      e.rrule IS NULL
        AND e.start_time < (end_date_param + 1)::timestamptz
        AND coalesce(e.end_time, e.start_time) >= start_date_param::timestamptz
    )

  UNION ALL

  -- Tasks with a due date. Returned all-day: a task due Tuesday is not a 9am
  -- appointment, and inventing one put it in a slot it never belonged in.
  SELECT
    'task-' || t.id::text,
    t.title,
    t.due_date::timestamptz,
    NULL,
    'task',
    true,
    jsonb_build_object(
      'status', t.status,
      'priority', t.priority,
      'project_id', t.project_id,
      'estimate_minutes', t.estimate_minutes
    )
  FROM tasks t
  WHERE t.user_id = uid
    AND t.due_date BETWEEN start_date_param AND end_date_param

  UNION ALL

  -- One summary row per day. The id is derived from the kind and the date, so
  -- it is the same object across refetches — usable as a key, selectable, and
  -- scrollable to.
  SELECT
    'habits-' || hl.completed_date::text,
    'Habits',
    hl.completed_date::timestamptz,
    NULL,
    'habit_summary',
    true,
    jsonb_build_object(
      'count', count(*),
      'habits', jsonb_agg(jsonb_build_object('title', h.title, 'color', h.color))
    )
  FROM habit_logs hl
  JOIN habits h ON hl.habit_id = h.id
  WHERE h.user_id = uid
    AND hl.completed_date BETWEEN start_date_param AND end_date_param
  GROUP BY hl.completed_date

  UNION ALL

  -- Money, from the v2 ledger. `fin_day_money` is defined further down, with
  -- the finance v2 tables it reads; a plpgsql body is not resolved until it
  -- runs, so the forward reference is fine here.
  --
  -- The transfer rule that used to live here as `transfer_group IS NULL` now
  -- lives in that function, where the dashboard gets it too — the two used to
  -- disagree about the same day.
  SELECT
    'finance-' || m.day::text,
    'Money',
    m.day::timestamptz,
    NULL,
    'transaction_summary',
    true,
    jsonb_build_object(
      'count', m.entries,
      'earned', m.earned,
      'spent', m.spent
    )
  FROM public.fin_day_money(start_date_param, end_date_param) m;
END;
$$;

REVOKE ALL ON FUNCTION public.get_calendar_data(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_data(DATE, DATE) TO authenticated;


-- ── 6. Starter calendars ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_calendar_defaults(home_tz TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO calendar_settings (user_id, home_timezone)
  VALUES (uid, home_tz) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO calendars (user_id, name, color_token, is_default, sort_order)
  VALUES
    (uid, 'Personal', 'chart-1', true,  10),
    (uid, 'Work',     'chart-2', false, 20),
    (uid, 'Family',   'chart-3', false, 30),
    (uid, 'Health',   'chart-4', false, 40)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Existing events predate calendars; file them under the default rather than
  -- leaving them ungrouped and invisible to a calendar filter.
  UPDATE events e
     SET calendar_id = (
       SELECT c.id FROM calendars c
        WHERE c.user_id = uid AND c.is_default LIMIT 1
     )
   WHERE e.user_id = uid AND e.calendar_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_calendar_defaults(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_calendar_defaults(TEXT) TO authenticated;

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

-- Items within one section, the same way (migration 024). Invoker rights, so
-- row-level security on portfolio_items still decides who may write.
CREATE OR REPLACE FUNCTION public.update_item_order(section_uuid UUID, item_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  FOR i IN 1..coalesce(array_length(item_ids, 1), 0) LOOP
    UPDATE portfolio_items
       SET display_order = i
     WHERE id = item_ids[i]
       AND section_id = section_uuid;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_item_order(UUID, UUID[]) TO authenticated;

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
-- Analytics Overview
CREATE OR REPLACE FUNCTION get_analytics_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned: a definer function resolves unqualified names through the caller's
-- search_path, so anyone able to create an object earlier in it could have
-- theirs used instead.
SET search_path = public, auth
AS $$
DECLARE
  analytics_data JSONB;
  current_user_id UUID := auth.uid();
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the AAL2 check the policies would have
  -- applied has to be made here. Without it this read was a way around the
  -- mandatory second factor.
  IF current_user_id IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

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
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- These write to tables whose policies require AAL2, and SECURITY DEFINER
  -- bypasses those policies — so without this an unverified session could
  -- rewrite categories across the whole ledger.
  IF auth.uid() IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE transactions SET category = new_name WHERE user_id = auth.uid() AND category = old_name;
  UPDATE recurring_transactions SET category = new_name WHERE user_id = auth.uid() AND category = old_name;
END;
$$;

CREATE OR REPLACE FUNCTION merge_transaction_categories(source_name TEXT, target_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- These write to tables whose policies require AAL2, and SECURITY DEFINER
  -- bypasses those policies — so without this an unverified session could
  -- rewrite categories across the whole ledger.
  IF auth.uid() IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE transactions SET category = target_name WHERE user_id = auth.uid() AND category = source_name;
  UPDATE recurring_transactions SET category = target_name WHERE user_id = auth.uid() AND category = source_name;
END;
$$;

CREATE OR REPLACE FUNCTION delete_transaction_category(category_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- These write to tables whose policies require AAL2, and SECURITY DEFINER
  -- bypasses those policies — so without this an unverified session could
  -- rewrite categories across the whole ledger.
  IF auth.uid() IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

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


-- =========================================================
-- 12. DISCOVER  (migration 012)
-- =========================================================
--
-- Two small tables behind a module that reads from public APIs. Nothing
-- fetched is stored: these rows are only *what to ask for*. Caching a forecast
-- would mean deciding when it goes stale, and a stale forecast is worse than
-- none.
--
-- Keyless services only. This app is a static export with no server, so any
-- API key would travel as NEXT_PUBLIC_* and be compiled into the JavaScript
-- bundle, readable by anyone who opens the page.

-- ── Places ──────────────────────────────────────────────────────────────────
--
-- Two is the interesting number: where you are, and where the people you left
-- behind are. The calendar already carries a home timezone for the same
-- reason.

CREATE TABLE IF NOT EXISTS discover_places (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  label      TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  -- Stored to four decimal places' worth of precision, which is about 11
  -- metres — far more than a forecast resolves to, and enough that the
  -- constraint is about validity rather than accuracy.
  latitude   NUMERIC(8,4) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude  NUMERIC(9,4) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  -- An IANA zone name, so the forecast can be read in the place's own clock
  -- rather than the viewer's.
  timezone   TEXT CHECK (char_length(coalesce(timezone,'')) <= 64),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE discover_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage discover places" ON discover_places;
CREATE POLICY "Admin manage discover places" ON discover_places FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS discover_places_user_idx
  ON discover_places (user_id, sort_order);

-- ── Topics ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discover_topics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- What to search for. Sent verbatim as a query parameter, so it is bounded
  -- here as well as escaped at the call site.
  term       TEXT NOT NULL CHECK (char_length(term) BETWEEN 1 AND 80),
  -- Which service answers for this topic. A CHECK rather than an enum: adding
  -- a source should be a migration, not a type change across two schemas.
  source     TEXT NOT NULL DEFAULT 'hackernews'
             CHECK (source IN ('hackernews', 'devto')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- The same term twice from the same source is two identical panels.
  CONSTRAINT discover_topics_unique UNIQUE (user_id, term, source)
);

ALTER TABLE discover_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage discover topics" ON discover_topics;
CREATE POLICY "Admin manage discover topics" ON discover_topics FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

CREATE INDEX IF NOT EXISTS discover_topics_user_idx
  ON discover_topics (user_id, sort_order);

-- =========================================================
-- LIBRARY — what you read and watch, and the lines worth keeping
-- =========================================================
-- Neither table has a public read policy; visitors reach one random public
-- highlight through get_random_public_highlight() and nothing else. See
-- db/migrations/018.

CREATE TABLE IF NOT EXISTS library_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- CHECK rather than an enum: adding a kind should be a migration, not a type
  -- change across two schemas. Same reasoning as `discover_topics.source`.
  kind TEXT NOT NULL DEFAULT 'book'
    CHECK (kind IN ('book', 'article', 'video', 'podcast', 'other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- Author, channel or host. One column for all of them: the reader asks
  -- "who made this", and splitting it by kind would be three nullable columns
  -- answering the same question.
  creator TEXT CHECK (creator IS NULL OR char_length(creator) <= 200),
  url TEXT CHECK (url IS NULL OR char_length(url) <= 2048),
  status TEXT NOT NULL DEFAULT 'want'
    CHECK (status IN ('want', 'in_progress', 'done', 'abandoned')),
  rating INT2 CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  started_on DATE,
  finished_on DATE,
  -- Finishing before starting is a typo, and it would make any "how long did
  -- this take" figure negative.
  CONSTRAINT library_sources_dates_ordered
    CHECK (finished_on IS NULL OR started_on IS NULL OR finished_on >= started_on),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_sources_status_idx
  ON library_sources (user_id, status, updated_at DESC);

ALTER TABLE library_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage library sources" ON library_sources;
CREATE POLICY "Admin manage library sources" ON library_sources FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

DROP TRIGGER IF EXISTS update_library_sources_updated_at ON library_sources;
CREATE TRIGGER update_library_sources_updated_at
  BEFORE UPDATE ON library_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Highlights
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS library_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- ON DELETE SET NULL, not CASCADE: deleting a source must not take the
  -- lines you kept from it. The admin names how many will lose their source
  -- before it lets you delete one.
  source_id UUID REFERENCES library_sources(id) ON DELETE SET NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  -- For a line with no source record — something heard once, or a quote you
  -- only know the speaker of.
  attribution TEXT CHECK (attribution IS NULL OR char_length(attribution) <= 200),
  -- "p. 42", "ch. 3", "12:34". Free text because a Kindle location, a page
  -- and a timestamp are all legitimate and none of them is a number.
  location TEXT CHECK (location IS NULL OR char_length(location) <= 50),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_highlights_source_idx
  ON library_highlights (source_id);

-- Matches the one query a visitor can cause, and is tiny because most rows are
-- private.
CREATE INDEX IF NOT EXISTS library_highlights_public_idx
  ON library_highlights (id)
  WHERE is_public;

ALTER TABLE library_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage library highlights" ON library_highlights;
CREATE POLICY "Admin manage library highlights" ON library_highlights FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

DROP TRIGGER IF EXISTS update_library_highlights_updated_at ON library_highlights;
CREATE TRIGGER update_library_highlights_updated_at
  BEFORE UPDATE ON library_highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- The one thing a visitor can read
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER because visitors have no policy on either table. It is
-- listed in `db-security.test.ts` as deliberately not requiring AAL2 — a
-- signed-out visitor is the intended caller — and it is safe to expose for the
-- same reason: it returns only rows the owner marked public, and only the
-- columns a citation needs.
--
-- VOLATILE because of random(): each call must make its own pick, and a
-- STABLE declaration would license the planner to reuse one answer.
CREATE OR REPLACE FUNCTION public.get_random_public_highlight()
RETURNS TABLE (
  id UUID,
  text TEXT,
  attribution TEXT,
  location TEXT,
  source_title TEXT,
  source_creator TEXT,
  source_kind TEXT,
  source_url TEXT
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.id, h.text, h.attribution, h.location,
         s.title, s.creator, s.kind, s.url
    FROM library_highlights h
    LEFT JOIN library_sources s ON s.id = h.source_id
   WHERE h.is_public
   ORDER BY random()
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_random_public_highlight() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_random_public_highlight() TO anon, authenticated;

-- ============================================================================
-- FINANCE — LOANS (migration 020)
-- ============================================================================
-- Terms on the loan; rate changes and prepayments as events; the schedule is
-- derived on the client. See db/migrations/020-finance-loans.sql.

CREATE TABLE IF NOT EXISTS finance_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  lender TEXT CHECK (lender IS NULL OR char_length(lender) <= 120),
  -- The loan's own currency, which need not be the base (an INR loan held by
  -- someone budgeting in CAD). An ISO 4217 code, never a symbol.
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  principal NUMERIC(16, 2) NOT NULL CHECK (principal > 0),
  -- Annual percentage rate at the start, e.g. 8.500.
  annual_rate NUMERIC(6, 3) NOT NULL CHECK (annual_rate >= 0 AND annual_rate <= 100),
  tenure_months INT NOT NULL CHECK (tenure_months BETWEEN 1 AND 600),
  first_emi_date DATE NOT NULL,
  rate_type TEXT NOT NULL DEFAULT 'floating' CHECK (rate_type IN ('fixed', 'floating')),
  -- What a rate change does by default. Indian lenders usually hold the EMI
  -- and move the tenure; some move the EMI. Each event may override it.
  on_rate_change TEXT NOT NULL DEFAULT 'tenure' CHECK (on_rate_change IN ('tenure', 'emi')),
  -- Where the EMI is paid from — an NRO/NRE account, or a Canadian chequing
  -- account through a remittance. Nullable: closing the account must not
  -- delete the loan.
  pay_from_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  -- What the EMI forecasts under.
  category_id UUID REFERENCES finance_categories(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage loans" ON finance_loans;
CREATE POLICY "Admin manage loans" ON finance_loans
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_loans_updated_at ON finance_loans;
CREATE TRIGGER update_finance_loans_updated_at BEFORE UPDATE ON finance_loans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS finance_loan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  loan_id UUID NOT NULL REFERENCES finance_loans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rate_change', 'prepayment')),
  effective_date DATE NOT NULL,
  rate NUMERIC(6, 3) CHECK (rate IS NULL OR (rate >= 0 AND rate <= 100)),
  amount NUMERIC(16, 2) CHECK (amount IS NULL OR amount > 0),
  -- Tenure: keep the EMI, finish sooner or later. EMI: keep the end date,
  -- change the instalment.
  effect TEXT CHECK (effect IS NULL OR effect IN ('tenure', 'emi')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- A rate change without a rate, or a prepayment without an amount, is a row
  -- that does nothing — reject it rather than store dead data.
  CONSTRAINT finance_loan_events_complete CHECK (
    (kind = 'rate_change' AND rate IS NOT NULL) OR
    (kind = 'prepayment' AND amount IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS finance_loan_events_loan_idx
  ON finance_loan_events(loan_id, effective_date);

ALTER TABLE finance_loan_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage loan events" ON finance_loan_events;
CREATE POLICY "Admin manage loan events" ON finance_loan_events
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

-- ============================================================================
-- FINANCE — STATEMENT IMPORT (migration 021)
-- ============================================================================
-- Batches, fingerprints, learned rules, and the atomic import/undo RPCs.
-- See db/migrations/021-finance-import.sql.

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) <= 255),
  format TEXT NOT NULL CHECK (char_length(format) BETWEEN 1 AND 40),
  rows_in_file INT NOT NULL DEFAULT 0 CHECK (rows_in_file >= 0),
  rows_imported INT NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
  rows_skipped INT NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
  date_from DATE,
  date_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_import_batches_user_idx
  ON finance_import_batches(user_id, created_at DESC);

ALTER TABLE finance_import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage import batches" ON finance_import_batches;
CREATE POLICY "Admin manage import batches" ON finance_import_batches
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

ALTER TABLE transactions
  -- Deterministic per (account, date, amount, description, nth identical row
  -- in the file). Null for anything not imported.
  ADD COLUMN IF NOT EXISTS import_hash TEXT
    CHECK (import_hash IS NULL OR char_length(import_hash) <= 64),
  ADD COLUMN IF NOT EXISTS import_batch_id UUID
    REFERENCES finance_import_batches(id) ON DELETE SET NULL,
  -- The bank's own wording, kept verbatim: the description shown is cleaned,
  -- and the original is what a rule or a later re-classification reads.
  ADD COLUMN IF NOT EXISTS raw_description TEXT
    CHECK (raw_description IS NULL OR char_length(raw_description) <= 500);

-- Not partial: `ON CONFLICT` needs a plain unique index to target, and NULLs
-- are distinct in a unique index, so hand-entered rows never collide.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_hash_idx
  ON transactions(user_id, account_id, import_hash);
CREATE INDEX IF NOT EXISTS transactions_import_batch_idx
  ON transactions(import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Which account a multi-account export's rows belong to: RBC puts the account
-- number on every row, CIBC puts the card number on card rows. Only the last
-- four digits are kept.
ALTER TABLE finance_accounts
  ADD COLUMN IF NOT EXISTS import_ref TEXT
    CHECK (import_ref IS NULL OR import_ref ~ '^[0-9]{2,6}$');

CREATE TABLE IF NOT EXISTS finance_category_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- A normalised merchant key ("LOBLAWS", "ETRANSFER JOHN DOE").
  pattern TEXT NOT NULL CHECK (char_length(pattern) BETWEEN 2 AND 120),
  category_id UUID REFERENCES finance_categories(id) ON DELETE CASCADE,
  -- 'transfer' marks the merchant as money moving between your own accounts.
  kind TEXT NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense', 'income', 'transfer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pattern)
);

ALTER TABLE finance_category_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage category rules" ON finance_category_rules;
CREATE POLICY "Admin manage category rules" ON finance_category_rules
  FOR ALL USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_finance_category_rules_updated_at ON finance_category_rules;
CREATE TRIGGER update_finance_category_rules_updated_at BEFORE UPDATE ON finance_category_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Importing, atomically ───────────────────────────────────────────────────
--
-- p_rows: [{ date, description, raw_description, merchant, amount (> 0),
--            type ('earning'|'expense'), category_id, import_hash,
--            pair_with (an existing transaction id: the other leg of a
--            transfer between your own accounts) }]
-- p_rules: [{ pattern, category_id, kind }]
CREATE OR REPLACE FUNCTION public.import_transactions(
  p_account_id UUID,
  p_file_name TEXT,
  p_format TEXT,
  p_rows_in_file INT,
  p_rows JSONB,
  p_rules JSONB DEFAULT '[]'::jsonb,
  p_import_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_batch    UUID;
  v_row      JSONB;
  v_new_id   UUID;
  v_category UUID;
  v_pair     UUID;
  v_group    UUID;
  v_inserted INT := 0;
  v_paired   INT := 0;
  v_total    INT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM finance_accounts WHERE id = p_account_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Rows must be a list';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total > 5000 THEN
    RAISE EXCEPTION 'At most 5000 rows per import';
  END IF;

  INSERT INTO finance_import_batches
    (user_id, account_id, file_name, format, rows_in_file)
  VALUES
    (v_uid, p_account_id, left(p_file_name, 255), left(p_format, 40),
     greatest(coalesce(p_rows_in_file, 0), 0))
  RETURNING id INTO v_batch;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_category := NULLIF(v_row->>'category_id', '')::uuid;
    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance_categories WHERE id = v_category AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    v_new_id := NULL;
    INSERT INTO transactions (
      user_id, account_id, date, description, raw_description, merchant,
      amount, type, category_id, category, import_hash, import_batch_id
    )
    VALUES (
      v_uid,
      p_account_id,
      (v_row->>'date')::date,
      left(coalesce(NULLIF(v_row->>'description', ''), 'Imported'), 200),
      left(v_row->>'raw_description', 500),
      left(NULLIF(v_row->>'merchant', ''), 200),
      (v_row->>'amount')::numeric,
      (v_row->>'type')::transaction_type,
      v_category,
      (SELECT name FROM finance_categories WHERE id = v_category),
      left(v_row->>'import_hash', 64),
      v_batch
    )
    ON CONFLICT (user_id, account_id, import_hash) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;

      -- The other leg of a transfer between your own accounts, already in
      -- the ledger from another account. Only an unpaired row of the
      -- caller's, in a different account, can be claimed.
      v_pair := NULLIF(v_row->>'pair_with', '')::uuid;
      IF v_pair IS NOT NULL THEN
        v_group := gen_random_uuid();
        UPDATE transactions
           SET transfer_group = v_group,
               category_id = coalesce(v_category, category_id),
               category = coalesce(
                 (SELECT name FROM finance_categories WHERE id = v_category),
                 category)
         WHERE id = v_pair
           AND user_id = v_uid
           AND transfer_group IS NULL
           AND account_id IS DISTINCT FROM p_account_id;
        IF FOUND THEN
          UPDATE transactions SET transfer_group = v_group WHERE id = v_new_id;
          v_paired := v_paired + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Rules learned from this import's corrections. A category that is not the
  -- caller's is dropped rather than failing the import.
  INSERT INTO finance_category_rules (user_id, pattern, category_id, kind)
  SELECT v_uid,
         left(r->>'pattern', 120),
         NULLIF(r->>'category_id', '')::uuid,
         coalesce(NULLIF(r->>'kind', ''), 'expense')
    FROM jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) AS r
   WHERE char_length(coalesce(r->>'pattern', '')) >= 2
     AND (
       NULLIF(r->>'category_id', '') IS NULL
       OR EXISTS (
         SELECT 1 FROM finance_categories c
          WHERE c.id = (r->>'category_id')::uuid AND c.user_id = v_uid
       )
     )
  ON CONFLICT (user_id, pattern) DO UPDATE
     SET category_id = EXCLUDED.category_id,
         kind = EXCLUDED.kind,
         updated_at = now();

  IF p_import_ref IS NOT NULL AND p_import_ref ~ '^[0-9]{2,6}$' THEN
    UPDATE finance_accounts SET import_ref = p_import_ref
     WHERE id = p_account_id AND user_id = v_uid;
  END IF;

  UPDATE finance_import_batches
     SET rows_imported = v_inserted,
         rows_skipped = greatest(v_total - v_inserted, 0),
         date_from = (SELECT min((r->>'date')::date) FROM jsonb_array_elements(p_rows) r),
         date_to = (SELECT max((r->>'date')::date) FROM jsonb_array_elements(p_rows) r)
   WHERE id = v_batch;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'inserted', v_inserted,
    'skipped', greatest(v_total - v_inserted, 0),
    'paired', v_paired
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_transactions(UUID, TEXT, TEXT, INT, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transactions(UUID, TEXT, TEXT, INT, JSONB, JSONB, TEXT) TO authenticated;

-- ── Undoing one ─────────────────────────────────────────────────────────────
-- Deletes the batch's rows, and unpairs the transfer legs in other accounts
-- that this import had claimed — they were unpaired before it, so they are
-- again after.
CREATE OR REPLACE FUNCTION public.undo_import(p_batch_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM finance_import_batches WHERE id = p_batch_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Import not found';
  END IF;

  UPDATE transactions t
     SET transfer_group = NULL
   WHERE t.user_id = v_uid
     AND t.import_batch_id IS DISTINCT FROM p_batch_id
     AND t.transfer_group IN (
       SELECT transfer_group FROM transactions
        WHERE import_batch_id = p_batch_id
          AND user_id = v_uid
          AND transfer_group IS NOT NULL
     );

  DELETE FROM transactions WHERE import_batch_id = p_batch_id AND user_id = v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM finance_import_batches WHERE id = p_batch_id AND user_id = v_uid;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.undo_import(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_import(UUID) TO authenticated;

-- ============================================================================
-- FINANCE — IMPROVING IMPORTED TRANSACTIONS (migrations 022, 023)
-- ============================================================================

-- p_updates: [{ id, category_id?, description?, merchant?, pair_with? }]
-- A key that is absent leaves that column alone; category_id null clears it.
CREATE OR REPLACE FUNCTION public.recategorise_transactions(p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_row     JSONB;
  v_id      UUID;
  v_cat     UUID;
  v_rule    UUID;
  v_pair    UUID;
  v_group   UUID;
  v_updated INT := 0;
  v_paired  INT := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'Updates must be a list';
  END IF;
  IF jsonb_array_length(p_updates) > 5000 THEN
    RAISE EXCEPTION 'At most 5000 changes at once';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    v_id := (v_row->>'id')::uuid;
    v_cat := NULLIF(v_row->>'category_id', '')::uuid;
    v_rule := NULLIF(v_row->>'recurring_transaction_id', '')::uuid;

    IF v_cat IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM finance_categories WHERE id = v_cat AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    IF v_rule IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM recurring_transactions WHERE id = v_rule AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Recurring rule not found';
    END IF;

    UPDATE transactions
       SET category_id = CASE WHEN v_row ? 'category_id' THEN v_cat ELSE category_id END,
           category = CASE
             WHEN v_row ? 'category_id' THEN (SELECT name FROM finance_categories WHERE id = v_cat)
             ELSE category END,
           description = coalesce(left(NULLIF(v_row->>'description', ''), 200), description),
           merchant = CASE
             WHEN v_row ? 'merchant' THEN left(NULLIF(v_row->>'merchant', ''), 200)
             ELSE merchant END,
           recurring_transaction_id = CASE
             WHEN v_row ? 'recurring_transaction_id' THEN v_rule
             ELSE recurring_transaction_id END,
           occurrence_date = CASE
             WHEN v_row ? 'recurring_transaction_id' AND v_rule IS NOT NULL THEN coalesce(occurrence_date, date)
             ELSE occurrence_date END
     WHERE id = v_id AND user_id = v_uid;
    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;

    -- The other leg of a transfer: both the caller's, both unpaired, in two
    -- different accounts — or nothing happens.
    v_pair := NULLIF(v_row->>'pair_with', '')::uuid;
    IF v_pair IS NOT NULL AND v_pair <> v_id AND (
      SELECT count(*) FROM transactions
       WHERE id IN (v_id, v_pair) AND user_id = v_uid AND transfer_group IS NULL
    ) = 2 AND (
      SELECT count(DISTINCT account_id) FROM transactions
       WHERE id IN (v_id, v_pair) AND account_id IS NOT NULL
    ) = 2 THEN
      v_group := gen_random_uuid();
      UPDATE transactions SET transfer_group = v_group WHERE id IN (v_id, v_pair);
      v_paired := v_paired + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'paired', v_paired);
END;
$$;

REVOKE ALL ON FUNCTION public.recategorise_transactions(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recategorise_transactions(JSONB) TO authenticated;

-- ============================================================================
-- FINANCE v2 — LEDGER, COMMITMENTS, PLANNING (migrations 025, 026, 027, 030)
-- ============================================================================
--
-- The finance rewrite. Money is BIGINT minor units everywhere (1234 = $12.34),
-- a transfer is one transaction with two postings rather than two rows sharing
-- a group id, and one table holds everything that repeats — so a mortgage
-- cannot exist as both a loan and a recurring rule and be counted twice.
--
-- These tables live ALONGSIDE the v1 finance tables above. v1 is dropped by
-- `db/migrations/029-finance-v1-retire.sql`, which is a separate decision the
-- owner makes after the backfill has been verified and the app used against v2;
-- until then both schemas exist and this file describes both.
--
-- Provenance: 025 (ledger), 026 (commitments), 027 (budgets/goals/scenarios/
-- imports), 030 (atomic write RPCs). 028 is the backfill and carries no DDL.


-- ── Currencies, and how many minor units each has ───────────────────────────
--
-- A reference table rather than a client-side constant, because the database
-- has to be able to check what a stored integer means: 1234 is ¥1,234 or
-- 1.234 KWD or $12.34 depending only on this row.
-- `src/features/finance/money/minor-units.ts` mirrors it.

CREATE TABLE IF NOT EXISTS fin_currency (
  code     CHAR(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  exponent SMALLINT NOT NULL CHECK (exponent BETWEEN 0 AND 4),
  name     TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60)
);

ALTER TABLE fin_currency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read currencies" ON fin_currency;
CREATE POLICY "Read currencies" ON fin_currency FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write currencies" ON fin_currency;
CREATE POLICY "Admin write currencies" ON fin_currency FOR ALL
  USING (public.is_aal2()) WITH CHECK (public.is_aal2());

INSERT INTO fin_currency (code, exponent, name) VALUES
  ('CAD', 2, 'Canadian Dollar'),      ('USD', 2, 'US Dollar'),
  ('INR', 2, 'Indian Rupee'),         ('EUR', 2, 'Euro'),
  ('GBP', 2, 'Pound Sterling'),       ('AUD', 2, 'Australian Dollar'),
  ('NZD', 2, 'New Zealand Dollar'),   ('AED', 2, 'UAE Dirham'),
  ('SAR', 2, 'Saudi Riyal'),          ('QAR', 2, 'Qatari Riyal'),
  ('KWD', 3, 'Kuwaiti Dinar'),        ('SGD', 2, 'Singapore Dollar'),
  ('HKD', 2, 'Hong Kong Dollar'),     ('JPY', 0, 'Japanese Yen'),
  ('CNY', 2, 'Chinese Yuan'),         ('CHF', 2, 'Swiss Franc'),
  ('SEK', 2, 'Swedish Krona'),        ('NOK', 2, 'Norwegian Krone'),
  ('DKK', 2, 'Danish Krone'),         ('PLN', 2, 'Polish Zloty'),
  ('TRY', 2, 'Turkish Lira'),         ('PKR', 2, 'Pakistani Rupee'),
  ('BDT', 2, 'Bangladeshi Taka'),     ('LKR', 2, 'Sri Lankan Rupee'),
  ('NPR', 2, 'Nepalese Rupee'),       ('PHP', 2, 'Philippine Peso'),
  ('MYR', 2, 'Malaysian Ringgit'),    ('THB', 2, 'Thai Baht'),
  ('IDR', 2, 'Indonesian Rupiah'),    ('VND', 0, 'Vietnamese Dong'),
  ('MXN', 2, 'Mexican Peso'),         ('BRL', 2, 'Brazilian Real'),
  ('ZAR', 2, 'South African Rand'),   ('NGN', 2, 'Nigerian Naira'),
  ('KES', 2, 'Kenyan Shilling'),      ('EGP', 2, 'Egyptian Pound')
ON CONFLICT (code) DO UPDATE
  SET exponent = EXCLUDED.exponent, name = EXCLUDED.name;


-- ── Settings ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_settings (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  base_currency        CHAR(3) NOT NULL DEFAULT 'CAD' REFERENCES fin_currency(code),
  -- The corridor money is actually sent along, for the FX view's default.
  home_currency        CHAR(3) REFERENCES fin_currency(code),
  needs_target_pct     NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (needs_target_pct BETWEEN 0 AND 100),
  wants_target_pct     NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (wants_target_pct BETWEEN 0 AND 100),
  save_target_pct      NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (save_target_pct BETWEEN 0 AND 100),
  runway_target_months NUMERIC(4,1) NOT NULL DEFAULT 6 CHECK (runway_target_months >= 0),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin settings" ON fin_settings;
CREATE POLICY "Admin manage fin settings" ON fin_settings FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_settings_updated_at ON fin_settings;
CREATE TRIGGER update_fin_settings_updated_at BEFORE UPDATE ON fin_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── Exchange rates ──────────────────────────────────────────────────────────
--
-- A rate stays NUMERIC. Only *amounts* are integers; a rate is a ratio, and
-- storing it as an integer would need a scale factor nobody would remember.
-- NUMERIC(20,10) because IDR/KWD is around 0.0000010.

CREATE TABLE IF NOT EXISTS fin_rate (
  base   CHAR(3) NOT NULL,
  quote  CHAR(3) NOT NULL,
  as_of  DATE    NOT NULL,
  rate   NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  source TEXT CHECK (source IS NULL OR char_length(source) <= 60),
  PRIMARY KEY (base, quote, as_of)
);
CREATE INDEX IF NOT EXISTS fin_rate_recent_idx ON fin_rate (base, quote, as_of DESC);
ALTER TABLE fin_rate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read fin rates" ON fin_rate;
CREATE POLICY "Read fin rates" ON fin_rate FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write fin rates" ON fin_rate;
CREATE POLICY "Admin write fin rates" ON fin_rate FOR ALL
  USING (public.is_aal2()) WITH CHECK (public.is_aal2());


-- ── Accounts ────────────────────────────────────────────────────────────────
--
-- The reconciliation anchor: "on opening_date this account really held
-- opening_balance_minor", and everything after is derived from postings. That
-- is what makes the module work for a credit card whose bill is unknown until
-- it lands — correcting a drifted balance is editing two fields.

DO $$ BEGIN
  CREATE TYPE fin_account_kind AS ENUM
    ('chequing','savings','credit','cash','investment','loan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_account (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind         fin_account_kind NOT NULL DEFAULT 'chequing',
  currency     CHAR(3) NOT NULL REFERENCES fin_currency(code),
  institution  TEXT CHECK (char_length(coalesce(institution,'')) <= 120),

  -- Minor units, and signed: a card or a loan is stored as what is owed.
  opening_balance_minor BIGINT NOT NULL DEFAULT 0,
  opening_date          DATE NOT NULL DEFAULT CURRENT_DATE,

  credit_limit_minor BIGINT CHECK (credit_limit_minor IS NULL OR credit_limit_minor > 0),
  statement_day      INT CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  payment_due_day    INT CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),

  -- Counted in "safe to spend"; a locked retirement account is not.
  is_liquid    BOOLEAN NOT NULL DEFAULT true,
  -- Last digits of the account number, to route rows in a bank export.
  import_ref   TEXT CHECK (import_ref IS NULL OR import_ref ~ '^[0-9]{2,6}$'),
  color        TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  sort_order   INT NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_account_user_idx
  ON fin_account (user_id, sort_order) WHERE archived_at IS NULL;
ALTER TABLE fin_account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin accounts" ON fin_account;
CREATE POLICY "Admin manage fin accounts" ON fin_account FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_account_updated_at ON fin_account;
CREATE TRIGGER update_fin_account_updated_at BEFORE UPDATE ON fin_account
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── Categories ──────────────────────────────────────────────────────────────
--
-- Two vocabularies kept genuinely apart. `bucket` classifies a *category* for
-- 50/30/20. Direction is a property of a *posting's sign*, so there is no
-- longer an 'earning'/'expense' type to confuse with 'income'.

DO $$ BEGIN
  CREATE TYPE fin_bucket AS ENUM ('income','need','want','save','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_category (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  bucket       fin_bucket NOT NULL DEFAULT 'want',
  icon         TEXT CHECK (char_length(coalesce(icon,'')) <= 40),
  color        TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  -- Essential in the runway sense: still payable if income stopped tomorrow.
  -- Deliberately distinct from `need`, which is about budgeting shape.
  is_essential BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE fin_category ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin categories" ON fin_category;
CREATE POLICY "Admin manage fin categories" ON fin_category FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_category_updated_at ON fin_category;
CREATE TRIGGER update_fin_category_updated_at BEFORE UPDATE ON fin_category
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── Transactions and postings ───────────────────────────────────────────────
--
-- The header says what happened once; the postings say what moved, and where.
--
-- A SPEND is one posting: −4500 on Chequing. Its counterparty is the outside
-- world, so it does not balance and is not expected to.
--
-- A TRANSFER is one transaction with two postings — −50000 on TFSA, +50000 on
-- RRSP — atomic by construction. There is no way to write half of one.
--
-- A CROSS-CURRENCY TRANSFER carries both real amounts (−1000 CAD, +60240 INR).
-- They cannot net to zero and must not be forced to: the gap *is* the
-- provider's margin.

DO $$ BEGIN
  CREATE TYPE fin_transaction_kind AS ENUM
    ('spend','earn','transfer','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_transaction (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- When it hit the account, which is not necessarily when it was due.
  date            DATE NOT NULL,
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  -- The bank's own wording, verbatim; `description` is the cleaned form.
  raw_description TEXT CHECK (raw_description IS NULL OR char_length(raw_description) <= 500),
  merchant        TEXT CHECK (merchant IS NULL OR char_length(merchant) <= 200),
  notes           TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  -- Intent, for display and for the calendar. The arithmetic never reads it:
  -- direction comes from the sign of each posting.
  kind            fin_transaction_kind NOT NULL DEFAULT 'spend',
  -- Not yet cleared the bank; excluded from "what do I actually have".
  is_pending      BOOLEAN NOT NULL DEFAULT false,
  -- The occurrence this satisfied, which is the *due* date and not `date`: a
  -- salary due Friday and entered Monday is still Friday's occurrence.
  commitment_id   UUID,
  occurrence_date DATE,
  -- Deterministic per (account, date, amount, description, nth identical row).
  import_hash     TEXT CHECK (import_hash IS NULL OR char_length(import_hash) <= 64),
  import_batch_id UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_transaction_user_date_idx
  ON fin_transaction (user_id, date DESC);
CREATE INDEX IF NOT EXISTS fin_transaction_occurrence_idx
  ON fin_transaction (commitment_id, occurrence_date)
  WHERE commitment_id IS NOT NULL;

ALTER TABLE fin_transaction ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin transactions" ON fin_transaction;
CREATE POLICY "Admin manage fin transactions" ON fin_transaction FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_transaction_updated_at ON fin_transaction;
CREATE TRIGGER update_fin_transaction_updated_at BEFORE UPDATE ON fin_transaction
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS fin_posting (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  transaction_id UUID NOT NULL REFERENCES fin_transaction(id) ON DELETE CASCADE,
  -- Nullable so closing an account does not delete history; an unassigned
  -- posting is simply not counted in any account's balance.
  account_id     UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  category_id    UUID REFERENCES fin_category(id) ON DELETE SET NULL,

  -- Signed minor units. Negative leaves the account, positive arrives.
  -- Zero is rejected: a posting that moves nothing describes nothing.
  amount_minor   BIGINT NOT NULL CHECK (amount_minor <> 0),
  currency       CHAR(3) NOT NULL REFERENCES fin_currency(code),

  -- What the transfer itself cost — wire fee, FX margin — in this posting's
  -- currency. Kept apart from the amount so "which service should I send
  -- through" stays answerable.
  fee_minor      BIGINT CHECK (fee_minor IS NULL OR fee_minor >= 0),

  -- Frozen at the transaction, which is what stops a historical report
  -- re-pricing itself every time the market moves. Null when no rate was
  -- available: reported as unconverted, never guessed at parity, and never
  -- silently read as zero.
  fx_rate           NUMERIC(20,10) CHECK (fx_rate IS NULL OR fx_rate > 0),
  base_amount_minor BIGINT,

  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_posting_account_idx ON fin_posting (account_id);
CREATE INDEX IF NOT EXISTS fin_posting_transaction_idx ON fin_posting (transaction_id);
CREATE INDEX IF NOT EXISTS fin_posting_category_idx ON fin_posting (category_id);

ALTER TABLE fin_posting ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin postings" ON fin_posting;
CREATE POLICY "Admin manage fin postings" ON fin_posting FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── What makes a transfer a transfer ────────────────────────────────────────
--
-- Checked at COMMIT, not per row: the two legs are inserted one after the
-- other, so a per-statement check would reject the first one every time.

CREATE OR REPLACE FUNCTION public.fin_check_transfer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- On DELETE there is no NEW, and reading it raises from inside the trigger
  -- rather than validating anything. Removing one leg of a transfer is exactly
  -- when this check matters most, so it has to survive the operation.
  v_txn         UUID := CASE WHEN TG_OP = 'DELETE'
                             THEN OLD.transaction_id
                             ELSE NEW.transaction_id END;
  v_kind        fin_transaction_kind;
  v_legs        INT;
  v_accounts    INT;
  v_unassigned  INT;
  v_currencies  INT;
  v_net         BIGINT;
  v_positive    INT;
  v_negative    INT;
BEGIN
  SELECT kind INTO v_kind FROM fin_transaction WHERE id = v_txn;
  -- The header is already gone when this fires from a cascade delete, and
  -- deleting a whole transfer is legitimate.
  IF v_kind IS NULL OR v_kind <> 'transfer' THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         count(DISTINCT account_id),
         count(*) FILTER (WHERE account_id IS NULL),
         count(DISTINCT currency),
         -- The legs alone. A provider fee is money leaving for the *outside
         -- world*, not money arriving in the other account, so it must not be
         -- part of this sum — including it rejected every transfer that cost
         -- anything to make. `fin_account_balance` charges it to the sending
         -- account separately, as `amount_minor - fee_minor`.
         coalesce(sum(amount_minor), 0),
         count(*) FILTER (WHERE amount_minor > 0),
         count(*) FILTER (WHERE amount_minor < 0)
    INTO v_legs, v_accounts, v_unassigned, v_currencies, v_net, v_positive, v_negative
    FROM fin_posting WHERE transaction_id = v_txn;

  IF v_legs < 2 THEN
    RAISE EXCEPTION 'A transfer needs both legs; transaction % has %', v_txn, v_legs;
  END IF;
  -- Two named accounts — unless a leg has been orphaned.
  --
  -- `fin_posting.account_id` is ON DELETE SET NULL, and a referential action
  -- fires row triggers, so closing an account nulls one leg of every transfer
  -- it was ever part of. Demanding two distinct accounts here would then make
  -- the account undeletable for anyone who had ever moved money — the *past*
  -- refusing to let the present change. The invariant is about what was
  -- written; afterwards, an orphaned leg is history, not an error.
  IF v_accounts < 2 AND v_unassigned = 0 THEN
    RAISE EXCEPTION 'A transfer must move between two different accounts';
  END IF;
  IF v_positive = 0 OR v_negative = 0 THEN
    RAISE EXCEPTION 'A transfer needs money leaving one account and arriving in another';
  END IF;
  IF v_currencies = 1 AND v_net <> 0 THEN
    RAISE EXCEPTION
      'A single-currency transfer must balance; transaction % is off by % minor units',
      v_txn, v_net;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fin_posting_transfer_balance ON fin_posting;
CREATE CONSTRAINT TRIGGER fin_posting_transfer_balance
  AFTER INSERT OR UPDATE OR DELETE ON fin_posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_check_transfer_balance();


-- ── The balance of an account ───────────────────────────────────────────────
--
-- Derived, never stored — a stored balance is a copy of a derivable fact and
-- drifts the first time a write path forgets to update it.
--
-- A plain SQL function has no place for an IF, so the AAL2 check is a
-- predicate: an unverified session matches no row and gets NULL. Fails closed.

CREATE OR REPLACE FUNCTION public.fin_account_balance(
  p_account UUID,
  p_as_of DATE DEFAULT CURRENT_DATE,
  p_include_pending BOOLEAN DEFAULT false
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.opening_balance_minor
       + coalesce((
           SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
             FROM fin_posting p
             JOIN fin_transaction t ON t.id = p.transaction_id
            WHERE p.account_id = a.id
              AND t.date >= a.opening_date
              AND t.date <= p_as_of
              AND (p_include_pending OR NOT t.is_pending)
         ), 0)
    FROM fin_account a
   WHERE a.id = p_account
     AND a.user_id = auth.uid()
     AND public.is_aal2();
$$;

REVOKE ALL ON FUNCTION public.fin_account_balance(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_account_balance(UUID, DATE, BOOLEAN) TO authenticated;

-- Every account at once. v1 called the per-account function in a loop from the
-- client — one request per account, all waiting on each other.
CREATE OR REPLACE FUNCTION public.fin_account_balances(
  p_as_of DATE DEFAULT CURRENT_DATE,
  p_include_pending BOOLEAN DEFAULT false
)
RETURNS TABLE (account_id UUID, balance_minor BIGINT, currency CHAR(3))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id,
         a.opening_balance_minor
         + coalesce((
             SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
               FROM fin_posting p
               JOIN fin_transaction t ON t.id = p.transaction_id
              WHERE p.account_id = a.id
                AND t.date >= a.opening_date
                AND t.date <= p_as_of
                AND (p_include_pending OR NOT t.is_pending)
           ), 0),
         a.currency
    FROM fin_account a
   WHERE a.user_id = auth.uid()
     AND public.is_aal2()
     AND a.archived_at IS NULL
   ORDER BY a.sort_order, a.name;
$$;

REVOKE ALL ON FUNCTION public.fin_account_balances(DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_account_balances(DATE, BOOLEAN) TO authenticated;


-- ── Commitments: what repeats, and what you owe ─────────────────────────────
--
-- ONE table for what v1 split across `recurring_transactions` and
-- `finance_loans`. A mortgage could exist as both and the forecast added them
-- together, with the Loans screen asking the owner to *remember* to archive the
-- duplicate. Remembering is not a mechanism.
--
-- A commitment also names `from_account_id` and/or `to_account_id`, exactly as
-- a posting pair does — so a repeating transfer is expressible. A v1 rule had
-- one account and a direction, so "move 500 to savings every fortnight" was
-- money leaving that never arrived, and the forecast fell by that amount every
-- fortnight forever.
--
-- `supersedes_id` records "the mortgage replaced the tenancy". No matcher can
-- know that Home Loan supersedes Rent — the two share no words.

DO $$ BEGIN
  CREATE TYPE fin_frequency AS ENUM ('daily','weekly','bi-weekly','monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- 'fixed': the amount is known (rent, salary, a subscription).
  -- 'amortising': the amount is derived from the terms (a loan instalment).
  CREATE TYPE fin_commitment_kind AS ENUM ('fixed','amortising');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- What a rate change does. Indian lenders usually hold the EMI and move the
  -- tenure; some move the EMI. Each event may override the default.
  CREATE TYPE fin_rate_effect AS ENUM ('tenure','emi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_commitment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  kind          fin_commitment_kind NOT NULL DEFAULT 'fixed',

  -- Direction is read from these, not from a type column, exactly as it is
  -- read from a posting's sign. Both set is a transfer between your own
  -- accounts — the case v1 could not represent at all.
  from_account_id UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  to_account_id   UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES fin_category(id) ON DELETE SET NULL,
  currency        CHAR(3) NOT NULL REFERENCES fin_currency(code),

  -- Fixed commitments.
  amount_minor  BIGINT CHECK (amount_minor IS NULL OR amount_minor > 0),

  -- Amortising commitments.
  principal_minor BIGINT CHECK (principal_minor IS NULL OR principal_minor > 0),
  annual_rate     NUMERIC(6,3) CHECK (annual_rate IS NULL OR (annual_rate >= 0 AND annual_rate <= 100)),
  tenure_months   INT CHECK (tenure_months IS NULL OR tenure_months BETWEEN 1 AND 600),
  rate_type       TEXT CHECK (rate_type IS NULL OR rate_type IN ('fixed','floating')),
  on_rate_change  fin_rate_effect,
  lender          TEXT CHECK (lender IS NULL OR char_length(lender) <= 120),

  -- Schedule.
  frequency      fin_frequency NOT NULL DEFAULT 'monthly',
  start_date     DATE NOT NULL,
  end_date       DATE,
  -- Overloaded by frequency: day-of-week (0–6, Sunday first) for weekly and
  -- bi-weekly, day-of-month (1–31) for monthly, unused otherwise. In v1 this
  -- was a bare INT with no CHECK and Zod was the only thing enforcing it, so a
  -- rule written from the SQL editor could hold a day its frequency could
  -- never produce.
  occurrence_day INT,
  -- The last occurrence actually posted, for resuming the queue.
  last_posted_date DATE,

  -- Off by default, and that default is the point: a biweekly salary is 1,000
  -- until two days of unpaid leave make it 800. An occurrence is a proposal
  -- with the expected amount pre-filled until a rule opts into posting itself.
  auto_post   BOOLEAN NOT NULL DEFAULT false,
  is_estimate BOOLEAN NOT NULL DEFAULT false,

  supersedes_id UUID REFERENCES fin_commitment(id) ON DELETE SET NULL,

  notes       TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  -- A commitment that moves money nowhere describes nothing.
  CONSTRAINT fin_commitment_has_an_account
    CHECK (from_account_id IS NOT NULL OR to_account_id IS NOT NULL),
  -- Money cannot move from an account to itself.
  CONSTRAINT fin_commitment_distinct_accounts
    CHECK (from_account_id IS NULL OR to_account_id IS NULL
           OR from_account_id <> to_account_id),
  -- Each shape carries its own fields and not the other's.
  CONSTRAINT fin_commitment_shape CHECK (
    (kind = 'fixed'
       AND amount_minor IS NOT NULL
       AND principal_minor IS NULL AND annual_rate IS NULL AND tenure_months IS NULL)
    OR
    (kind = 'amortising'
       AND amount_minor IS NULL
       AND principal_minor IS NOT NULL AND annual_rate IS NOT NULL
       AND tenure_months IS NOT NULL)
  ),
  -- A rule that ends before it starts projects nothing and silently does
  -- nothing, which is worse than being rejected.
  CONSTRAINT fin_commitment_ends_after_it_starts
    CHECK (end_date IS NULL OR end_date >= start_date),
  -- The occurrence day has to be one its own frequency can produce.
  CONSTRAINT fin_commitment_occurrence_day_fits_frequency CHECK (
    CASE frequency
      WHEN 'daily'     THEN occurrence_day IS NULL
      WHEN 'yearly'    THEN occurrence_day IS NULL
      WHEN 'weekly'    THEN occurrence_day IS NULL OR occurrence_day BETWEEN 0 AND 6
      WHEN 'bi-weekly' THEN occurrence_day IS NULL OR occurrence_day BETWEEN 0 AND 6
      WHEN 'monthly'   THEN occurrence_day IS NULL OR occurrence_day BETWEEN 1 AND 31
    END
  ),
  CONSTRAINT fin_commitment_supersedes_another CHECK (supersedes_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS fin_commitment_user_idx
  ON fin_commitment (user_id, start_date) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS fin_commitment_supersedes_idx
  ON fin_commitment (supersedes_id) WHERE supersedes_id IS NOT NULL;

ALTER TABLE fin_commitment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin commitments" ON fin_commitment;
CREATE POLICY "Admin manage fin commitments" ON fin_commitment FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_commitment_updated_at ON fin_commitment;
CREATE TRIGGER update_fin_commitment_updated_at BEFORE UPDATE ON fin_commitment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── What happened to a commitment ───────────────────────────────────────────
--
-- The schedule is *derived* from the terms plus these events, never stored: a
-- stored schedule goes stale the moment an event is added, and then two sources
-- disagree about what you owe.

DO $$ BEGIN
  CREATE TYPE fin_commitment_event_kind AS ENUM
    ('rate_change','prepayment','amount_change','ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_commitment_event (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  commitment_id  UUID NOT NULL REFERENCES fin_commitment(id) ON DELETE CASCADE,
  kind           fin_commitment_event_kind NOT NULL,
  effective_date DATE NOT NULL,
  rate           NUMERIC(6,3) CHECK (rate IS NULL OR (rate >= 0 AND rate <= 100)),
  amount_minor   BIGINT CHECK (amount_minor IS NULL OR amount_minor > 0),
  effect         fin_rate_effect,
  note           TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at     TIMESTAMPTZ DEFAULT now(),

  -- An event without the value it exists to carry is a row that does nothing.
  CONSTRAINT fin_commitment_event_complete CHECK (
    (kind = 'rate_change'   AND rate IS NOT NULL)
    OR (kind = 'prepayment'    AND amount_minor IS NOT NULL)
    OR (kind = 'amount_change' AND amount_minor IS NOT NULL)
    OR (kind = 'ended')
  )
);

CREATE INDEX IF NOT EXISTS fin_commitment_event_idx
  ON fin_commitment_event (commitment_id, effective_date);

ALTER TABLE fin_commitment_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin commitment events" ON fin_commitment_event;
CREATE POLICY "Admin manage fin commitment events" ON fin_commitment_event FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── Occurrences deliberately passed over ────────────────────────────────────
--
-- The only part of the confirm queue that needs storing. Everything else is
-- derived — commitments, minus what was posted, minus these — so a commitment
-- whose amount or schedule changes cannot leave a stale queue behind.

CREATE TABLE IF NOT EXISTS fin_commitment_skip (
  commitment_id UUID NOT NULL REFERENCES fin_commitment(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  due_date      DATE NOT NULL,
  reason        TEXT CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (commitment_id, due_date)
);

ALTER TABLE fin_commitment_skip ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin commitment skips" ON fin_commitment_skip;
CREATE POLICY "Admin manage fin commitment skips" ON fin_commitment_skip FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());


-- ── The link from the ledger to a commitment ────────────────────────────────
--
-- ON DELETE SET NULL: deleting a commitment must not rewrite history.

DO $$ BEGIN
  ALTER TABLE fin_transaction
    ADD CONSTRAINT fin_transaction_commitment_fkey
    FOREIGN KEY (commitment_id) REFERENCES fin_commitment(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- An occurrence is identified by its commitment and its *due* date, which is
-- not the date it was paid. This is what stops the queue proposing it twice.
CREATE UNIQUE INDEX IF NOT EXISTS fin_transaction_occurrence_unique
  ON fin_transaction (commitment_id, occurrence_date)
  WHERE commitment_id IS NOT NULL AND occurrence_date IS NOT NULL;


-- ── Reading a commitment's direction ────────────────────────────────────────
--
-- Derived from the accounts rather than stored, so it cannot disagree with
-- them. 'transfer' is the case v1 had no way to say.

CREATE OR REPLACE FUNCTION public.fin_commitment_direction(
  p_from UUID,
  p_to UUID
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from IS NOT NULL AND p_to IS NOT NULL THEN 'transfer'
    WHEN p_from IS NOT NULL THEN 'out'
    WHEN p_to IS NOT NULL THEN 'in'
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_commitment_direction(UUID, UUID) TO authenticated;


-- ── Budgets ─────────────────────────────────────────────────────────────────
--
-- One row per category per month. `period` is the first of the month, so a
-- budget is addressable without a range query and last month's figure is a
-- fact rather than something recomputed from a "current" budget.

CREATE TABLE IF NOT EXISTS fin_budget (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category_id  UUID NOT NULL REFERENCES fin_category(id) ON DELETE CASCADE,
  period       DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  -- An amount with no currency is meaningless, and v1's budget table had none
  -- — it simply assumed base. Stated, so a base-currency change cannot
  -- silently re-price every budget you ever set.
  currency     CHAR(3) NOT NULL REFERENCES fin_currency(code),
  -- Underspend carries into next month rather than evaporating, which is what
  -- makes a budget survive an irregular expense instead of being abandoned.
  rollover     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_id, period),
  CONSTRAINT fin_budget_period_is_a_month CHECK (date_trunc('month', period) = period)
);
ALTER TABLE fin_budget ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin budgets" ON fin_budget;
CREATE POLICY "Admin manage fin budgets" ON fin_budget FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_budget_updated_at ON fin_budget;
CREATE TRIGGER update_fin_budget_updated_at BEFORE UPDATE ON fin_budget
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── Goals ───────────────────────────────────────────────────────────────────
--
-- Three v1 decisions are deliberately not carried over, each a bug:
--
-- 1. A GOAL WROTE LEDGER ROWS. v1's own comment said an earmark is not a
--    transfer — money in a goal is still in the account — and then
--    `record_goal_contribution` wrote a ledger row anyway. Here the comment
--    wins: `fin_goal_contribution` has no `transaction_id` because there is no
--    transaction.
-- 2. A GOAL STORED ITS OWN TOTAL. `current_amount` was updated by
--    read-then-add, losing a contribution whenever two raced. Derived instead.
-- 3. `target_amount` HAD NO CHECK, so a zero target produced "NaN%" and a goal
--    that claimed to be complete on an empty balance.

DO $$ BEGIN
  CREATE TYPE fin_goal_kind AS ENUM ('save','payoff','buffer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_goal (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description  TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  -- Strictly positive: a goal of nothing is not a goal.
  target_minor BIGINT NOT NULL CHECK (target_minor > 0),
  currency     CHAR(3) NOT NULL REFERENCES fin_currency(code),
  target_date  DATE,
  -- Where the money is kept, so progress is observed rather than remembered.
  account_id   UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  kind         fin_goal_kind,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
  -- Note the absence of `current_amount`. See the header.
);
ALTER TABLE fin_goal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin goals" ON fin_goal;
CREATE POLICY "Admin manage fin goals" ON fin_goal FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_goal_updated_at ON fin_goal;
CREATE TRIGGER update_fin_goal_updated_at BEFORE UPDATE ON fin_goal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Money set aside, and taken back out. Positive puts aside, negative reclaims.
-- No `transaction_id`: an earmark does not move money.
CREATE TABLE IF NOT EXISTS fin_goal_contribution (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  goal_id      UUID NOT NULL REFERENCES fin_goal(id) ON DELETE CASCADE,
  -- Nullable and SET NULL: closing an account must not erase the record of
  -- what was set aside from it.
  account_id   UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
  occurred_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_goal_contribution_goal_idx
  ON fin_goal_contribution (goal_id, occurred_on DESC);
ALTER TABLE fin_goal_contribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin goal contributions" ON fin_goal_contribution;
CREATE POLICY "Admin manage fin goal contributions" ON fin_goal_contribution FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

-- What a goal holds: the sum of its contributions, derived.
CREATE OR REPLACE FUNCTION public.fin_goal_balance(p_goal UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(sum(amount_minor), 0)::BIGINT
    FROM fin_goal_contribution WHERE goal_id = p_goal;
$$;
GRANT EXECUTE ON FUNCTION public.fin_goal_balance(UUID) TO authenticated;

-- A goal cannot hold less than nothing. v1 enforced this inside one RPC, so any
-- other write path could drive a goal negative; here it holds however the row
-- arrives. Deferred, and reading OLD on a DELETE — taking money back out is
-- exactly when this matters.
CREATE OR REPLACE FUNCTION public.fin_check_goal_not_negative()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal    UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.goal_id ELSE NEW.goal_id END;
  v_balance BIGINT;
BEGIN
  -- Gone entirely when the goal itself was deleted; the cascade is fine.
  IF NOT EXISTS (SELECT 1 FROM fin_goal WHERE id = v_goal) THEN
    RETURN NULL;
  END IF;

  SELECT public.fin_goal_balance(v_goal) INTO v_balance;
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'That is more than the goal holds (it would leave % minor units)', v_balance;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fin_goal_contribution_not_negative ON fin_goal_contribution;
CREATE CONSTRAINT TRIGGER fin_goal_contribution_not_negative
  AFTER INSERT OR UPDATE OR DELETE ON fin_goal_contribution
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fin_check_goal_not_negative();


-- ── Scenarios ───────────────────────────────────────────────────────────────
--
-- Adjustments are JSONB because the shape is a union that belongs in one place
-- — the Zod schema — rather than in five columns that are null four times out
-- of five. The column still insists it is a list.

CREATE TABLE IF NOT EXISTS fin_scenario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fin_scenario_adjustments_is_a_list
    CHECK (jsonb_typeof(adjustments) = 'array')
);
ALTER TABLE fin_scenario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin scenarios" ON fin_scenario;
CREATE POLICY "Admin manage fin scenarios" ON fin_scenario FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_scenario_updated_at ON fin_scenario;
CREATE TRIGGER update_fin_scenario_updated_at BEFORE UPDATE ON fin_scenario
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── Imports ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_import_batch (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  account_id    UUID REFERENCES fin_account(id) ON DELETE SET NULL,
  file_name     TEXT CHECK (file_name IS NULL OR char_length(file_name) <= 255),
  format        TEXT NOT NULL CHECK (char_length(format) BETWEEN 1 AND 40),
  rows_in_file  INT NOT NULL DEFAULT 0 CHECK (rows_in_file >= 0),
  rows_imported INT NOT NULL DEFAULT 0 CHECK (rows_imported >= 0),
  rows_skipped  INT NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
  date_from     DATE,
  date_to       DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_import_batch_user_idx
  ON fin_import_batch (user_id, created_at DESC);
ALTER TABLE fin_import_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin import batches" ON fin_import_batch;
CREATE POLICY "Admin manage fin import batches" ON fin_import_batch FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());

-- ON DELETE SET NULL: forgetting an import must not delete the rows it brought
-- in, which is a different decision from undoing it.
DO $$ BEGIN
  ALTER TABLE fin_transaction
    ADD CONSTRAINT fin_transaction_import_batch_fkey
    FOREIGN KEY (import_batch_id) REFERENCES fin_import_batch(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The dedupe that makes importing the same statement twice a no-op. In v1 this
-- was `(user_id, account_id, import_hash)`, but the account now lives on the
-- posting rather than the transaction — and the hash is already computed per
-- account, so the account adds nothing to the key.
CREATE UNIQUE INDEX IF NOT EXISTS fin_transaction_import_hash_unique
  ON fin_transaction (user_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- A category learned from a correction during an import.
CREATE TABLE IF NOT EXISTS fin_category_rule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  -- A normalised merchant key: "LOBLAWS", "ETRANSFER JOHN DOE".
  pattern     TEXT NOT NULL CHECK (char_length(pattern) BETWEEN 2 AND 120),
  category_id UUID REFERENCES fin_category(id) ON DELETE CASCADE,
  -- 'transfer' marks the merchant as money moving between your own accounts.
  kind        TEXT NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense','income','transfer')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pattern)
);
ALTER TABLE fin_category_rule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage fin category rules" ON fin_category_rule;
CREATE POLICY "Admin manage fin category rules" ON fin_category_rule FOR ALL
  USING (auth.uid() = user_id AND public.is_aal2())
  WITH CHECK (auth.uid() = user_id AND public.is_aal2());
DROP TRIGGER IF EXISTS update_fin_category_rule_updated_at ON fin_category_rule;
CREATE TRIGGER update_fin_category_rule_updated_at BEFORE UPDATE ON fin_category_rule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── Writing a transaction atomically (migration 030) ────────────────────────
--
-- THE GAP THIS CLOSES. The deferred trigger above makes a half transfer
-- unrepresentable *within a statement*. But a client writing over PostgREST
-- makes two round trips — one for the header, one for the postings — and two
-- round trips are two transactions. If the second fails, the first has already
-- committed, and the ledger holds a transaction with no postings: not corrupt
-- money, but a row that means nothing and that every count will include.
--
-- Nothing fires when a header is inserted alone, so the database cannot prevent
-- that on its own. The write is therefore a function: one call, one
-- transaction, both halves or neither.
--
-- Deletion needs no function: ON DELETE CASCADE removes a transaction's legs
-- with it, and the transfer trigger tolerates the header being gone.
--
-- Ownership is checked for every id the caller supplies. A SECURITY DEFINER
-- function that trusted them would happily attach a posting to somebody else's
-- account.

CREATE OR REPLACE FUNCTION public.fin_record_transaction(
  p_transaction JSONB,
  p_postings JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_id      UUID;
  v_posting JSONB;
  v_account UUID;
  v_category UUID;
  v_count   INT := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_postings IS NULL OR jsonb_typeof(p_postings) <> 'array'
     OR jsonb_array_length(p_postings) = 0 THEN
    RAISE EXCEPTION 'A transaction needs at least one posting';
  END IF;
  IF jsonb_array_length(p_postings) > 20 THEN
    RAISE EXCEPTION 'At most 20 postings in one transaction';
  END IF;

  INSERT INTO fin_transaction (
    user_id, date, description, raw_description, merchant, notes, kind,
    is_pending, commitment_id, occurrence_date, import_hash, import_batch_id
  )
  VALUES (
    v_uid,
    (p_transaction->>'date')::date,
    left(coalesce(NULLIF(p_transaction->>'description', ''), 'Untitled'), 200),
    left(NULLIF(p_transaction->>'raw_description', ''), 500),
    left(NULLIF(p_transaction->>'merchant', ''), 200),
    NULLIF(p_transaction->>'notes', ''),
    coalesce(NULLIF(p_transaction->>'kind', ''), 'spend')::fin_transaction_kind,
    coalesce((p_transaction->>'is_pending')::boolean, false),
    -- Only a commitment of the caller's own.
    (SELECT c.id FROM fin_commitment c
      WHERE c.id = NULLIF(p_transaction->>'commitment_id', '')::uuid
        AND c.user_id = v_uid),
    NULLIF(p_transaction->>'occurrence_date', '')::date,
    left(NULLIF(p_transaction->>'import_hash', ''), 64),
    (SELECT b.id FROM fin_import_batch b
      WHERE b.id = NULLIF(p_transaction->>'import_batch_id', '')::uuid
        AND b.user_id = v_uid)
  )
  RETURNING id INTO v_id;

  FOR v_posting IN SELECT value FROM jsonb_array_elements(p_postings) LOOP
    v_account := NULLIF(v_posting->>'account_id', '')::uuid;
    v_category := NULLIF(v_posting->>'category_id', '')::uuid;

    IF v_account IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_account WHERE id = v_account AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Account not found';
    END IF;
    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_category WHERE id = v_category AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    INSERT INTO fin_posting (
      user_id, transaction_id, account_id, category_id,
      amount_minor, currency, fee_minor, fx_rate, base_amount_minor
    )
    VALUES (
      v_uid, v_id, v_account, v_category,
      (v_posting->>'amount_minor')::bigint,
      upper(v_posting->>'currency'),
      NULLIF(v_posting->>'fee_minor', '')::bigint,
      NULLIF(v_posting->>'fx_rate', '')::numeric,
      NULLIF(v_posting->>'base_amount_minor', '')::bigint
    );
    v_count := v_count + 1;
  END LOOP;

  -- Force the deferred transfer check *inside* this function, so a bad pair
  -- raises here and the whole call rolls back — rather than at the end of the
  -- surrounding statement, where the caller has already been told it worked.
  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_record_transaction(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_record_transaction(JSONB, JSONB) TO authenticated;

-- Postings are replaced wholesale rather than patched. Editing a transfer means
-- changing two rows at once — amount on one side, account on the other — and a
-- partial update is exactly how the two legs stop agreeing.
CREATE OR REPLACE FUNCTION public.fin_update_transaction(
  p_id UUID,
  p_transaction JSONB,
  p_postings JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_posting JSONB;
  v_account UUID;
  v_category UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fin_transaction WHERE id = p_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF p_postings IS NULL OR jsonb_typeof(p_postings) <> 'array'
     OR jsonb_array_length(p_postings) = 0 THEN
    RAISE EXCEPTION 'A transaction needs at least one posting';
  END IF;

  UPDATE fin_transaction
     SET date = coalesce(NULLIF(p_transaction->>'date', '')::date, date),
         description = coalesce(left(NULLIF(p_transaction->>'description', ''), 200), description),
         raw_description = CASE WHEN p_transaction ? 'raw_description'
                                THEN left(NULLIF(p_transaction->>'raw_description', ''), 500)
                                ELSE raw_description END,
         merchant = CASE WHEN p_transaction ? 'merchant'
                         THEN left(NULLIF(p_transaction->>'merchant', ''), 200)
                         ELSE merchant END,
         notes = CASE WHEN p_transaction ? 'notes'
                      THEN NULLIF(p_transaction->>'notes', '') ELSE notes END,
         kind = coalesce(NULLIF(p_transaction->>'kind', '')::fin_transaction_kind, kind),
         is_pending = coalesce((p_transaction->>'is_pending')::boolean, is_pending)
   WHERE id = p_id AND user_id = v_uid;

  DELETE FROM fin_posting WHERE transaction_id = p_id;

  FOR v_posting IN SELECT value FROM jsonb_array_elements(p_postings) LOOP
    v_account := NULLIF(v_posting->>'account_id', '')::uuid;
    v_category := NULLIF(v_posting->>'category_id', '')::uuid;

    IF v_account IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_account WHERE id = v_account AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Account not found';
    END IF;
    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM fin_category WHERE id = v_category AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Category not found';
    END IF;

    INSERT INTO fin_posting (
      user_id, transaction_id, account_id, category_id,
      amount_minor, currency, fee_minor, fx_rate, base_amount_minor
    )
    VALUES (
      v_uid, p_id, v_account, v_category,
      (v_posting->>'amount_minor')::bigint,
      upper(v_posting->>'currency'),
      NULLIF(v_posting->>'fee_minor', '')::bigint,
      NULLIF(v_posting->>'fx_rate', '')::numeric,
      NULLIF(v_posting->>'base_amount_minor', '')::bigint
    );
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_update_transaction(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_update_transaction(UUID, JSONB, JSONB) TO authenticated;


-- ── Per-day money, from the v2 ledger ───────────────────────────────────────
--
-- WHAT COUNTS, and why:
--
-- * **Direction comes from the sign of the posting**, never from
--   `fin_transaction.kind`. Kind is intent, for display; a row mislabelled at
--   entry still behaves correctly here, which is the same rule the TypeScript
--   domain layer follows.
-- * **Self-transfers are excluded.** Money moving between two accounts you own
--   is not earned or spent, and counting both legs would report it as both. A
--   transfer is recognised from its postings — two or more distinct accounts on
--   one transaction — rather than from its `kind`, for the reason above.
-- * **Pending rows are excluded**, matching "what do I actually have".
-- * **Unpriced postings are excluded.** A posting with no `base_amount_minor`
--   has no exchange rate for its date and cannot be added to a base-currency
--   total. It is left out rather than counted as zero — the same choice the
--   budgets and the forecast make.
--
-- RETURNS MAJOR UNITS, deliberately, unlike everything else in finance v2.
-- Both callers are read-only summaries whose consumers format a base-currency
-- amount with the shared `formatMoney({ amount, currency })` helper, and those
-- consumers are not part of the finance module. Converting here means the
-- division happens in exactly one place instead of at each call site. The
-- exponent comes from `fin_currency`, never from a hard-coded 100 — the yen has
-- no minor unit and the Kuwaiti dinar has three.
CREATE OR REPLACE FUNCTION public.fin_day_money(p_from DATE, p_to DATE)
RETURNS TABLE (day DATE, earned NUMERIC, spent NUMERIC, entries BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT coalesce(
             (SELECT c.exponent
                FROM fin_settings s
                JOIN fin_currency c ON c.code = s.base_currency
               WHERE s.user_id = auth.uid()),
             2
           ) AS exponent
  ),
  counted AS (
    SELECT t.date, p.base_amount_minor
      FROM fin_transaction t
      JOIN fin_posting p ON p.transaction_id = t.id
     WHERE t.user_id = auth.uid()
       AND t.date BETWEEN p_from AND p_to
       AND t.is_pending = false
       AND p.base_amount_minor IS NOT NULL
       -- Not a self-transfer: fewer than two distinct accounts on the
       -- transaction. Read from the postings, so a row whose `kind` is wrong
       -- still behaves.
       AND (
         SELECT count(DISTINCT q.account_id)
           FROM fin_posting q
          WHERE q.transaction_id = t.id
            AND q.account_id IS NOT NULL
       ) < 2
  )
  SELECT
    counted.date AS day,
    coalesce(sum(CASE WHEN counted.base_amount_minor > 0
                      THEN counted.base_amount_minor ELSE 0 END), 0)
      / power(10, (SELECT exponent FROM base))::NUMERIC AS earned,
    coalesce(sum(CASE WHEN counted.base_amount_minor < 0
                      THEN -counted.base_amount_minor ELSE 0 END), 0)
      / power(10, (SELECT exponent FROM base))::NUMERIC AS spent,
    count(*) AS entries
  FROM counted
  GROUP BY counted.date;
$$;

REVOKE ALL ON FUNCTION public.fin_day_money(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_day_money(DATE, DATE) TO authenticated;
