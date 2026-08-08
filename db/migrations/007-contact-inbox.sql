-- =============================================================================
-- 007 — Contact inbox, abuse limits, and server-side notifications
-- =============================================================================
--
-- Three separate problems with one public write path.
--
-- 1. NOTHING COULD READ THE MESSAGES
--    `contact_submissions` has had admin SELECT and DELETE policies since the
--    beginning and no interface. Submissions accumulated where the owner could
--    not see them. This adds the state an inbox needs — read, replied,
--    archived — and the UPDATE policy that was missing, without which the
--    inbox could display a row but never mark it.
--
-- 2. ANONYMOUS, UNBOUNDED, UNLIMITED INSERTS
--    The policy is `WITH CHECK (true)`, the columns are TEXT, and the Zod
--    schema had `.min()` on every field and `.max()` on none. So an
--    unauthenticated visitor could insert arbitrarily large rows arbitrarily
--    often. Bounds now match `LIMITS` in `src/lib/schemas.ts`, and a trigger
--    refuses floods. Both live in the database, because the only client that
--    matters here is the one you do not control.
--
-- 3. THE DISCORD WEBHOOK WAS IN THE PUBLIC BUNDLE
--    `NEXT_PUBLIC_CONTACT_WEBHOOK_URL` is compiled into the client JS, so
--    anyone could read it out and post arbitrary embeds into the channel. The
--    URL moves into an admin-only table and the ping is sent by Postgres on the
--    real INSERT — so it cannot be forged, and cannot be skipped by a client
--    that inserts without calling it.
--
-- Safe to re-run.
--
-- AFTER RUNNING THIS
-- -----------------
-- Set the webhook from Admin → Inbox → Notifications, or from SQL:
--
--     UPDATE integration_settings
--        SET contact_webhook_url = 'https://discord.com/api/webhooks/…'
--      WHERE id = 1;
--
-- Then remove NEXT_PUBLIC_CONTACT_WEBHOOK_URL from .env — it is no longer read.
-- =============================================================================


-- ── 1. Inbox state ──────────────────────────────────────────────────────────

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS is_read     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replied_at  TIMESTAMPTZ;

-- The inbox lists newest-first, filtered by archived state, and shows an
-- unread count. Both are covered by this.
CREATE INDEX IF NOT EXISTS contact_submissions_inbox_idx
  ON contact_submissions (is_archived, created_at DESC);

-- Missing entirely: the table had INSERT, SELECT and DELETE policies and no
-- UPDATE, so marking a message read would have failed silently under RLS.
DROP POLICY IF EXISTS "Admin update contact" ON contact_submissions;
CREATE POLICY "Admin update contact" ON contact_submissions
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ── 2. Bounds ───────────────────────────────────────────────────────────────
--
-- Mirrors LIMITS in src/lib/schemas.ts. A value the form accepts and Postgres
-- rejects surfaces as an opaque write failure, so these two must agree — but
-- the database is the one that holds when the request does not come from the
-- form at all.

DO $$
BEGIN
  ALTER TABLE contact_submissions
    DROP CONSTRAINT IF EXISTS contact_submissions_length_check;

  ALTER TABLE contact_submissions
    ADD CONSTRAINT contact_submissions_length_check CHECK (
      char_length(name)    BETWEEN 2 AND 200
      AND char_length(email)   BETWEEN 3 AND 320   -- RFC 5321 maximum
      AND char_length(subject) BETWEEN 3 AND 200
      AND char_length(message) BETWEEN 10 AND 5000
    );
EXCEPTION WHEN check_violation THEN
  -- An existing row is already outside the bounds. Report it rather than
  -- failing the whole migration, so the rest still applies.
  RAISE WARNING
    'contact_submissions has rows outside the new length bounds; constraint not added. Inspect and delete them, then re-run.';
END $$;


