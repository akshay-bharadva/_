-- ============================================================================
-- 011 — Harden the four SECURITY DEFINER functions that predate the v3 rebuild
-- ============================================================================
--
-- Guarded and safe to re-run. Additive: it replaces four function bodies and
-- changes no data.
--
-- Two problems, both in functions written before the rebuild established the
-- pattern the newer ones follow.
--
-- 1. No `SET search_path`.
--
--    A SECURITY DEFINER function runs as its owner but resolves unqualified
--    names through the *caller's* search_path. Anyone able to create an object
--    in a schema that resolves earlier can therefore have their table or
--    operator used instead of the intended one, inside a definer context.
--    Pinning the path removes the question. This is also what Supabase's own
--    advisor means by "Function Search Path Mutable".
--
-- 2. No AAL2 check — an MFA bypass.
--
--    This is the more serious of the two. Every table these functions touch is
--    protected by a policy of the form `auth.uid() = user_id AND is_aal2()`,
--    so a session that has passed a password but not the second factor cannot
--    read or write it. SECURITY DEFINER bypasses RLS entirely, and these four
--    checked only `auth.uid()` — so they were a route around the mandatory-MFA
--    model the rest of the schema enforces: a password-only session could read
--    the dashboard's aggregates and rename, merge or clear transaction
--    categories.
--
--    The calendar and finance functions added during the rebuild already guard
--    with `is_aal2()`; this brings the older four in line.

-- ── Dashboard aggregates ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_analytics_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  analytics_data JSONB;
  current_user_id UUID := auth.uid();
BEGIN
  -- Reads rows that RLS would otherwise withhold until the second factor.
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

-- ── Category maintenance ────────────────────────────────────────────────────
--
-- These write to `transactions` and `recurring_transactions`, both of which
-- require AAL2 through RLS. Without the guard below, SECURITY DEFINER handed
-- that write to any authenticated session.

CREATE OR REPLACE FUNCTION rename_transaction_category(old_name TEXT, new_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
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
  IF auth.uid() IS NULL OR NOT public.is_aal2() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE transactions SET category = NULL WHERE user_id = auth.uid() AND category = category_name;
  UPDATE recurring_transactions SET category = NULL WHERE user_id = auth.uid() AND category = category_name;
END;
$$;


-- ── Reads that skipped the second factor ────────────────────────────────────
--
-- Both of these were reachable by any authenticated session because they are
-- SECURITY DEFINER and granted to `authenticated` — which includes a session
-- that has passed a password but not TOTP. They scope to auth.uid(), so no
-- cross-user leak, but they returned data every policy on the underlying
-- tables would have withheld until the second factor.

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

  SELECT
    'finance-' || tr.date::text,
    'Money',
    tr.date::timestamptz,
    NULL,
    'transaction_summary',
    true,
    jsonb_build_object(
      'count', count(*),
      'earned', coalesce(sum(CASE WHEN tr.type = 'earning' THEN tr.base_amount ELSE 0 END), 0),
      'spent',  coalesce(sum(CASE WHEN tr.type = 'expense' THEN tr.base_amount ELSE 0 END), 0)
    )
  FROM transactions tr
  WHERE tr.user_id = uid
    AND tr.date BETWEEN start_date_param AND end_date_param
    -- Both legs of a transfer would otherwise show as income and spending on
    -- the same day, which is money moving, not money earned or spent.
    AND tr.transfer_group IS NULL
  GROUP BY tr.date;
END;
$$;

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
