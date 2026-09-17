-- 031 — Move the last two readers off the v1 ledger.
--
-- The dashboard and the calendar both summarise "money in and out per day", and
-- both read `transactions` — the v1 table that migration 029 wants to retire.
-- Nothing else outside the finance module touches v1's tables, so this is the
-- last step before the cutover can happen.
--
-- One function, two callers. v1 had the same summary written twice — once in
-- `get_calendar_data` and once as three separate client queries in
-- `dashboardApi` — with slightly different rules about what counts. The calendar
-- excluded transfers; the dashboard did not, so a day where $2,000 moved between
-- two of your own accounts read as $2,000 earned *and* $2,000 spent on the
-- dashboard and as nothing on the calendar. Both were describing the same day.
--
-- Safe to re-run.

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


-- ── The calendar, reading v2 ────────────────────────────────────────────────
--
-- Reproduced from `db/schema.sql` with exactly one branch changed: the money
-- summary now comes from `fin_day_money` instead of from `transactions`.
--
-- Everything else is byte-identical to the original on purpose, and two parts of
-- it matter more than they look:
--
-- * **SECURITY DEFINER, with an explicit `is_aal2()` check.** DEFINER bypasses
--   RLS, and every table read below is protected by a policy that requires the
--   second factor — so without that check the function would hand a
--   password-only session data the policies would have withheld. An earlier
--   draft of this migration rewrote the function as SECURITY INVOKER and lost
--   the guard, which no test would have caught.
-- * **The OUT columns are `is_all_day` and `data`**, not `all_day`/`meta`.
--   Postgres refuses to replace a function whose OUT row type changed, which is
--   how that draft was caught.
--
-- CREATE OR REPLACE cannot change the signature, so anything that does have to
-- DROP first. This does not: the signature is unchanged.

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

  -- Money, from the v2 ledger. The transfer rule that used to live here as
  -- `transfer_group IS NULL` now lives in `fin_day_money`, so the dashboard
  -- gets the same answer instead of its own slightly different one.
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
