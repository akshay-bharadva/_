-- 028: finance v2 — the backfill. v1 rows become v2 rows.
--
-- Requires 025, 026 and 027. Additive: it reads v1 and writes v2, and touches
-- nothing in v1. Re-runnable — every insert is keyed on the v1 id and skips
-- what is already there — so a partial run can simply be run again.
--
-- READ THE HAZARDS BELOW BEFORE RUNNING IT. Four kinds of v1 data cannot be
-- translated mechanically, and this file reports each rather than guessing.
-- Section 9 prints them; nothing is dropped and nothing is invented.
--
-- IDS ARE PRESERVED. A v1 account keeps its UUID as a v2 account, and so on.
-- That is what makes the verification in section 10 a row-by-row comparison
-- rather than an argument about totals, and it is what lets you look at the
-- same figure in both schemas while deciding whether to cut over.
--
-- MONEY. Every amount becomes an integer of the currency's own minor units:
-- `round(amount * 10^exponent)`. The rounding is the only place a v1 value can
-- change, and it can only change by less than one minor unit — v1 columns were
-- NUMERIC(_,2) or (_,4) while the exponent is at most 3, so in practice only a
-- NUMERIC(18,4) opening balance with a fourth decimal moves at all. Section 10
-- reports any account where it did.


-- ── 1. Settings and rates ───────────────────────────────────────────────────

INSERT INTO fin_settings (user_id, base_currency, home_currency,
                          needs_target_pct, wants_target_pct, save_target_pct,
                          runway_target_months)
SELECT s.user_id, s.base_currency, s.home_currency,
       s.needs_target_pct, s.wants_target_pct, s.save_target_pct,
       s.runway_target_months
  FROM finance_settings s
 WHERE EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = s.base_currency)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO fin_rate (base, quote, as_of, rate, source)
SELECT base, quote, as_of, rate, left(source, 60) FROM fx_rates
ON CONFLICT (base, quote, as_of) DO NOTHING;


-- ── 2. Accounts and categories ──────────────────────────────────────────────
--
-- `minor()` is spelled out rather than hidden in a helper so the rounding is
-- visible at every call site.

INSERT INTO fin_account (id, user_id, name, kind, currency, institution,
                         opening_balance_minor, opening_date,
                         credit_limit_minor, statement_day, payment_due_day,
                         is_liquid, import_ref, color, sort_order,
                         archived_at, created_at, updated_at)
SELECT a.id, a.user_id, a.name, a.kind::text::fin_account_kind, a.currency, a.institution,
       round(a.opening_balance * power(10, c.exponent))::BIGINT,
       a.opening_date,
       CASE WHEN a.credit_limit IS NULL THEN NULL
            ELSE round(a.credit_limit * power(10, c.exponent))::BIGINT END,
       a.statement_day, a.payment_due_day,
       a.is_liquid,
       -- v1's column had no format CHECK; v2 insists on 2–6 digits, so a value
       -- that would be rejected is carried as absent rather than failing the
       -- whole migration over a cosmetic field.
       CASE WHEN a.import_ref ~ '^[0-9]{2,6}$' THEN a.import_ref ELSE NULL END,
       a.color, a.sort_order, a.archived_at, a.created_at, a.updated_at
  FROM finance_accounts a
  JOIN fin_currency c ON c.code = a.currency
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_category (id, user_id, name, bucket, icon, color,
                          is_essential, sort_order, archived_at, created_at, updated_at)
SELECT id, user_id, name, bucket::text::fin_bucket, icon, color,
       is_essential, sort_order, archived_at, created_at, updated_at
  FROM finance_categories
ON CONFLICT (id) DO NOTHING;


-- ── 3. Commitments, from BOTH v1 tables ─────────────────────────────────────
--
-- This is the join that fixes the double-count: recurring rules and loans were
-- two tables that could each describe the same mortgage, and the forecast
-- added both. They land in one table here. Where the owner really did have
-- both, section 9 says so — it cannot be resolved automatically, because which
-- record is the real one is a judgement about their own finances.
--
-- Direction comes from v1's `type`: an expense leaves `account_id`, an earning
-- arrives in it. A rule with no account at all cannot satisfy v2's "money has
-- to move somewhere" constraint and is reported in section 9 instead.

