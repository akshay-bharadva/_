-- =============================================================================
-- 008 — Visitor analytics
-- =============================================================================
--
-- `NEXT_PUBLIC_VISIT_NOTIFIER_URL` posted a Discord message on each new session
-- carrying the referrer and the user-agent, and nothing was ever stored. There
-- was no way to answer "how many people came this month", let alone from where.
--
-- This is the foundation under that: one row per visit, aggregated in the
-- database, read only by the owner.
--
-- WHAT IS AND IS NOT STORED
-- -------------------------
-- **No IP address is ever written.** The trigger reads `x-forwarded-for` from
-- the PostgREST request — a static export has no server of its own, but
-- Postgres does see the request headers — and stores only
--
--     sha256(secret || current_date || ip || user_agent)
--
-- The secret is generated once and never leaves the database; because the
-- current date is part of the input, yesterday's hash for the same visitor is a
-- different value. That gives accurate unique-visitor counts within a day and
-- makes the column useless for identifying anybody, which is the same design
-- Plausible and Fathom use. There is no reversal, so nothing here needs a
-- retention argument beyond keeping the table small.
--
-- City, region and network come from the client, which looks itself up and
-- sends the result. Country falls back to the browser's timezone when that
-- lookup is blocked. Neither path lets this database learn an IP.
--
-- Safe to re-run.
-- =============================================================================


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

ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS visit_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS notify_on_visit BOOLEAN NOT NULL DEFAULT false;

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


-- ── 8. Check ────────────────────────────────────────────────────────────────
-- `secret_readable` must be 0: RLS with no policy denies every client role, and
-- that is what keeps the hash unreversible by anyone holding the anon key.

SELECT
  (SELECT count(*) FROM pg_policies WHERE tablename = 'analytics_secret') AS secret_readable,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'site_visits'::regclass AND NOT tgisinternal) AS triggers,
  (SELECT count(*) FROM site_visits) AS visits_so_far;