-- ── 3. Rate limit ───────────────────────────────────────────────────────────
--
-- Two ceilings, both deliberately generous for a person and hostile to a
-- script. Enforced BEFORE INSERT so it applies to the anon role writing
-- through PostgREST, which is the only way this table is ever written.

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
  SELECT count(*) INTO per_email
    FROM contact_submissions
   WHERE lower(email) = lower(NEW.email)
     AND created_at > now() - interval '1 hour';

  IF per_email >= 3 THEN
    RAISE EXCEPTION 'Too many messages from this address. Try again later.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A site-wide floor stops a script that varies the address on every request.
  SELECT count(*) INTO per_minute
    FROM contact_submissions
   WHERE created_at > now() - interval '1 minute';

  IF per_minute >= 10 THEN
    RAISE EXCEPTION 'The contact form is busy. Try again in a moment.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.limit_contact_submissions() IS
  'Refuses more than 3 submissions per email per hour, or 10 site-wide per minute. The public INSERT policy is WITH CHECK (true), so this is the only thing standing between an anonymous visitor and an unbounded number of rows.';

DROP TRIGGER IF EXISTS limit_contact_submissions ON contact_submissions;
CREATE TRIGGER limit_contact_submissions
  BEFORE INSERT ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.limit_contact_submissions();


-- ── 4. Where integration secrets live ───────────────────────────────────────
--
-- Deliberately NOT `site_identity`: that table is `FOR SELECT USING (true)`, so
-- a webhook URL stored there would be readable by every visitor — the same
-- exposure this migration exists to remove, with extra steps.

CREATE TABLE IF NOT EXISTS integration_settings (
  id                  INT PRIMARY KEY DEFAULT 1,
  contact_webhook_url TEXT,
  notify_on_contact   BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT integration_settings_single_row CHECK (id = 1)
);

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

-- No public read policy of any kind. The trigger below reaches the row through
-- SECURITY DEFINER instead, so an anonymous INSERT can send the notification
-- without the anonymous role ever being able to read the URL.
DROP POLICY IF EXISTS "Admin manage integrations" ON integration_settings;
CREATE POLICY "Admin manage integrations" ON integration_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_integration_settings_updated_at ON integration_settings;
CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO integration_settings (id) VALUES (1) ON CONFLICT DO NOTHING;


-- ── 5. The notification ─────────────────────────────────────────────────────
--
-- `pg_net` ships with Supabase on every plan, including Free. It posts
-- asynchronously, so a slow or dead Discord endpoint cannot hold the visitor's
-- form submission open — and an AFTER trigger means a failed notification can
-- never lose the message, which is the whole reason the row is written first.

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
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title', 'New contact form submission',
          'color', 5814783,
          'fields', jsonb_build_array(
            jsonb_build_object('name', 'Name',    'value', left(NEW.name, 256),    'inline', true),
            jsonb_build_object('name', 'Email',   'value', left(NEW.email, 256),   'inline', true),
            jsonb_build_object('name', 'Subject', 'value', left(NEW.subject, 256)),
            -- Truncated on purpose: Discord rejects fields over 1024
            -- characters, and the whole embed would be dropped rather than
            -- shortened. The full message is in the inbox.
            jsonb_build_object('name', 'Message', 'value', left(NEW.message, 1000))
          ),
          'timestamp', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'footer', jsonb_build_object('text', 'Reply from Admin → Inbox')
        )
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Notification is best-effort. Losing the ping is a nuisance; losing the
  -- message because the ping failed is not acceptable.
  RAISE WARNING 'contact notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_contact_submission() IS
  'Posts a new contact submission to the Discord webhook in integration_settings. SECURITY DEFINER so an anonymous INSERT can fire it without the anon role being able to read the URL — which is the point: NEXT_PUBLIC_CONTACT_WEBHOOK_URL put that URL in the public JS bundle.';

DROP TRIGGER IF EXISTS notify_contact_submission ON contact_submissions;
CREATE TRIGGER notify_contact_submission
  AFTER INSERT ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_contact_submission();


-- ── 6. Check ────────────────────────────────────────────────────────────────
-- Expect the three new columns, both triggers, and a webhook that is not set
-- yet. `integration_settings` must never gain a public SELECT policy.

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'contact_submissions'
      AND column_name IN ('is_read', 'is_archived', 'replied_at')) AS new_columns,
  (SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'contact_submissions'::regclass
      AND NOT tgisinternal) AS triggers,
  (SELECT contact_webhook_url IS NOT NULL FROM integration_settings WHERE id = 1) AS webhook_set;