INSERT INTO fin_commitment (id, user_id, name, kind,
                            from_account_id, to_account_id, category_id, currency,
                            amount_minor, frequency, start_date, end_date,
                            occurrence_day, last_posted_date,
                            auto_post, is_estimate, notes, archived_at,
                            created_at, updated_at)
SELECT r.id, r.user_id, left(r.description, 200), 'fixed',
       CASE WHEN r.type = 'expense' THEN r.account_id END,
       CASE WHEN r.type = 'earning' THEN r.account_id END,
       r.category_id,
       coalesce(r.currency, acc.currency, s.base_currency, 'CAD'),
       round(r.amount * power(10, c.exponent))::BIGINT,
       r.frequency::text::fin_frequency,
       r.start_date, r.end_date,
       -- v1's column had no CHECK, so a rule could hold a day its own
       -- frequency can never produce. v2 rejects that, so an impossible value
       -- is carried as absent — the schedule then falls back to the start
       -- date, which is what v1 did with it in practice anyway.
       CASE
         WHEN r.frequency::text IN ('daily','yearly') THEN NULL
         WHEN r.frequency::text IN ('weekly','bi-weekly')
           AND r.occurrence_day BETWEEN 0 AND 6 THEN r.occurrence_day
         WHEN r.frequency::text = 'monthly'
           AND r.occurrence_day BETWEEN 1 AND 31 THEN r.occurrence_day
         ELSE NULL
       END,
       r.last_processed_date,
       coalesce(r.auto_post, false), coalesce(r.is_estimate, false),
       r.notes, r.archived_at, r.created_at, r.updated_at
  FROM recurring_transactions r
  LEFT JOIN finance_accounts acc ON acc.id = r.account_id
  LEFT JOIN finance_settings s ON s.user_id = r.user_id
  JOIN fin_currency c
    ON c.code = coalesce(r.currency, acc.currency, s.base_currency, 'CAD')
 WHERE r.account_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_commitment (id, user_id, name, kind,
                            from_account_id, category_id, currency,
                            principal_minor, annual_rate, tenure_months,
                            rate_type, on_rate_change, lender,
                            frequency, start_date, occurrence_day,
                            notes, archived_at, created_at, updated_at)
SELECT l.id, l.user_id, left(l.name, 200), 'amortising',
       l.pay_from_account_id, l.category_id, l.currency,
       round(l.principal * power(10, c.exponent))::BIGINT,
       l.annual_rate, l.tenure_months,
       l.rate_type, l.on_rate_change::text::fin_rate_effect, l.lender,
       'monthly', l.first_emi_date, extract(day FROM l.first_emi_date)::INT,
       l.notes, l.archived_at, l.created_at, l.updated_at
  FROM finance_loans l
  JOIN fin_currency c ON c.code = l.currency
 WHERE l.pay_from_account_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_commitment_event (id, user_id, commitment_id, kind, effective_date,
                                  rate, amount_minor, effect, note, created_at)
SELECT e.id, e.user_id, e.loan_id, e.kind::fin_commitment_event_kind, e.effective_date,
       e.rate,
       CASE WHEN e.amount IS NULL THEN NULL
            ELSE round(e.amount * power(10, c.exponent))::BIGINT END,
       e.effect::text::fin_rate_effect, e.note, e.created_at
  FROM finance_loan_events e
  JOIN finance_loans l ON l.id = e.loan_id
  JOIN fin_currency c ON c.code = l.currency
  JOIN fin_commitment fc ON fc.id = e.loan_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_commitment_skip (commitment_id, user_id, due_date, reason, created_at)
SELECT s.recurring_id, s.user_id, s.due_date, s.reason, s.created_at
  FROM recurring_skips s
  JOIN fin_commitment c ON c.id = s.recurring_id
