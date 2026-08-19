-- =============================================================================
-- 010 — Calendar: calendars, recurrence, and a query that stops losing events
-- =============================================================================
--
-- The `events` table had six usable columns and no recurrence, which for a
-- calendar is not a missing feature so much as the missing feature. Alongside
-- that, `get_calendar_data` carried two real bugs and one fabrication.
--
-- THE MULTI-DAY BUG
-- -----------------
-- The old query filtered `start_time::date BETWEEN start AND end`. A trip from
-- the 28th to the 4th therefore did not appear when you looked at the following
-- week — it did not *start* there. Any event spanning a view boundary was
-- invisible from the far side of it. The rewrite below filters on **overlap**:
-- an event belongs in a window if it starts before the window ends and ends
-- after the window begins.
--
-- THE UNSTABLE ID BUG
-- -------------------
-- Habit and finance summary rows were given `gen_random_uuid()` inside the
-- query, so the same day's summary was a different object on every refetch —
-- an unusable React key, and nothing that could be selected or scrolled to.
-- They now get a deterministic id derived from the kind and the date.
--
-- THE FABRICATED CLOCK TIMES
-- --------------------------
-- Tasks were pinned to 09:00, habits to 07:00 and transactions to 12:00 by
-- literal `interval '9 hour'` arithmetic, to give date-only records a position
-- on an hour grid. Those times are invented, and wrong in every timezone. The
-- rewrite returns date-only records as **all-day**, and the client places them
-- in an all-day row where they belong.
--
-- Safe to re-run. Additive: existing events keep working.
-- =============================================================================


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
  IF uid IS NULL THEN
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


-- ── 7. Check ────────────────────────────────────────────────────────────────
-- Then run `SELECT seed_calendar_defaults('Asia/Kolkata');` as the admin,
-- substituting the zone your family lives in.

SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('calendars','event_exceptions','calendar_settings')) AS new_tables,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name IN ('rrule','calendar_id','location','task_id')) AS new_event_columns;
