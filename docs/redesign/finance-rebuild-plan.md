# Finance, rebuilt from zero

Status: **design agreed, implementation not started.** Branch `rewrite/finance`.

This document is the contract for the rebuild. Nothing is written until the
shape below is settled, because the failure mode of a from-scratch rewrite is
not bad code — it is _silently losing behaviour that already worked_. §6 is the
inventory that prevents that, and every phase is checked against it.

What is being replaced: **69 files, 20,245 lines, 13 tables, 7 RPCs, 254
tests.**

---

## 1. Why a rewrite rather than more patches

Three defects are structural. No amount of local fixing reaches them.

**Money is floating point end to end.** `NUMERIC` columns read into JS numbers,
with `roundMoney` correcting at the edges via a string-exponent trick. Worse,
the types disagree with each other: the ledger's `transactions.amount` is
`NUMERIC(10,2)` — capped at 99,999,999.99 — while the balances _derived from
it_ (`finance_accounts.opening_balance`, `finance_budgets.amount`) are
`NUMERIC(18,4)`. A ledger cannot have a narrower money type than its own
aggregates.

**A transfer is a convention, not a structure.** Two rows sharing a
`transfer_group`, written together by a client-side helper. Nothing in the
database enforces the pairing, so a half-transfer is representable — and
`transferSummary` already has to defend against one. Worse, a _recurring_ rule
has one `account_id` and a `type` of earning-or-expense, so a repeating
transfer between your own accounts **cannot be expressed at all**. This is what
made the forecast drain by the transfer amount every fortnight.

**One obligation can be described twice.** A mortgage can exist as a
`finance_loans` row _and_ a `recurring_transactions` row. Both feed the
forecast. Nothing links or dedupes them; the Loans screen asks the owner to
_remember_ to archive the rule. Remembering is not a mechanism.

And one contradiction worth recording: `finance_goal_contributions`' comment
states a goal is "an earmark, not a transfer — writing ledger rows for it would
double-count", while `record_goal_contribution` writes a ledger row whenever an
account is named. The code and its own documentation disagree about whether
goals touch the ledger.

### What is _not_ wrong, and must survive

The rewrite keeps these decisions because the audit showed them to be correct:

- Balances **derived, never stored** (`account_balance` as a function).
- Rates **frozen at the transaction**, so history never re-prices itself.
- `rateFrom` returns **null, not 1**, for a missing rate — the single most
  expensive possible mistake, already avoided.
- RLS + `is_aal2()` on every table; SECURITY DEFINER functions fail closed.
- Recurring occurrences are **proposals**, confirmed with the real amount.
- Schedule maths: monthly re-anchors on `occurrence_day` (31 Jan → 28 Feb →
  **31 Mar**, no drift); biweekly is a fixed 14-day step.

---

## 2. The money model

> **One rule: an amount is an integer number of minor units, plus a currency.
> There is no other representation anywhere in the module.**

```ts
interface Money {
  minor: number; // integer. 1234 = $12.34. Never fractional.
  currency: string; // ISO 4217, uppercase
}
```

- **Postgres**: `BIGINT`. Not `NUMERIC`, not `DOUBLE PRECISION`. One width
  everywhere, so the ledger and its aggregates cannot disagree.
- **Exponent per currency comes from a table**, not from `Intl` at runtime.
  JPY has 0 decimals, KWD has 3; a storage layer that asks the browser what a
  currency's exponent is will disagree with the database that stored it.
- **No float ever touches a stored amount.** Parsing "12.34" → 1234 happens
  once, at the edge, in one function, with tests for the classic cases
  (`1.005`, `0.1 + 0.2`, values past 2^53 rejected rather than silently wrong).

### Arithmetic rules (the part to get right)

| Operation          | Rule                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Add / subtract     | Integer only. Mixed currencies is a **type error**, never an implicit conversion.                        |
| Multiply by a rate | `round(minor × rate)` with an explicit rounding mode, then re-express in the target currency's exponent. |
| Divide / split     | **Largest-remainder allocation.** Splitting 100 three ways yields 34/33/33, never 33.33 × 3 ≠ 100.       |
| Rounding mode      | Half away from zero, stated at every call site. Never left to `Math.round` on a negative.                |
| Comparison         | Integers, so exact. No epsilon anywhere.                                                                 |
| Cross-currency sum | Forbidden. Convert each amount at _its own_ frozen rate first, then sum.                                 |
| Missing rate       | Returns null and the amount is **excluded and named** — never counted at parity, never silently zeroed.  |

The last row is the fix for the identical-lines bug: the old run-rate read
`base_amount ?? 0`, counting an unpriced row as costing nothing while still
dividing the window.

---

## 3. Postings, which is what fixes the coupling

> **Correction, made while writing the SQL.** An earlier draft of this section
> called the model "double-entry". Written out as constraints, true double
> entry needs an _account_ for every category — a grocery shop posts −45 to
> Chequing and +45 to "Groceries", and every transaction sums to zero. That is
> a bigger change than the defects require and it would reshape every screen.
> What is built below is narrower and is named accurately: **a transaction
> header with postings, in which transfers are atomic.** A spend has one
> posting, because its counterparty is the outside world. A transfer has two,
> and they must balance. That is enough to make a half-transfer
> unrepresentable and a recurring transfer expressible, which is the whole of
> the problem.

Today a transaction is one row with a `type` of earning-or-expense. That is
what makes a transfer a convention rather than a fact.

The rebuild uses **a transaction header with balanced postings**:

```
fin_transaction   id, date, description, merchant, notes, kind, ...
fin_posting       transaction_id, account_id, amount_minor, currency, ...
```

- A **spend** is one transaction with one posting: −4500 on Chequing.
- A **transfer** is one transaction with two: −50000 on TFSA, +50000 on RRSP.
  It is atomic _by construction_. A half-transfer is not representable.
- A **cross-currency transfer** carries both real amounts (−1000 CAD, +60240
  INR) and the effective rate is derived from them — the observed fact,
  including the provider's margin, not a mid-market guess.
- A deferred constraint trigger enforces that same-currency postings within a
  transaction sum to zero.

What this buys, structurally:

- Balance = `SUM(amount_minor)` of an account's postings. One query, no
  `CASE WHEN type = 'earning'`.
- Income/spending is a property of the _category_ on a posting, not of a row's
  direction — so the earning/expense vs income/need/want/save/transfer
  two-vocabulary trap (which the current schema warns about in a comment)
  disappears.
- A transfer is excluded from spending totals because its postings net to zero,
  not because four different call sites each remember to filter
  `transfer_group`.

### Commitments absorb recurring rules _and_ loans

One concept, so the same debt cannot be described twice:

```
fin_commitment        what repeats: schedule, amount or amortisation, account(s)
fin_commitment_event  rate change, prepayment, amount change, ended
```

- A subscription is a commitment with a fixed amount.
- A mortgage is a commitment with an amortisation schedule — _not_ a separate
  loans table that the forecast adds on top of the rules.
- A recurring transfer is a commitment with two accounts. Expressible at last.
- Superseding is explicit: `supersedes_id`, so ending the tenancy when the
  mortgage starts is one action with one meaning, rather than remembering to
  set an end date on an unrelated row.

---

## 4. Module structure

```
src/features/finance/
  money/        minor-units, currency table, parse, format, allocate
  ledger/       postings, balances, transfers, reconciliation
  commitments/  schedule, occurrences, amortisation, supersession
  forecast/     projection, run-rate, drivers, scenarios
  budgets/      periods, rollover
  reports/      periods, category rollups
  import/       formats, classify, match, tidy, batches
  goals/        earmarks (no ledger rows — see §1)
  ui/           screens, unchanged in behaviour
```