ON CONFLICT (commitment_id, due_date) DO NOTHING;


-- ── 4. Import batches, before the transactions that point at them ───────────

INSERT INTO fin_import_batch (id, user_id, account_id, file_name, format,
                              rows_in_file, rows_imported, rows_skipped,
                              date_from, date_to, created_at)
SELECT id, user_id, account_id, file_name, format,
       rows_in_file, rows_imported, rows_skipped, date_from, date_to, created_at
  FROM finance_import_batches
ON CONFLICT (id) DO NOTHING;


-- ── 5. The ledger ───────────────────────────────────────────────────────────
--
-- Two rows sharing a `transfer_group` become ONE transaction with two
-- postings. Everything else becomes one transaction with one posting.
--
-- The header of a transfer takes the id of its outgoing leg, so the pair has a
-- stable, derivable identity and re-running this file cannot duplicate it.
--
-- A HALF TRANSFER — a `transfer_group` with only one row, which v1 permitted
-- because nothing enforced the pairing — cannot become a v2 transfer: the
-- constraint trigger would reject it, and rightly. It is carried as an
-- `adjustment` instead, which keeps the money in the ledger and the row
-- visible, and section 9 lists every one so the missing side can be recorded.

-- NOT `ON COMMIT DROP`: psql commits each statement on its own, so the table
-- would be gone before the next statement could read it and the backfill could
-- never run at all.
DROP TABLE IF EXISTS v1_txn_shape;
CREATE TEMP TABLE v1_txn_shape AS
SELECT t.*,
       CASE
         WHEN t.transfer_group IS NULL THEN 'single'
         WHEN count(*) OVER (PARTITION BY t.transfer_group) = 2 THEN 'pair'
         ELSE 'half'
       END AS shape,
       -- The outgoing leg leads a pair; a single or a half leads itself.
       CASE
         WHEN t.transfer_group IS NULL THEN t.id
         ELSE first_value(t.id) OVER (
                PARTITION BY t.transfer_group
                ORDER BY CASE WHEN t.type = 'expense' THEN 0 ELSE 1 END, t.id)
       END AS header_id,
       -- v2 adds two unique indexes v1 did not have, and a collision under
       -- either would abort this entire migration rather than skip a row —
       -- `ON CONFLICT (id)` covers only the primary key.
       --
       -- The money is never the thing dropped. Both rows migrate; only the
       -- duplicated *marker* is cleared on the later one, because a hash and
       -- an occurrence date are bookkeeping about a row rather than the row
       -- itself. Section 9 lists every one, so a lost dedupe marker is
       -- visible rather than silent.
       row_number() OVER (PARTITION BY t.user_id, t.import_hash
                          ORDER BY t.date, t.id) AS hash_rank,
       row_number() OVER (PARTITION BY t.recurring_transaction_id, t.occurrence_date
                          ORDER BY t.date, t.id) AS occurrence_rank
  FROM transactions t;

INSERT INTO fin_transaction (id, user_id, date, description, raw_description,
                             merchant, notes, kind, is_pending,
                             commitment_id, occurrence_date,
                             import_hash, import_batch_id, created_at, updated_at)
SELECT v.header_id, v.user_id, v.date, left(v.description, 200), v.raw_description,
       v.merchant, v.notes,
       CASE
         WHEN v.shape = 'pair' THEN 'transfer'
         WHEN v.shape = 'half' THEN 'adjustment'
         WHEN v.type = 'earning' THEN 'earn'
         ELSE 'spend'
       END::fin_transaction_kind,
       coalesce(v.is_pending, false),
       -- Only where the rule actually became a commitment.
       (SELECT c.id FROM fin_commitment c WHERE c.id = v.recurring_transaction_id),
       CASE WHEN v.occurrence_rank = 1 THEN v.occurrence_date END,
       CASE WHEN v.hash_rank = 1 THEN v.import_hash END,
       v.import_batch_id, v.created_at, v.updated_at
  FROM v1_txn_shape v
 WHERE v.id = v.header_id
   -- A header whose every leg is zero would arrive with no postings at all:
   -- a ledger row that moves nothing, which is the state `amount_minor <> 0`
   -- forbids on a posting and which would simply have been smuggled in one
   -- level higher. Checked across the group, so a pair with one zero leg still
   -- migrates on the strength of the other.
   AND EXISTS (SELECT 1 FROM v1_txn_shape x
                WHERE x.header_id = v.header_id AND x.amount <> 0)
