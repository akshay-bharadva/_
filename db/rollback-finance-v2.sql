-- =============================================================================
-- ROLLBACK FINANCE v2 — destructive, but only to v2. Read this before running.
-- =============================================================================
--
--   THIS DELETES EVERY v2 FINANCE TABLE AND EVERYTHING IN THEM.
--
-- It does NOT touch v1. `transactions`, `recurring_transactions`,
-- `financial_goals`, `finance_accounts`, `finance_categories`,
-- `finance_budgets`, `finance_loans`, `finance_scenarios`, `fx_rates` and the
-- rest are left exactly as they were, which is the whole point: until
-- `029-finance-v1-retire.sql` has run, v1 is still the live data and this
-- script is a clean way back.
--
-- AFTER 029 HAS RUN, THIS SCRIPT IS NOT A ROLLBACK. There would be nothing to
-- fall back to, and running it would delete the only copy of your finances.
-- Restore from the backup taken before the migration instead.
--
-- Safe to run when only some of 025/026/027 have been applied: every drop is
-- guarded, so a partial migration rolls back as cleanly as a complete one.
--
-- Run the whole file at once in the Supabase SQL editor.
-- =============================================================================


-- ── 1. Functions ────────────────────────────────────────────────────────────
-- Dropped first: a function depending on a type would otherwise block the
-- type's removal below.

DROP FUNCTION IF EXISTS public.fin_account_balance(UUID, DATE, BOOLEAN);
DROP FUNCTION IF EXISTS public.fin_account_balances(DATE, BOOLEAN);
DROP FUNCTION IF EXISTS public.fin_commitment_direction(UUID, UUID);
DROP FUNCTION IF EXISTS public.fin_check_transfer_balance() CASCADE;


-- ── 2. Tables ───────────────────────────────────────────────────────────────
-- Children before parents, though CASCADE would cover it either way. Listed
-- explicitly so this file doubles as the inventory of what v2 added: if a
-- table exists that is not named here, it did not come from these migrations.

-- 027 — budgets, goals, scenarios, import. Guarded, so this file works whether
-- or not 027 was ever applied.
DROP TABLE IF EXISTS fin_goal_contribution CASCADE;
DROP TABLE IF EXISTS fin_goal CASCADE;
DROP TABLE IF EXISTS fin_budget CASCADE;
DROP TABLE IF EXISTS fin_scenario CASCADE;
DROP TABLE IF EXISTS fin_category_rule CASCADE;
DROP TABLE IF EXISTS fin_import_batch CASCADE;

-- 026 — commitments.
DROP TABLE IF EXISTS fin_commitment_skip CASCADE;
DROP TABLE IF EXISTS fin_commitment_event CASCADE;
DROP TABLE IF EXISTS fin_commitment CASCADE;

-- 025 — the ledger.
DROP TABLE IF EXISTS fin_posting CASCADE;
DROP TABLE IF EXISTS fin_transaction CASCADE;
DROP TABLE IF EXISTS fin_category CASCADE;
DROP TABLE IF EXISTS fin_account CASCADE;
DROP TABLE IF EXISTS fin_rate CASCADE;
DROP TABLE IF EXISTS fin_settings CASCADE;
DROP TABLE IF EXISTS fin_currency CASCADE;


-- ── 3. Types ────────────────────────────────────────────────────────────────
-- Last, once nothing refers to them.

DROP TYPE IF EXISTS fin_commitment_event_kind;
DROP TYPE IF EXISTS fin_commitment_kind;
DROP TYPE IF EXISTS fin_rate_effect;
DROP TYPE IF EXISTS fin_frequency;
DROP TYPE IF EXISTS fin_transaction_kind;
DROP TYPE IF EXISTS fin_bucket;
DROP TYPE IF EXISTS fin_account_kind;


-- ── 4. Confirm ──────────────────────────────────────────────────────────────
-- Should return no rows. Anything listed here survived and wants explaining.

SELECT tablename AS surviving_v2_table
  FROM pg_tables
 WHERE schemaname = 'public' AND tablename LIKE 'fin\_%'
 ORDER BY tablename;