Every directory is pure functions over plain data, with the React layer on top.
Dependency direction is one-way: `ui → domain → money`. `money` imports
nothing from the module.

---

## 4b. Who else reads these tables

Found by audit, and **not obvious**: the finance module is not the only reader
of its own tables. Two other modules bypass it entirely and query Postgres
directly. Any migration that reshapes or drops a table has to carry them.

| Consumer                                                                                         | What it reads                                                                                                | How                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `store/api/admin/dashboardApi.ts`                                                                | `transactions` (month totals, 7-day expense and earning series), `recurring_transactions`, `financial_goals` | Direct `supabase.from(...)`, not via the finance module                     |
| Calendar (`get_calendar_data` RPC)                                                               | `transactions` summed by date, excluding `transfer_group`                                                    | RPC, rendered as the `transaction_summary` entry kind in `build-entries.ts` |
| `calendar/overlay-detail-view.tsx`, `discover/market-panels.tsx`, `dashboard/dashboard-page.tsx` | `formatMoney` only                                                                                           | Import from `@/lib/money`                                                   |

Three consequences for the plan:

1. **`formatMoney` is a public seam.** Those three files use nothing else from
   the money layer, so its signature stays source-compatible while everything
   behind it changes. If the shape must change, those three change with it in
   the same commit.
2. **The dashboard and calendar must be ported in Phase 7**, before 027 runs.
   Dropping `transactions` with `dashboardApi` still pointed at it turns the
   dashboard into an error state, and the calendar loses a whole entry kind.
3. **`get_calendar_data` is a finance-shaped RPC living in the calendar's
   section of the schema.** The double-entry model changes how "money in and
   out on a date" is computed — postings summed per day, transfers netting to
   zero by construction rather than by a `transfer_group IS NULL` filter — so
   that RPC is rewritten as part of this work, not left behind.

## 5. Migration and cutover

**Nothing I write runs against the live database.** I produce SQL; the owner
runs it, after a verified restore.

1. **Backup** — owner exports data (done before any of this lands).
2. `025-finance-v2-ledger.sql` — currencies, settings, rates, accounts,
   categories, transactions, postings, the transfer-balance trigger and the
   balance functions. **Written and verified** against a scratch Postgres:
   7 tables, 3 functions, 15 assertions passing.
3. `026-finance-v2-commitments.sql` — commitments (absorbing both recurring
   rules and loans), their events and skips, the ledger's foreign key, and the
   unique occurrence index.
4. `027-finance-v2-rest.sql` — budgets, goals and their contributions,
   scenarios, import batches, learned category rules.
5. `028-finance-v2-backfill.sql` — copies every v1 row into the new shape:
   `amount NUMERIC` → `amount_minor BIGINT` via `round(amount * 10^exponent)`,
   transfer pairs → one transaction with two postings, loans _and_ recurring
   rules → commitments.
6. **Verification queries** ship _with_ the backfill: row counts per table,
   per-account balance old-vs-new, total-by-month old-vs-new. The cutover is
   gated on these matching to the minor unit.
7. `029-finance-v1-retire.sql` — drops the old tables. Run only after §6
   passes, after the dashboard and calendar are ported (§4b), and after the app
   has been used against v2. A separate file so it stays a separate decision.
8. `db/rollback-finance-v2.sql` — drops the new tables, leaves v1 untouched.
   Valid until 029 runs.

Numbering note: the split above replaced an earlier plan of one schema file
plus one backfill. One file per concern is reviewable; a single migration
carrying thirteen tables is not.

The existing `db/reset-habits.sql` / `reset-learning.sql` are the precedent for
tone and structure: a loud destructive header, tear-down, rebuild.

---

## 5b. Verifying the SQL before anyone runs it

`db/test/` holds a harness, not application code, and never touches a real
database:

- `prelude-supabase-stubs.sql` — an `auth` schema, `auth.uid()`/`auth.jwt()`
  driven by two session settings, and **verbatim copies** of
  `update_updated_at_column()` and `public.is_aal2()` from `db/schema.sql`.
  Copies rather than re-inventions: if the stubs drift from the real helpers,
  the verification is worthless.
- `verify-025-ledger.sql` — assertions run against a scratch Postgres in
  Docker. Each either passes or raises, so the script stops at the first thing
  that is wrong.

This exists because reading SQL carefully is not the same as running it. Two
defects in 025 were found by re-reading before it ever ran — a constraint
trigger that read `NEW` on a `DELETE`, where it is unassigned, and a balance
invariant that counted the provider fee as part of the transfer and so
rejected every transfer that cost anything to make. Both now have a named
regression check. A module whose argument is that money gets _verified_ rather
than asserted cannot ship a schema nobody has executed.

## 5c. What running `schema.sql` actually proved

Phases 1–6 verified every migration against a scratch Postgres and I took that
to mean the database layer was done. It was not. Three things were wrong, and
none of them was visible from the migrations.

**1. `db/schema.sql` never carried finance v2 at all.** The standing rule is that
a schema change ships as _both_ a numbered migration and the matching
`schema.sql` edit, so a fresh install and an existing one land in the same place.
025–030 were written and verified; the `schema.sql` edit was simply never made.
An existing database that ran the migrations worked, and a fresh install got no
`fin_*` tables whatsoever — the module would fail every read at runtime. Fixed:
`schema.sql` now carries all 16 tables, 8 functions, the 36-row currency seed,
and the two write RPCs, appended as its own section the way 020's loans were.

**2. The file could not be installed top to bottom.** Found by actually running
it, not by reading it. `finance_goal_contributions` declared
`account_id UUID REFERENCES finance_accounts(id)` about 1,100 lines _before_
`finance_accounts` was created, and Postgres resolves a foreign key at CREATE
time — so on an empty database the table failed outright, taking its index, its
`ENABLE ROW LEVEL SECURITY` and its policy with it. A fresh install ended up with
that table **absent**, not merely unprotected. This predates the rewrite: the
login screen tells the owner to paste `schema.sql` into the SQL editor and run
it, and that had apparently never worked end to end, because every real database
was built up through `db/migrations/` where the referenced table already existed.
Fixed by relocating the block to after `finance_accounts`, with a comment saying
why it does not sit beside `financial_goals` where it reads more naturally.

**3. The guard that should have caught both was one-directional.**
`column-names.test.ts` checks that every column an API slice filters on exists on
the table it queries — but it skipped any table it could not find in the schema:

```ts
const columns = TABLES.get(table);
// A table the parser did not find is not evidence of a bad column.
if (!columns) continue;
```

True as written, and it also excused a table missing from the schema _entirely_.
`financeV2Api.ts` queries seven `fin_*` tables that were in no schema, and the
suite stayed green over all of them. Same shape as the stale-allowlist hole in
§7d: a check that only fails in one direction eventually protects nothing. Now an
unknown table is its own failure, with no allowlist — a table an API queries has
to exist in the file that creates it. The parser's type list also learned v2's
enums (`_kind`, `_effect`, `fin_bucket`), without which `fin_account.kind` and
`fin_category.bucket` were not recognised as columns and a future
`.eq("bucket", …)` would have been skipped for exactly the same reason.

**The new guard.** `src/lib/schema-order.test.ts` reads `schema.sql` as text and
asserts every `REFERENCES x(` appears after `x`'s `CREATE TABLE`, plus that no
foreign key points at a table the file never creates (bar the three Supabase
provides). Static, because CI has no database — it catches the whole class
without one.