ON CONFLICT (id) DO NOTHING;

-- Every leg, in one statement, so the deferred transfer check sees both sides
-- of a pair at once rather than rejecting the first to arrive.
INSERT INTO fin_posting (id, user_id, transaction_id, account_id, category_id,
                         amount_minor, currency, fee_minor,
                         fx_rate, base_amount_minor, created_at)
SELECT v.id, v.user_id, v.header_id, v.account_id, v.category_id,
       -- Direction moves from a column to a sign.
       CASE WHEN v.type = 'earning' THEN 1 ELSE -1 END
         * round(v.amount * power(10, c.exponent))::BIGINT,
       coalesce(v.currency, c.code),
       CASE WHEN v.fee_amount IS NULL OR v.fee_amount = 0 THEN NULL
            ELSE round(v.fee_amount * power(10, c.exponent))::BIGINT END,
       v.fx_rate,
       CASE WHEN v.base_amount IS NULL THEN NULL
            ELSE round(v.base_amount * power(10, b.exponent))::BIGINT END,
       v.created_at
  FROM v1_txn_shape v
  JOIN fin_currency c
    ON c.code = coalesce(v.currency,
                         (SELECT a.currency FROM finance_accounts a WHERE a.id = v.account_id),
                         'CAD')
  LEFT JOIN finance_settings s ON s.user_id = v.user_id
  JOIN fin_currency b ON b.code = coalesce(s.base_currency, 'CAD')
 WHERE v.amount <> 0
ON CONFLICT (id) DO NOTHING;


-- ── 6. Budgets ──────────────────────────────────────────────────────────────

INSERT INTO fin_budget (id, user_id, category_id, period, amount_minor,
                        currency, rollover, created_at, updated_at)
SELECT b.id, b.user_id, b.category_id, b.period,
       round(b.amount * power(10, c.exponent))::BIGINT,
       coalesce(s.base_currency, 'CAD'), b.rollover, b.created_at, b.updated_at
  FROM finance_budgets b
  LEFT JOIN finance_settings s ON s.user_id = b.user_id
  JOIN fin_currency c ON c.code = coalesce(s.base_currency, 'CAD')
  JOIN fin_category fc ON fc.id = b.category_id
ON CONFLICT (id) DO NOTHING;


-- ── 7. Goals ────────────────────────────────────────────────────────────────
--
-- v2 derives what a goal holds from its contributions, so a v1 goal carrying a
-- `current_amount` with no contribution history would arrive holding nothing.
-- That is the one place this backfill *creates* a row: an opening contribution
-- for the difference, dated the goal's creation, so the derived total equals
-- the number the owner last saw. It is labelled, not silent.
--
-- A v1 goal with a target of zero cannot exist in v2 (it produced "NaN%" and
-- goals that claimed to be complete). Those are reported in section 9 rather
-- than given an invented target.

INSERT INTO fin_goal (id, user_id, name, description, target_minor, currency,
                      target_date, account_id, kind, archived_at,
                      created_at, updated_at)
SELECT g.id, g.user_id, left(g.name, 200), g.description,
       round(g.target_amount * power(10, c.exponent))::BIGINT,
       coalesce(g.currency, s.base_currency, 'CAD'),
       g.target_date, g.account_id, g.kind::fin_goal_kind, g.archived_at,
       g.created_at, g.updated_at
  FROM financial_goals g
  LEFT JOIN finance_settings s ON s.user_id = g.user_id
  JOIN fin_currency c ON c.code = coalesce(g.currency, s.base_currency, 'CAD')
 WHERE g.target_amount > 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_goal_contribution (id, user_id, goal_id, account_id,
                                   amount_minor, occurred_on, note, created_at)
