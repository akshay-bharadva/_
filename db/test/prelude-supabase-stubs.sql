-- Supabase stubs, so a migration can be verified against a plain Postgres.
--
-- NOT part of the application and never run against a real database. The
-- migrations reference `auth.users`, `auth.uid()`, `auth.jwt()` and the two
-- helper functions defined in section 1 of db/schema.sql. A stock Postgres
-- container has none of them, so a migration cannot even be parsed there
-- without this file.
--
-- The point is to catch what only Postgres can catch: a typo in a constraint,
-- a trigger that reads NEW on a DELETE, a function whose plpgsql does not
-- compile, an invariant that rejects a case it should accept. Reading SQL
-- carefully is not the same as running it, and this module's whole argument is
-- that money arithmetic gets *verified* rather than asserted.
--
-- Identity is driven by two session settings so a test can act as a signed-in,
-- MFA-verified owner — or deliberately as neither, to check that policies and
-- SECURITY DEFINER functions fail closed.
--
--   SET app.uid = '<uuid>';
--   SET app.jwt = '{"aal":"aal2"}';

-- Supabase's two API roles. The migrations end with
-- `REVOKE ... FROM PUBLIC, anon` and `GRANT ... TO authenticated`, which is a
-- hard error against a stock Postgres where neither role exists — and it is an
-- error near the *end* of a file, so the migration aborts having already
-- created most of its objects. That failure is an artefact of the harness, not
-- of the migration, and creating the roles here is what makes the difference
-- visible rather than confusing.
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE IF NOT EXISTS auth.users (
  id         UUID PRIMARY KEY,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- `current_setting(..., true)` returns NULL rather than erroring when the
-- setting is absent, which is what lets a test run as nobody.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.uid', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('app.jwt', true), '')::jsonb, '{}'::jsonb);
$$;

-- ── Copied verbatim from db/schema.sql section 1 ────────────────────────────
-- If these drift from the real ones, the verification is worthless, so they
-- are copies rather than re-inventions.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt()->>'aal', '') = 'aal2';
$$;