**How the fix was verified.** `schema.sql` run against an empty
`postgres:16-alpine` with the `db/test/` Supabase stubs. Listed errors went from
14 to 10; the four real ones are gone, and the 10 remaining are all
Supabase-managed objects absent from vanilla Postgres (`pg_net`, the `extensions`
schema, `storage.*`, and `analytics_secret` cascading from `extensions`). After
the run: `finance_goal_contributions` exists with RLS on and one policy, v2 is
16 tables / 8 functions / 36 currencies, and of 65 public tables **none** is
missing RLS.

One measurement note, because it misled me once: the harness executes the file
twice, and it is idempotent — on the second pass `finance_accounts` already
exists, the forward reference resolves, and those errors do not appear. A raw
error _count_ therefore always reports the re-run. The listed set is the evidence.

---

## 6. Functionality inventory — nothing here may be lost

Rebuilt code is checked against this list, feature by feature. Derived from
~120 exported functions across 20 logic modules and 18 test files.

**Accounts** — kinds; multi-currency; reconciliation anchor
(`opening_balance` + `opening_date`); credit limit, statement day, payment due
day; `is_liquid`; archive; sort; balance as of a date; include/exclude pending;
back-solving an anchor from a known balance; leak detection
(`findLeaks`, `checkAccount`, `backSolveAnchor`).

**Ledger** — add/edit/delete; pending flag; merchant, notes, raw description;
transfers incl. cross-currency with fee and derived effective rate; hidden FX
margin vs mid-market; transfer pairing and summary per corridor.

**Categories** — buckets (income/need/want/save/transfer); `is_essential`;
icon, colour, sort; per-user unique names; the 31 seeded defaults.

**Recurring / commitments** — five frequencies; `occurrence_day` overloaded by
frequency; start/end dates; `auto_post` vs confirm-first; `is_estimate`;
archive; the derived confirm queue (rules − posted − skipped); overdue count;
skip and unskip; confirmation drafts keyed on `occurrence_date`; detection of
schedules in imported history (`detectRecurring`, 70% gap regularity, still-
running, steady-amount, not-already-covered).

**Loans** — amortisation (annuity EMI); rate changes (hold EMI/move tenure, or
hold tenure/move EMI); part-prepayments; the "EMI no longer covers interest"
warning; schedule by year and by month; status (outstanding, progress,
instalments left); prepayment what-if with interest saved; upcoming payments
feeding the forecast.

**Forecast** — committed vs expected lines; discretionary run-rate from 90
days; unscheduled-income run-rate; horizons 3mo→7yr; daily arithmetic with
monthly _reporting_ past 18 months; shortfall date; lowest point; drivers
(recurring in/out, other income, day-to-day); scenarios (spend %, income %,
one-off, per-rule delta) with save/load; category forecast by category or
bucket; **plus the three fixes from the audit** — transfers excluded and named,
unconverted rows counted and reported, one-debt-twice detected.

**Budgets** — per category per month; rollover; elapsed-fraction pacing;
totals; suggestions for unbudgeted categories.

**Reports** — period ranges; per-category lines; comparisons.

**Import** — CSV parsing; format detection incl. date-order guessing and
amount-sign flipping; column mapping; account ref from last 4 digits;
deterministic `import_hash` dedupe; merchant normalisation (brands, channels,
cities, provinces); auto-classification into categories; learned category
rules; transfer-partner matching across accounts within a window; tidy
proposals; batch history; undo a whole import including unpairing.

**Goals** — target, current, target date, kind (save/payoff/buffer); account
link; contributions in and out with history; progress that survives a zero
target (no `NaN%`, no false 100%). **Resolve the earmark-vs-ledger
contradiction explicitly rather than inheriting it.**