SELECT gc.id, gc.user_id, gc.goal_id, gc.account_id,
       round(gc.amount * power(10, c.exponent))::BIGINT,
       gc.occurred_on, gc.note, gc.created_at
  FROM finance_goal_contributions gc
  JOIN fin_goal fg ON fg.id = gc.goal_id
  JOIN fin_currency c ON c.code = fg.currency
ON CONFLICT (id) DO NOTHING;

-- The opening balance for a goal whose total was a stored number.
INSERT INTO fin_goal_contribution (user_id, goal_id, amount_minor, occurred_on, note)
SELECT g.user_id, g.id,
       round(g.current_amount * power(10, c.exponent))::BIGINT
         - coalesce(public.fin_goal_balance(g.id), 0),
       coalesce(g.created_at::date, CURRENT_DATE),
       'Opening balance carried from the previous version'
  FROM financial_goals g
  JOIN fin_goal fg ON fg.id = g.id
  JOIN fin_currency c ON c.code = fg.currency
 WHERE round(g.current_amount * power(10, c.exponent))::BIGINT
         - coalesce(public.fin_goal_balance(g.id), 0) <> 0
   AND NOT EXISTS (
     SELECT 1 FROM fin_goal_contribution x
      WHERE x.goal_id = g.id
        AND x.note = 'Opening balance carried from the previous version'
   );


-- ── 8. Scenarios and learned rules ──────────────────────────────────────────

INSERT INTO fin_scenario (id, user_id, name, description, adjustments, is_active,
                          created_at, updated_at)
SELECT id, user_id, left(name, 120), description, adjustments, is_active,
       created_at, updated_at
  FROM finance_scenarios
 WHERE jsonb_typeof(adjustments) = 'array'
ON CONFLICT (id) DO NOTHING;

INSERT INTO fin_category_rule (id, user_id, pattern, category_id, kind,
                               created_at, updated_at)
SELECT r.id, r.user_id, r.pattern, r.category_id, r.kind, r.created_at, r.updated_at
  FROM finance_category_rules r
  LEFT JOIN fin_category c ON c.id = r.category_id
 WHERE r.category_id IS NULL OR c.id IS NOT NULL
ON CONFLICT (id) DO NOTHING;


-- ── 9. What could not be translated ─────────────────────────────────────────
--
-- Read every row of this. None of it is an error, and none of it is guessed
-- at: each is a shape v1 permitted that v2 will not, or a judgement only the
-- owner can make. The cutover is not finished until this list is empty or
-- every entry has been decided.

SELECT 'half transfer — one leg only; carried as an adjustment' AS issue,
       t.id::text AS reference, t.date::text AS detail, t.description
  FROM transactions t
 WHERE t.transfer_group IS NOT NULL
   AND (SELECT count(*) FROM transactions o WHERE o.transfer_group = t.transfer_group) <> 2

UNION ALL
SELECT 'recurring rule with no account — not migrated',
       r.id::text, r.type::text, r.description
  FROM recurring_transactions r WHERE r.account_id IS NULL

UNION ALL
SELECT 'loan with no paying account — not migrated',
       l.id::text, l.currency, l.name
  FROM finance_loans l WHERE l.pay_from_account_id IS NULL

UNION ALL
-- The double-count, named at last. Both became commitments; archive whichever
-- is not the real record, or the instalment leaves twice a month.
SELECT 'a loan and a rule describe the same debt — archive one',
       l.id::text, r.id::text, l.name || ' / ' || r.description
  FROM finance_loans l
  JOIN recurring_transactions r
    ON r.archived_at IS NULL AND l.archived_at IS NULL
   AND lower(regexp_replace(l.name, '[^a-zA-Z0-9]+', ' ', 'g')) =
       lower(regexp_replace(r.description, '[^a-zA-Z0-9]+', ' ', 'g'))

UNION ALL
SELECT 'goal with a target of zero — not migrated',
       g.id::text, g.current_amount::text, g.name
  FROM financial_goals g WHERE g.target_amount <= 0

UNION ALL
-- Every currency join above is an inner join, so a row in a currency the
-- picker does not carry would vanish without a word. Named instead.
SELECT 'account in an unknown currency — not migrated',
       a.id::text, a.currency, a.name
  FROM finance_accounts a
 WHERE NOT EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = a.currency)

UNION ALL
SELECT 'transaction in an unknown currency — not migrated',
       t.id::text, t.currency, t.description
  FROM transactions t
 WHERE t.currency IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = t.currency)

UNION ALL
-- v2 rejects a posting that moves nothing, because it describes nothing.
SELECT 'transaction of zero — not migrated',
       t.id::text, t.date::text, t.description
  FROM transactions t WHERE t.amount = 0

UNION ALL
-- v1 keyed the import dedupe on (user, account, hash); v2 keys it on
-- (user, hash), because the hash already includes the account. Two rows in
-- DIFFERENT accounts that happen to share a hash collided under the new index,
-- and the second would be lost.
SELECT 'import hash shared across two accounts — one row will not migrate',
       t.import_hash, count(*)::text, string_agg(DISTINCT t.description, ' / ')
  FROM transactions t
 WHERE t.import_hash IS NOT NULL
 GROUP BY t.user_id, t.import_hash
HAVING count(*) > 1

UNION ALL
-- v1 had no constraint here, so the same occurrence could be recorded twice.
-- v2's unique index is what stops the confirm queue proposing it again, so a
-- v1 duplicate cannot cross over.
SELECT 'the same occurrence recorded twice — one row will not migrate',
       t.recurring_transaction_id::text, t.occurrence_date::text,
       string_agg(DISTINCT t.description, ' / ')
  FROM transactions t
 WHERE t.recurring_transaction_id IS NOT NULL AND t.occurrence_date IS NOT NULL
 GROUP BY t.recurring_transaction_id, t.occurrence_date
HAVING count(*) > 1

UNION ALL
-- v1 wrote a ledger row for a goal contribution whenever an account was named,
-- which its own table comment said would double-count. Those rows are real
-- history and are carried across as transactions; the earmark is carried too.
-- Decide whether each ledger row should stay.
SELECT 'goal contribution that also wrote a ledger row in v1',
       gc.id::text, gc.transaction_id::text, gc.note
  FROM finance_goal_contributions gc WHERE gc.transaction_id IS NOT NULL

ORDER BY 1, 2;


-- ── 10. Does v2 agree with v1? ──────────────────────────────────────────────
--
-- The cutover gate. Every row here must read 'match'. A balance is compared in
-- minor units against v1's own function, so this is an exact comparison and
-- not an argument about rounding.

-- The v1 side counts only what v2 *can* hold: an account in an unsupported
-- currency is already named in section 9, and a gate that cries wolf about
-- something it explained two sections earlier teaches you to ignore it.
SELECT 'accounts (migratable)' AS what,
       (SELECT count(*) FROM finance_accounts a
         WHERE EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = a.currency)) AS v1,
       (SELECT count(*) FROM fin_account) AS v2,
       CASE WHEN (SELECT count(*) FROM finance_accounts a
                   WHERE EXISTS (SELECT 1 FROM fin_currency c WHERE c.code = a.currency))
                 = (SELECT count(*) FROM fin_account)
            THEN 'match' ELSE 'DIFFERS' END AS verdict
UNION ALL SELECT 'categories',
       (SELECT count(*) FROM finance_categories), (SELECT count(*) FROM fin_category),
       CASE WHEN (SELECT count(*) FROM finance_categories) = (SELECT count(*) FROM fin_category)
            THEN 'match' ELSE 'DIFFERS' END