**FX** — rate fetch and cache; history; percentile and verdict ("better than
usual"); unquoted currencies; per-corridor defaults.

**Cross-cutting** — private-figures blur; the health checklist ("before these
numbers can be trusted"); the guide; section navigation; zero-config fallback
when Supabase is absent; every figure honestly nullable rather than a confident
zero.

---

## 7. Phases

Each ships green: tests, tsc, lint, and the §6 items it covers ticked off.

| #    | Phase                                                         | Gate                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 ✅ | `money/` — minor units, currency table, parse/format/allocate | **Done. 66 tests, tsc/eslint/prettier clean.**                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2 ✅ | Schema v2 + backfill + rollback SQL                           | **Done and verified against real Postgres.** 025/026/027: 17 + 24 + 23 assertions. 028: 14 assertions against a v1 fixture, idempotent across two runs, every cutover gate `match` including per-account balance parity to the minor unit. 029: guard tested in both directions — refuses and drops nothing on a mismatched database, proceeds on a good one — then 5 assertions confirm v1 gone and v2 intact. Rollback exercised: 16 v2 tables → 0, v1 untouched |
| 3    | Data layer — API slices, tags, fallback mode                  | Endpoint reachability test                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4 ✅ | `ledger/` + `commitments/`                                    | **Done. 94 tests** across `commitments/schedule.ts` (19), `commitments/amortise.ts` (29), `ledger/flows.ts` (26), `ledger/balance.ts` (20). Amortisation was missed on the first pass and the row was marked done too early: the schedule says _when_ a commitment falls due, but an amortising one has no `amount_minor`, so its instalment must be derived before a mortgage can be projected at all                                                             |
| 5 ✅ | `forecast/` + `budgets/` + `reports/`                         | **Done. 121 tests:** `forecast/project.ts` (66), `budgets/period.ts` (30), `reports/report.ts` (25). Every audit defect is a named case, and the forecast closed one the audit had logged as unfixable in v1                                                                                                                                                                                                                                                       |
| 6 ✅ | `import/` + `goals/` + `fx/`                                  | **Done.** `goals/earmark.ts` (23 tests), `fx/source.ts` (19 — coverage v1 never had), `import/` as csv + statement + match + classify. `import/` and `reports/` together run 192 tests across 8 files, v1's own import suite included and still passing. (`fx/` is a directory §4 never named: rate _fetching_ is I/O and must not sit in `money/`, which is pure)                                                                                                 |
| 7    | UI onto the new domain                                        | 254 v1 behaviours re-covered                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 8    | Cutover                                                       | Owner runs 025/026, verifies, then 027                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 7b. Phase 1, as built

`src/features/finance/money/` — four modules, 66 tests.

- `minor-units.ts` — `Money { minor, currency }`, integers only. `money()`
  throws on a fractional amount and names `fromDecimal()` in the message,
  because that is the mistake every caller porting from the float API makes
  first. Parsing reads the _string_, never the float, so `1.005` → 101
  regardless of its binary representation. Negative zero is collapsed at
  construction. Amounts past 2^53 are rejected rather than stored, since they
  could not round-trip. Mixed-currency `add`/`subtract`/`sum`/`compare` throw.
  `allocate` uses largest-remainder, so a three-way split of 100 is 34/33/33
  and never loses a unit — in either direction of sign.
- `currency.ts` — the 36 offered currencies, display metadata only. The
  exponent deliberately lives in `minor-units`, and `unusualExponents()` exists
  so a test can assert the two never disagree.
- `rates.ts` — `rateFrom` returns **null, not 1**; `convertVia` returns null
  rather than throwing, because "no rate yet" is a state the screen renders as
  a named exclusion; percentile and verdict carried over intact.
- `format.ts` — `Intl` only, a real minus sign (U+2212) before the symbol,
  zero never signed, and `toInputValue` for the round trip through a text
  field that "1,234.50" would otherwise break.

One defect found by the tests, worth recording because it was mine: the first
version of the accumulation test asserted 10,000 × $0.01 = 100,000 minor units.
It is 10,000. The implementation was right and the expectation was wrong, which
is the argument for checking expectations as carefully as code.

## 7c. Phase 2, as built

Five migrations and a rollback, every one executed against a scratch Postgres
in Docker before being called done. `db/test/` holds the harness: Supabase
stubs, a v1 fixture, and one assertion file per migration.

- **025 — the ledger.** Currencies (with their exponents, so the database
  knows what a stored integer means), settings, rates, accounts, categories,
  transactions and postings. A transfer is a transaction with two postings and
  a deferred constraint trigger; a half transfer is unrepresentable. Balances
  are derived, in minor units, and fail closed without AAL2.
- **026 — commitments.** One table absorbing recurring rules _and_ loans, so a
  mortgage cannot be described twice. `from_account_id`/`to_account_id` make a
  repeating transfer expressible at last, and `supersedes_id` records that a
  mortgage replaced a tenancy rather than leaving it to be inferred.
- **027 — the rest.** Budgets, goals, scenarios, imports. Goals are earmarks
  that write no ledger row, their totals are derived rather than stored, and a
  target of zero is now unreachable.
- **028 — the backfill.** Ids are preserved, money becomes minor units, and
  four kinds of v1 row that v2 will not accept are _reported_ rather than
  dropped in silence.
- **029 — retirement.** Refuses unless v2 agrees with v1 row for row and
  balance for balance, and while the calendar RPC still reads `transactions`.

Six defects were found by running the SQL that reading it had missed: a
constraint trigger reading `NEW` on a `DELETE`; a balance invariant that
counted a provider fee and so rejected every transfer that cost anything; a
`CREATE TEMP TABLE ... ON COMMIT DROP` that would have vanished before the next
statement; a header insert that created ledger rows with no postings; a cutover
gate that called an AAL2-gated function and so reported failure for every
account; and a drop list that included the _portfolio_ module's
`update_item_order`. Two more were mistakes in the assertions themselves, where
the implementation was right and the expectation was wrong.

**Known gaps in the verification.** The guard's blocker _text_ was never read —
only its refusal was observed, because the function is created by the very file
under test. And the fixture defines only one of the seven v1 functions, so six
of 029's drops were no-ops rather than real removals.

## 7d. Phase 3, in progress

**v2 types** are in `src/types/index.ts` (tsc, eslint and Prettier clean).
Three conventions: every amount is an integer named `_minor`; a field is
optional exactly where its column is; direction is never a column — it is a
posting's sign, or which of a commitment's two account fields is set.

**Two findings from building the data layer, both recorded rather than worked
around:**

1. **An atomic write was missing.** 025 makes a half transfer unrepresentable
   _within a statement_, but a client writes a header and then its postings —
   two round trips, so two transactions. A failure between them leaves a
   transaction with no postings, and nothing in the schema fires to prevent it,
   because the trigger is on `fin_posting`. Migration **030** makes the write
   one function call: both halves or neither, with `SET CONSTRAINTS ALL
IMMEDIATE` inside the function so a bad pair raises there rather than after
   the caller has been told it worked. It also checks that every account and
   category id belongs to the caller — a SECURITY DEFINER function that trusted
   them would attach a posting to somebody else's account.

2. **The reachability test will need 25 allowlist entries, temporarily.**
   `endpoint-reachability.test.ts` requires every admin hook to be called from
   the UI or listed in `DELIBERATELY_UNUSED` with a reason — and it guards the
   list in both directions, so a stale entry fails too. Every v2 hook is unused
   until the UI lands in Phase 7. The entries are legitimate ("v2 data layer;
   the UI arrives in Phase 7") and **Phase 7 is not finished until that list is
   empty again.** Written here because an allowlist nobody revisits is exactly
   the failure that test was built to catch.

## 7e. The forecast, rebuilt

The module the whole rebuild started from. Of the four defects the audit found,
three are now impossible rather than repaired:

- **A superseded commitment kept firing.** `effectiveEnd` ends a commitment the
  day its replacement starts, from `supersedes_id`. The test proves the link
  alone is enough — the old commitment needs no end date, which is precisely
  what nobody remembered to set.
- **One debt described twice.** Loans and rules are one table; there is nothing
  left to double.
- **A transfer counted as spending.** This one needed thought rather than
  deletion, and `transferEffect` is the result. v1 always subtracted a transfer,
  so saving made the line fall forever. But simply _ignoring_ transfers is also
  wrong: money moved from chequing into a locked retirement account genuinely
  reduces what you can reach, even though net worth has not moved. So the sign
  depends on which side of the counted-accounts boundary each end sits.
- **Unpriced history read as zero** made the run-rate exactly nought and
  collapsed the two lines onto each other. Every total now carries the count it
  could not price, and the chart is expected to say so.

**And one audit item previously logged as unfixed is now closed.** An
occurrence due today and already paid used to be counted twice — once inside
today's balance, once as a projected flow — because v1 could not tell which
occurrence a transaction satisfied. `commitment_id` plus `occurrence_date`
makes it answerable, and `postedOccurrences` spends that.

Two of the test expectations were wrong on the first run and the engine was
right both times: a 60-day window from 1 January contains _three_ monthly
occurrences, not two, and rent due on the 1st falls on day zero of the horizon
rather than a month in.

## 7f. Phase 6, and two decisions worth not rediscovering

**Goals** are earmarks: no ledger rows, a derived total, and a target of zero
made unreachable. **FX** moved to its own directory because rate _fetching_ is
the only I/O in finance and `money/` stays pure; every failure path returns "no
rates" rather than throwing, because rates are an enhancement to a ledger that
must keep working without them.

**The importer produced two decisions that look wrong and are not:**

1. **The import fingerprint is computed from a decimal**, in a module where
   everything else is an integer. Migration 028 carries every existing
   `import_hash` across verbatim, so if v2 hashed minor units instead, every
   previously imported row would read as new and re-importing an overlapping
   statement would duplicate a year of transactions. `match.test.ts` proves the
   compatibility by comparing against v1's own implementation rather than
   asserting it — and `StatementRow.amount` stays a decimal for the same
   reason, because a statement row is _what the file said_, not a ledger amount.
   Conversion happens once, at the posting boundary.
2. **`import/classify.ts` is a verbatim copy, left unformatted.** ~700 lines of
   pattern-matching against real bank wording, accumulated from years of "this
   merchant is actually fuel, not groceries". It was copied with `sed` — four
   type names and one import path — because hand-transcribing it would have
   been the largest source of silent error in the rebuild for no benefit.
   Prettier is _not_ run on it: v1's original is unformatted too (the longest
   line is the same 1,017 characters in both), so formatting the copy is the one
   thing that would make it diverge and turn a provable claim into a stale
   comment. `classify.test.ts` compares the two implementations across every
   branch. Both the copy's exemption and those comparisons end when v1 does.

**Three test bugs, no implementation bugs.** A `replace_all` that matched only
the indentation I predicted and left a third `raw` field for tsc to catch; and
two fixtures keyed on a merchant key I guessed — "CORNER STORE", when `STORE` is
in the noise list and the real key is `CORNER`. In both of the latter, the
v1-versus-v2 comparison _passed_ while my own assertion failed, which is exactly
the right way round: the fixtures now derive the key from the normaliser instead
of predicting it.

## 7g. Phase 7 begins — the accounts slice

The UI lives in `src/features/finance/ui/`, per §4. v2 screens are built
_alongside_ v1: the admin route still renders v1's `finance-page.tsx`, and it
swaps once, at the end of the phase. Half a module behind a live route is the one
outcome worth refusing outright, and the migrations set the precedent — 025–030
ran beside v1 rather than cutting over table by table.

**The section fetches nothing.** `accounts-section.tsx` takes `accounts`,
`balances`, a `RateTable` and `base` as props. v1 had `finance-page.tsx` _and_
`accounts-tab.tsx` each call `useGetFinanceAccountsQuery` and
`useGetAccountBalancesQuery`, and each write its own near-identical
"convert every balance to base" loop — two sources for one number, which is how
two screens come to disagree about your net worth. The orchestrator will own the
queries; the section owns the arrangement. A side effect worth having: the
section and card are tested with no data layer mocked at all, so the arithmetic
is asserted against real domain functions rather than against whatever a mock
returned.

**`tableFrom` (money/rates.ts).** The `FinRate[] → RateTable` builder both v1
components wrote inline. Both read "the first row per quote" as "the newest",
which was true only because a `.order("as_of", { ascending: false })` sat in a
third file. An invariant whose proof lives in another module is one edit from
being false, and the failure is silent — every converted figure priced at some
arbitrary past day's rate. The ordering is now decided from the data.

**Two schemas, not one.** `finAccountSchema` is the column contract and speaks
minor units; `finAccountFormSchema` is what the form collects, with money as
typed text. Both live in `schemas.ts` — a component-local variant is forbidden,
and rightly. The form fragment checks only _whether the text is a number_,
matching `fromDecimal`'s grammar exactly, and a test demonstrates that agreement
against the real parser across fourteen inputs rather than asserting it in a
comment. Decimal places are deliberately not checked there: that depends on the
currency, and the money layer owns exponents. `money()` in `schemas.ts` refines
to two decimals, which is simply wrong for the yen and the dinar.

Worth recording: v1's account form validated nothing but a non-empty name and a
finite number — no bound on the name, no currency check — while
`accountReconcileSchema` covered those same two money fields a few lines away in
`schemas.ts`. (An earlier draft of this section said that schema was unused. It
is not: `balance-check-panel.tsx` validates its reconciliation anchor with it.
The fault was narrower and more ordinary — one form reached for the schema beside
it and the other did not.)

**The workspace owns the reads.** `ui/finance-page.tsx` holds all four queries —
settings, accounts, balances, rates — builds the rate table once with
`tableFrom`, and hands every section what it needs. It renders the nav from
`FINANCE_SECTIONS` rather than a list of its own, so the nav cannot claim a
section the module does not have; anything not yet rebuilt is marked "soon" and
says so on the panel instead of rendering an empty screen that reads as broken.
It waits for settings before drawing anything, because pricing against a
defaulted "CAD" while the real base currency is still in flight would put wrong
figures on screen and then correct them.

Its test is the one that proves the wiring rather than the markup: given a
CAD→INR quote of 60.24 and a balance of ₹60,240, net worth has to read
**$3,950.00**. That only holds if the query, `tableFrom` and the section's
conversion are all joined up — if the rate never arrived, the rupee account would
be reported as unconvertible and the figure would read $2,950.00.

**The allowlist is the gate.** Five hooks have left `DELIBERATELY_UNUSED` — the
four the workspace reads, and the one the account form writes. **31 of 36
remain**, and Phase 7 is not finished while any do. The list emptying is the
honest measure of this phase, not the file count.

_Worth not rediscovering:_ the stale-entry half of that test caught a claim in one
of my own comments. I wrote that five hooks had left the list while having
removed four — `useGetFinRatesQuery` sat further down, outside the block I
edited, so it was used and still allowlisted. A guard that only checked the
forward direction would have said nothing.

**One test lesson.** The first draft of `accounts-section.test.tsx` had net worth
and "Reachable" both landing on $1,750.00, because every fixture account happened
to be liquid. Two figures that coincide cannot be told apart — a bug returning
`liquid` where `total` belonged would have passed. The fixtures now make all
three stat figures distinct from each other and from every individual balance.
Likewise, an assertion counting how many times a formatted string appears pins
the test to the current layout rather than to the behaviour.

---

## 7h. The categories slice, and what "remove the old code" actually means

**Ported faithfully:** inline rename (a sheet to change one word is three
interactions and a context switch, and renaming is the commonest edit a category
gets), the five-way bucket radio group with its hints, `is_essential` as a
genuinely separate switch, `sort_order` spaced by ten, a new `need` defaulting to
essential, and the delete warning that says postings keep their amounts but lose
the label. The explanatory copy came across too — it is load-bearing, not
decoration: sorting your own categories is tedious, so the screen has to answer
"and then what?" before anyone will do it.

**Two things fixed rather than ported.** v1 bounded a category name with an
`Input maxLength` attribute and nothing else — a courtesy to whoever is typing,
not a check — so every write now goes through `finCategorySchema` first. And
`fin_category` has `UNIQUE (user_id, name)`, so a second "Groceries" used to come
back as a constraint violation with nothing to act on; it is refused here, by
name, before the write.

**Where it mounts.** Under "Budgets & goals", which is where v1 kept it. I did
_not_ add a categories entry to `finance-nav.ts`: that config is shared with v1,
so a new entry would give the live module a nav item rendering nothing. So `plan`
joins `BUILT` while being only partly rebuilt, and the section itself says budgets
and goals are still on the old ledger. A coarse nav plus a precise notice on the
screen beats marking a reachable section "soon".

`ui/missing-categories.tsx` is written but deliberately unmounted — it belongs to
the import flow, which is not rebuilt. It introduces no dishonesty in the
allowlist because it shares `useSaveFinCategoryMutation` with the section.

**The gate, counted rather than derived.** 30 entries remain in
`DELIBERATELY_UNUSED`, of which **28 are finance v2**; the other two
(`useDeleteFinanceAccountMutation`, `useGetAnalyticsDataQuery`) predate this work
and are unrelated to it. Counted from the file, because subtracting from "36"
gave me a wrong figure once already in this phase.

### On removing the old code

Asked to strip v1 and dead code, the honest finding is that there is almost
nothing to strip yet:

- **Two independent scans found no orphans.** No top-level finance module is
  unimported, and none has only test files as importers. Caveat worth keeping:
  the second scan reads `git ls-files`, so it sees only tracked files — the new
  v2 `ui/` files were invisible to it.
- **v1 is not dead, it is superseded and still live.** The admin route renders
  v1's `finance-page.tsx`, and eight of ten sections exist only there. Deleting
  those files now trades a working module for a broken one.
- **The v1 _tables_ still hold the real data.** `029-finance-v1-retire.sql` has
  not been run, and it refuses to run while `get_calendar_data` still reads
  `transactions` (§4b).

So removal is a single move at the end of Phase 7, not a running cleanup: swap the
route, port `dashboardApi` and the calendar RPC, then delete v1's UI and run 029.
Deleting it piecemeal as each section lands would leave the module half-broken for
the whole of the phase.

---

## 7i. The transfer model, and a green test that was wrong

`ledger/transfer.ts` is the write half of the ledger domain: `effectiveRate`,
`hiddenMargin`, and `buildTransfer`, which returns the `{ transaction, postings }`
payload `fin_record_transaction` takes.

**What v1 did, and why it is worth naming.** Its transfer form wrote leg one,
awaited it, wrote leg two, and on failure of the second showed _"Only half the
transfer was recorded — the money leaving X was saved but the arrival in Y was
not. Add it manually so the two balances agree."_ A data-integrity hole handled by
apologising to the owner. In v2 that branch does not exist, because the state it
apologises for cannot be represented: one RPC call, one transaction, both postings
or neither, with the deferred balance trigger forced immediate _inside_ the
function so a bad pair raises before the caller is told it worked.

**Two rules that look alike and are not.** Same-currency legs must net to zero,
so the arriving amount is **derived** rather than typed a second time — two
independently entered figures would agree only by luck and the trigger would
reject the whole write when they did not. Cross-currency legs must **not** be
forced to balance: the gap is the provider's margin, and netting it would be
inventing a rate. The fee rides on the sending leg, where it was charged, and is
excluded from the balance sum because a fee is money leaving for the outside
world rather than money arriving in your other account.

**Retired, not ported.** `transferPairs` and `transferSummary` existed to
reassemble rows sharing a `transfer_group` and to defend against a half-written
pair. Postings arrive on their transaction and a half pair is unrepresentable, so
both lose their reason to exist; the useful part of `transferSummary` — what has
gone along one corridor — is exchange-view work and belongs with that slice.

### The lesson worth keeping

`hiddenMargin` first computed `Math.round(out.minor * marketRate)` and treated
the result as minor units of the destination currency. **Its tests passed.** They
passed because the fixtures were CAD → INR, and both currencies have two
decimals, so multiplying raw integers happened to land in the right unit. On
CAD → JPY it was wrong by a factor of a hundred — reporting a ~3% margin as
~99% — and wrong in a way that still looks like a number on a screen.

The fix routes through `convertAt`, which scales by
`10 ** (exponentOf(target) - exponentOf(source))`, and the regression test is
deliberately CAD → JPY. A test whose fixtures share an exponent is not testing
the exponent. This is the fourth time in this rebuild that the arithmetic was
right in the module that owns it and wrong wherever someone re-derived it by
hand; it is the argument for the money layer existing at all.

---

## 7j. The activity slice

The ledger, the two forms, and the write path they sit on. This is the slice the
rest of the module was waiting for: nothing else can be rebuilt until v2
transactions can be entered at all.

**The filter reads postings.** v1 carried a `type` column and therefore needed a
second rule everywhere money was counted:

```ts
if (
  (filter === "earning" || filter === "expense") &&
  transaction.transfer_group
)
  return false;
```

Every surface had to remember it. Four did; the forecast did not, which is how a
fortnightly transfer to savings subtracted from the projection every two weeks
and never added it back. In v2 "money in" means a posting arrived that did not
come from another of your own accounts, and `isSelfTransfer` answers that from
the legs. The special case is not ported — it stops existing, and a row
mislabelled at entry still behaves correctly because the legs are the truth.

**A transfer is one row.** v1 displayed a move to savings twice, once leaving and
once arriving, because that is what the table held. One transaction with two
postings renders once and names both ends, with the arriving figure shown beside
it when the currencies differ.

**`priceInBase`, and the trap in it.** Both forms freeze `fx_rate` and
`base_amount_minor` onto each posting at entry, so a report over last February
says what February cost. The case worth writing down: a posting **already in the
base currency still needs `base_amount_minor`**, set to its own amount. Leaving
it null looks defensible — there is nothing to convert — but `flows.ts` counts a
null as `unpriced` and excludes it, so every ordinary domestic transaction would
vanish from every total while the foreign ones remained. The reports would be
wrong by most of the ledger and would still look like working screens.

That same null is what the row-level "not converted" warning reads, so the
warning and the totals line cannot disagree about which rows were left out.

**The gate: 24.** Counted from the file. The ledger's four hooks went when the
section mounted — not when the component was written. A hook reachable only by
grep is not reached.

_Two corrections made in this slice, both caught by their own guards:_ the
stale-allowlist check found me claiming five hooks had left the list when I had
removed four, and a fixture in `filter.test.ts` expected an account's ledger to
exclude its own income — the helper defaulted every posting to that account, so
the filter was right and the expectation was wrong. Corrected rather than nudged
to match the output.

---

## 7k. The reports slice

Ported whole, because the screen was already right: six range presets plus a
custom from/to, four figures with monthly averages, year bars only when there is
more than one year, the month chart with earned above the line and spent below,
spending by category with refunds netted, ranked merchants, and income listed
separately.

**The gap notice is the load-bearing part.** A report covering two months while
its label says three years is the one way this page can genuinely mislead, so
when the ledger starts after the range does, it says so with the real date. Its
Import button is deliberately **unwired** for now — the import screen is not
rebuilt, and a button leading to a panel that says "not rebuilt yet" is worse
than no button. `onImport` is optional and the workspace passes nothing.

**What changed under it.** `buildReport` takes `base` and returns `Money`, so
every figure is an integer amount rather than a float, and the bar heights read
`.minor`. `report.unconverted` became `report.unpriced` and now counts
**postings** rather than transactions — one transaction can have a priced leg and
an unpriced one — so the sentence was rewritten rather than copied.

The charts stay CSS. Three bar charts do not justify a charting library in a
route's first load, and v1 had already reached that conclusion.

### The lesson: derived when it should have been stated

`FIRST_BUILT` picked the landing section as _the first entry in nav order that
happened to be in `BUILT`_. Adding `"reports"` to that set silently moved the
module's opening screen off Accounts, because Reports sits earlier in the nav.
Nothing about the edit looked like a behaviour change — it added a string to a
`Set` — and only the workspace test caught it.

It is the same shape as every other defect this rebuild keeps turning up: a fact
that should have been stated once was instead re-derived from something nearby
that was free to change. The landing screen is now
`DEFAULT_V2_SECTION = "accounts"`, with the old scan kept only as a fallback for
when that section is not yet built.

---

## 7l. The commitments slice

The largest of the rebuild, and the one everything else was waiting on: the
forecast, the loans screen and Overview's queue all sit on it.

**One table, one form, one list.** `fin_commitment` absorbed v1's
`recurring_transactions` *and* `finance_loans`, so a subscription and a mortgage
are the same kind of thing with a different `kind`. That is the fix for "one
obligation described twice" — the Loans screen used to ask the owner to
_remember_ to archive the duplicate rule, and remembering is not a mechanism.
`fin_commitment_shape` makes a row carrying both shapes unrepresentable, and
`finCommitmentFormSchema` mirrors every one of 026's CHECKs so a mistake is a
message rather than an opaque failed save.

**The confirm queue is derived, never stored** — commitments, minus what was
posted, minus explicit skips. Three things in `commitments/pending.ts` are worth
keeping:

- Occurrences are keyed by the date they were **due**, not the date they were
  paid. A salary due Friday and entered Monday is still Friday's occurrence;
  matching on the paid date re-proposes it whenever the two differ.
- `effectiveEnd` means a superseded commitment stops proposing the day its
  replacement begins, without anyone having set an end date on an unrelated row.
  This is the bug the whole rebuild started from.
- An amortising commitment proposes the instalment **read off its schedule**,
  not `paymentFor(principal, rate, tenure)`. A floating-rate loan that has
  re-priced no longer pays what it started at, and asking the owner to confirm
  the opening figure would be wrong in a way that still looks like a number.

A commitment naming both accounts confirms as **two balanced postings** — the
recurring transfer v1 could not express at all, which is why its forecast watched
money leave for savings every fortnight and never arrive.

**Overview leads with the queue**, deliberately. Every figure above it is
conditional on it being empty: an unconfirmed paycheque from three weeks ago does
not make the balances approximate, it makes them wrong. A screen showing totals
first would be inviting you to trust them.

**The gate: 20 entries, 18 finance v2.** Counted from the file. The four
commitment mutations went when their components were written; the two queries
only when the workspace actually wired them — a hook reachable by grep is not
reached, and the stale half of that test has now corrected this count three
times.

### The lesson: a threshold that was true when it was written

`expect(getAllByText("soon").length).toBeGreaterThan(5)` passed when three
sections were built and failed at five, having asserted nothing meaningful in
between. Nudging it to `> 4` would have bought one section before rotting again.
What the test means is "every unbuilt section is marked and no built one is", so
it now counts the unbuilt sections and compares. The list of built sections is
restated in the test rather than imported from the component — importing the
private `BUILT` would let the test agree with the implementation by
construction, and pass even if the nav rendered nothing.

---

## 7m. The forecast slice

The screen the reported bug was filed against, rebuilt onto a domain where three
of the four original defects are unrepresentable rather than fixed.

**Most of v1's warnings are gone because their conditions cannot occur.** That
screen checked for one debt entered as both a loan and a recurring rule, for
transfer rules counted as spending, and for rules whose currency had no rate.
Loans *are* commitments now; `transferEffect` nets a transfer by which side of
the counted-accounts line each end sits on; and `buildForecast` returns
`unconvertible` and `unpriced` itself rather than the screen recomputing them
alongside. `loanRuleClashes`, `selfTransferRules`, `unconvertibleRules` and
`unconvertedInWindow` all retired with the defects they described.

**What survived, because it still says something the line cannot.** The
`unpriced` count is the one that matters: when the run-rate window is entirely
unpriced the rate is exactly zero and "Expected" *becomes* "Commitments only" —
the two-identical-lines symptom that began this rebuild. Without that notice a
reader concludes they spend nothing. It now has a test.

**`unreconciled`** is new, in `ledger/balance.ts`. v1's `checkAccount` had no v2
equivalent, and the warning it drove is worth keeping: a line drawn from an
anchor nobody set is confidently wrong, and bank exports carry transactions but
no balances, so an unanchored account is the normal state after an import rather
than an edge case. Two conditions, reported and never corrected — what an account
held on a date is a fact only the owner has.

**Scenarios** are rewritten against `FinScenarioAdjustment`: `amount` became
`amount_minor`, `recurring_delta` became `commitment_delta`. `fromAdjustments`
still reports `exact: false` when a stored scenario is richer than four controls
can show, because showing the sliders as though they described it would be a
quiet lie.

### Two lessons, both about tests that were true when written

`expect(getAllByText("soon").length).toBeGreaterThan(5)` and a test that clicked
"Forecast" as its example of an unbuilt section both passed until the rebuild
moved past them — the first at five sections, the second the moment Forecast was
built. Neither was testing anything wrong; both had pinned an example instead of
stating an intent. They now derive from the same list the component renders: one
counts the unbuilt sections, the other asks which section is unbuilt. A test that
needs hand-editing every time the work advances is a test that will eventually be
edited without thought.

Also: `scenario-io`'s round-trip test compared `Number(...)` with `toBeCloseTo`
and passed while the field reopened reading "1250.5" for a scenario saved from
"1250.50". The value round-tripped and the text did not, and the text is what the
reader sees. Fixed with `toInputValue`; the assertion is now the exact string.

**The gate: 17 entries, 15 finance v2.** Counted from the file.

---

## 7n. The loans slice

A loan is an amortising commitment, so this section **creates nothing**. The
commitment form makes and edits the row; what lives here is what a loan *does* —
the schedule, what is outstanding, and the two events that change it. A second
way to create the same row would be a second place for the two to disagree, so
"Add a loan" and "Edit terms" both open the commitment sheet the workspace
already owns.

**Every figure is in the loan's own currency first**, with base beside it at
today's rate. That is the shape of the problem the module exists for — an Indian
home loan serviced from a Canadian salary — and the two figures are not
interchangeable: the bank's number is fixed and the cost in dollars moves every
month. Saying "at today's rate" beside each converted figure is how the screen
stays honest about which one is which. A loan whose currency has no cached rate
is **named and excluded** from the across-loans total rather than added at
parity, the same rule the rest of the module follows.

The schedule is derived from the terms plus the events, never stored, so a figure
here cannot go stale against one there. That is also why deleting an event says
"the schedule is rebuilt without it, so every figure on this screen changes" —
it is not a soft warning, it is what happens.

Two things the tests caught, both of the same kind — an assertion that was true
before the behaviour existed:

- `getByText(/removes/)` for the prepayment result also matched the section's own
  standing blurb, "see what it removes". Both the positive and the negative case
  passed vacuously. They now assert the outcome line.
- The warning fixture used a 12-month loan and could never have fired. At that
  tenure the instalment covers the interest at *any* rate the column permits
  (0–100), so the "instalment no longer covers the monthly interest" branch is
  unreachable — it needs a long tenure, where the payment is small against the
  balance. The fixture is now 240 months and the assertion names the warning
  text instead of matching `/instalment/i`, which the StatCard title satisfied
  regardless.

`getByText("Instalment")` also matched two elements — the StatCard title and the
schedule's column header. Scoped to `getByRole("heading")`.

**The gate: 15 entries, 13 finance v2.** Counted from the file, not added up —
and the count script's first regex classified `useDeleteFinanceAccountMutation`
(v1) as finance v2, which is the fourth time arithmetic on this list has been
wrong. What remains: settings, currencies and cache-rates (exchange), delete
account, three budget hooks, three goal hooks, three goal-contribution hooks.

---

## 7o. The exchange slice

The rate is the number this module is most exposed to and controls least, so the
screen is built around three admissions rather than around a chart:

1. **A cached quote has a date, and that date is a fact about every screen.**
   Everything else in the module converts from the newest cached quote, so "how
   old is it" is not a question about Exchange — it is a question about the net
   worth figure on Overview. Stated here, in days, rather than implied.
2. **"Is 61 a good rate" is unanswerable on its own.** `ratePercentile` refuses
   to score fewer than ten samples, and the screen says why instead of showing a
   confident number derived from three days of noise.
3. **The margin is the cost; the fee is not.** A zero-fee provider quoting 58
   against a market of 61 has taken 5%, and nothing else in the module would
   show it.

**It does not touch the network to open.** History is loaded by asking. A screen
that fetches in order to render is a screen that fails to render on a bad
connection, and rates are an enhancement to a ledger that has to keep working
without them — the feed being down means figures show in their own currency and
totals say they are incomplete. There is a test whose whole job is that the two
fetch functions are not called on mount.

`fx/remittances.ts` is new, and deliberately **recognises** remittances rather
than flagging them: a remittance is just a cross-currency transfer between two
accounts you own, which the ledger already stores as one transaction with two
postings. Detecting it from the postings means a transfer recorded a year ago
appears on this screen, and there is no flag that can drift from the data. Two
rules carried over from the money layer: the margin is **null, not zero**, when
no rate was cached for that day (an unknowable cost reported as nothing makes the
worst provider look free), and `rateOn` resolves the rate **as of the transfer's
date**, never today's — re-pricing a May transfer at September's rate would
report a margin that has nothing to do with what was on offer. It also never
reaches forward for a quote published after the event.

This is where `hiddenMargin` finally gets a caller — the function whose exponent
bug was green under its own tests until CAD→JPY was tried.

**A real test gap, stated rather than papered over.** Choosing a currency is the
path that calls `saveFinSettings`, and Radix's `Select` does not open under jsdom
even with the pointer-capture and `scrollIntoView` shims. There is no precedent
in this repo for driving one in a test. Clicking a trigger that never opens
asserts nothing, so that case was removed rather than left passing for the wrong
reason; the corridor-unset branch is covered instead.

**The gate: 12 entries, 10 finance v2.** Counted. What is left is one delete and
the plan section's nine — three budget hooks, three goal hooks, three goal
contributions.

---

## 7p. The plan slice — and the allowlist reaching zero

Budgets, goals and categories together: the same subject at three scales. A
category is what a thing is, a budget is how much of it you meant to spend this
month, and a goal is what you are not spending at all.

**Budgets lead with the pace.** Being 60% through the grocery money is fine on
the 20th and alarming on the 8th, so every line states where you should be by
now, and the bar carries a tick at the elapsed point — a bar at 60% says nothing
alone and says everything next to a mark at 25%. Two admissions carried up from
`budgets/period.ts`, both places v1 quietly understated spending: postings with
no exchange rate are **named as excluded** rather than counted as zero, and a
budget set in another currency is **named, never converted** — re-pricing a limit
set in March at September's rate makes it not a limit.

**Goals say the money has not moved.** v1's own table comment said an earmark is
not a transfer and its RPC wrote a ledger row anyway, counting the same money
twice. The screen states it in the header, because a progress bar that looks like
a savings account is precisely how someone comes to believe the money left. The
balance is derived from the contributions, so deleting one corrects it by itself;
a withdrawal larger than the balance is refused before the round trip, with the
constraint trigger from 027 still the authority.

`finBudgetFormSchema`, `finGoalFormSchema` and `finContributionFormSchema` are
new in `schemas.ts` — every admin form that persists has to validate against one.
The budget schema pins `period` to the first of a month, mirroring
`fin_budget_period_is_a_month`: a row dated the 14th would be written happily and
then never matched by `buildBudgetPeriod`, whose lookup is by exact key.

**Deleting an account** now has a home, and a rule: offered only for an account
the ledger has never touched — the escape hatch for one added by mistake, where
archiving leaves a permanent tombstone for something that never existed. One
posting in, and the offer disappears; archiving is the only route, because
deleting would orphan history and silently change every past total.

A fixture caught by the schema rather than by a test: category ids like `"c1"`
passed every domain function and failed `finBudgetFormSchema`'s `uuid()`. The
column is UUID, so those rows were ones Postgres would refuse — the schema was
right and the fixture was wrong.

**The gate: 2 entries, 0 finance v2.** Both survivors predate this rebuild —
v1's `useDeleteFinanceAccountMutation` and the superseded
`useGetAnalyticsDataQuery`. The finance v2 allowlist, which §7's own rule says
must be emptied before the rebuild can be called finished, is empty.

What remains of phase 7 is two sections with no data layer of their own: **import**
and **guide**.

---

## 7q. Guide and import — phase 7 is done

**Guide** reuses `finance-guide.ts` unchanged. It is writing rather than code,
and it was already written for this module — it names the Exchange section, the
reconciliation anchor, EMI on a floating rate. What the screen adds is that the
setup steps **answer themselves from real data**: a guide that tells someone with
six accounts to add an account is one nobody opens twice, so each step checks its
own `doneWhen` and only the first unfinished one is expanded.

**Import** is the largest screen in the module, and the four things it has to get
right before writing a single row are each a place where a silent mistake would
poison every figure downstream:

1. **The format** — detected, then shown, because a wrong column guess is obvious
   to a person and invisible to a parser.
2. **The signs** — a reversed file turns a year of groceries into a year of
   income. `suggestFlip` names the suspicion; nothing flips itself.
3. **What is already here** — re-importing an overlapping range is the normal
   case. Already-imported rows are recognised by hash and excluded; a row that
   merely *looks* like something entered by hand is flagged and left selected,
   because the import cannot know and the owner can.
4. **The other half of a transfer** — a row matching a transaction in another
   account is money already recorded. Excluded by default with the match named,
   rather than merged automatically: writing it would record one movement twice,
   and auto-merging would edit a transaction the owner did not ask to touch.

Corrections become **rules**, not history — the classifier deliberately never
learns from previously imported rows, which is how one wrong guess used to become
permanent. And because a rule is a standing instruction, the rules are listed with
a way to forget one; something learned silently must be visible and removable, or
the feature is only safe while it is never wrong.

Four endpoints were added and all four are reached: category rules (read, teach,
forget) and the import batch. The batch is created **before** the rows, so each
carries `import_batch_id` and "undo that import" stays answerable; its FK is
`ON DELETE SET NULL`, because forgetting an import is a different decision from
deleting what it brought in. One failed row does not abandon the rest — the hash
makes a re-run skip everything that landed.

**The scaffolding is gone.** With import built, `BUILT` covered all ten sections,
the "soon" badge could never render and the "Not rebuilt yet" panel was
unreachable. All three were removed. Two tests were retired with them — and their
retirement was written into them a slice earlier: both derived their subject from
the nav rather than naming a section, which is why neither rotted as the rebuild
advanced, and why the second failed on its own message, *"every section is built —
retire this test"*. What replaces them asserts every section renders with no
placeholder anywhere.

**Phase 7 is complete.** Every section in `FINANCE_SECTIONS` has v2 content, and
the reachability allowlist holds nothing from finance v2.

What is left is **phase 8, the cutover** — and it is a data question, not a UI
one. `/admin/finance` still serves v1 because the dashboard and the calendar's
`get_calendar_data` still read v1's `transactions`. Swapping the route first would
leave two live modules writing to two different ledgers, which is worse than
either one alone.

---

## 7r. Phase 8 — the cutover, as done

`/admin/finance` now renders the rebuilt module and `/admin/finance-v2` is gone.
The order mattered: **the readers moved first**, because swapping the route while
the dashboard and calendar still read v1's `transactions` would have left two
live modules writing to two different ledgers — worse than either alone.

Deleted: 64 v1 files under `src/features/finance/`, four API slices
(`financeApi`, `financeSetupApi`, `loansApi`, `importApi`), and the preview
route. Kept from the flat directory: `finance-guide.ts` (writing, not code, and
already written for v2), `finance-nav.ts`, `use-private-figures.ts` and the CSS
guard `figures-hidden.test.ts`.

Three screens outside finance — the dashboard, the calendar overlay and Discover
— read the base currency from v1's `useGetFinanceSettingsQuery`. They now use
`useGetFinSettingsQuery`; the field is the same.

**Deleting the reference implementation destroys the evidence, unless the
evidence is kept first.** Two v2 test files compared themselves against v1
directly — `import/match.test.ts` proving the import hash matches **byte for
byte** (migration 028 carries every `import_hash` across, so a changed hash would
make every imported row read as new and silently duplicate a year of
transactions), and `import/classify.test.ts` comparing the copied classifier
across sixteen real statement descriptions. Both said "this goes when v1 does".

Neither claim was dropped. v1's actual output was **generated on the commit that
deleted it** and frozen — the hashes as literals, the classifier's behaviour as
`import/v1-behaviour.json`. The tests still pass against it, which is the proof
that the copy is faithful. **That file must never be regenerated**: refreshed
from the code it checks, it would assert only that the code equals itself.

The reachability gate did its job one last time. Deleting v1's UI made 30-odd v1
endpoints unreachable and the suite said so, endpoint by endpoint — which is
exactly how the slices came to be deleted rather than left behind. The allowlist
now holds **one** entry, `useGetAnalyticsDataQuery`, which predates all of this.

**What is left is not code.** Migrations 025–032 have to be applied. Migration
029 — which drops the v1 tables — is deliberately not run: its code-side
prerequisites are now met, and its own advice is to wait weeks of real use with a
backup someone has actually restored. Its stale note claiming the dashboard still
queries `transactions` has been corrected, because a prerequisite list that is
wrong is worse than none.

---

## 8. Risks

- **Data loss.** Mitigated by: backup first, additive migrations, verification
  queries gating cutover, retirement as a separate file, rollback script.
- **Silent behaviour loss.** Mitigated by §6 and by porting the existing 254
  tests as the acceptance set rather than writing fresh ones that agree with
  the new code by construction.
- **Scope.** This is the largest single change in the repo's history. It lands
  on `rewrite/finance` and merges only when §6 is fully ticked.
- **Nothing here has been seen in a browser.** The admin needs the owner's MFA.