UNION ALL SELECT 'ledger postings vs v1 rows',
       (SELECT count(*) FROM transactions WHERE amount <> 0),
       (SELECT count(*) FROM fin_posting),
       CASE WHEN (SELECT count(*) FROM transactions WHERE amount <> 0) = (SELECT count(*) FROM fin_posting)
            THEN 'match' ELSE 'DIFFERS' END
UNION ALL SELECT 'commitments vs rules + loans',
       (SELECT count(*) FROM recurring_transactions WHERE account_id IS NOT NULL)
         + (SELECT count(*) FROM finance_loans WHERE pay_from_account_id IS NOT NULL),
       (SELECT count(*) FROM fin_commitment),
       CASE WHEN (SELECT count(*) FROM recurring_transactions WHERE account_id IS NOT NULL)
                 + (SELECT count(*) FROM finance_loans WHERE pay_from_account_id IS NOT NULL)
                 = (SELECT count(*) FROM fin_commitment)
            THEN 'match' ELSE 'DIFFERS' END
UNION ALL SELECT 'budgets',
       (SELECT count(*) FROM finance_budgets), (SELECT count(*) FROM fin_budget),
       CASE WHEN (SELECT count(*) FROM finance_budgets) = (SELECT count(*) FROM fin_budget)
            THEN 'match' ELSE 'DIFFERS' END;

-- Balance, per account, old against new, to the minor unit.
--
-- BOTH sides are summed inline rather than through `fin_account_balance` and
-- `account_balance`. Those functions require `auth.uid()` and AAL2 and fail
-- closed — correctly — but a migration run from the SQL editor has neither, so
-- they return NULL for every account and this gate would report DIFFERS across
-- the board on a perfectly good migration. A cutover gate that always fails is
-- worse than no gate, because the first thing anyone does with it is stop
-- reading it.
--
-- That reasoning was written here from the start and applied to the v2 side
-- only: the v1 side went on calling `public.account_balance(...)` and so
-- reported DIFFERS for every account, always. Found by running this file
-- against a real export in a clean database, where eight accounts that agree to
-- the cent all read DIFFERS with an empty v1 column. An empty column and a
-- disagreement are not the same finding, and a gate that cannot tell them apart
-- is the kind of plausible-looking wrong answer this rebuild exists to remove.
--
-- The arithmetic below mirrors `account_balance` exactly: opening balance, plus
-- earnings, minus expenses, minus fees, from the opening date to today,
-- excluding pending rows.
WITH v1 AS (
  SELECT a.id,
         coalesce(a.opening_balance, 0)
           + coalesce((
               SELECT sum(
                        CASE WHEN t.type = 'earning' THEN t.amount ELSE -t.amount END
                        - coalesce(t.fee_amount, 0)
                      )
                 FROM transactions t
                WHERE t.account_id = a.id
                  AND t.date >= a.opening_date
                  AND t.date <= CURRENT_DATE
                  AND NOT t.is_pending
             ), 0) AS balance
    FROM finance_accounts a
),
v2 AS (
  SELECT fa.id,
         fa.opening_balance_minor
           + coalesce((
               SELECT sum(p.amount_minor - coalesce(p.fee_minor, 0))
                 FROM fin_posting p
                 JOIN fin_transaction t ON t.id = p.transaction_id
                WHERE p.account_id = fa.id
                  AND t.date >= fa.opening_date
                  AND t.date <= CURRENT_DATE
                  AND NOT t.is_pending
             ), 0) AS balance_minor
    FROM fin_account fa
)
SELECT a.name,
       a.currency,
       round(v1.balance * power(10, c.exponent))::BIGINT AS v1_minor,
       v2.balance_minor AS v2_minor,
       CASE WHEN round(v1.balance * power(10, c.exponent))::BIGINT
                 IS NOT DISTINCT FROM v2.balance_minor
            THEN 'match' ELSE 'DIFFERS' END AS verdict
  FROM finance_accounts a
  JOIN fin_currency c ON c.code = a.currency
  JOIN v1 ON v1.id = a.id
  JOIN v2 ON v2.id = a.id
 WHERE a.archived_at IS NULL
 ORDER BY verdict DESC, a.name;
