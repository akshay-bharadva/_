# v3 — Implementation log

The running record of the v3 rebuild: what each module became, why, and the
decisions that outlived it. `v3-design-vision.md` states the visual identity and
`v3-admin-interaction-standard.md` states the interaction rules; this file is
the evidence — what was actually built, and which mistakes are already paid for.

**Append a section here when a module is finished.** A module is not done until
its entry exists, because the next module inherits its decisions whether or not
they are written down.

---

## How to read this

Each module entry answers three questions:

- **Was** — what it did before, stated plainly enough to explain the change.
- **Is** — the model it works on now.
- **Carried forward** — decisions other modules should reuse or respect.

The last sections are cross-cutting: **Recurring patterns** is what to reach
for, **Traps already paid for** is what not to rediscover.

---

# Part one — Foundations

## The design system

**"Surface".** Hierarchy comes from elevation, size and space — not from labels
and lines. The tokens live in `src/styles/globals.css`:

| Token                                   | Purpose                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `--e-1/2/3` → `shadow-e1/e2/e3`         | The only elevation scale. Tailwind's default `shadow-sm/md/lg` is banned. |
| `--r-surface` → `rounded-surface`       | Panels, cards, sheets.                                                    |
| `--r-control` → `rounded-control`       | Buttons, chips, inputs.                                                   |
| `--m-enter` / `--m-exit` → `ease-enter` | Motion curves.                                                            |
| `--band-y`                              | Vertical rhythm between public page bands.                                |

Two rules that bite if forgotten:

- **A surface is a fill plus an elevation.** Never a border _and_ a shadow.
  Where a design wants both states they swap: outlined at rest, raised on hover,
  with the border going transparent so nothing shifts (see Notes cards).
- **Colour never appears in `globals.css`.** The 52 presets own colour and are
  contrast-gated by `theme-contrast.test.ts`; a raw hex sits outside that gate
  and does not move when the visitor changes theme.

`src/styles/design-system.test.ts` fails the build if a retired v2 motif returns
— graph-paper grounds, dotted rules, numbered `01 / Work` labels, the terminal
status line, mono as a decorative metadata voice, the left icon rail.

**Elevation was wrong twice before it was right.** It derived from
`--foreground`, which made every shadow a white glow on the 26 dark presets; and
at 5-6% opacity it gave less definition than the v2 `border + shadow-sm` it
replaced. It is now a fixed near-black hue at roughly double strength, with an
inset highlight under `:root.dark`.

## Layout primitives

- **`Band`** — a full-bleed horizontal section of a public page, weighted
  `feature` / `content` / `accent`. A public page is a sequence of bands whose
  weights alternate.
- **`Surface`** — a fill plus an elevation, where elevation encodes interaction
  state rather than decoration.

Compose these rather than re-deriving padded containers and bordered cards per
page.

## The admin shell

A single floating top bar over a full-width main. **No sidebar rail** — module
navigation is `GlobalCommandPalette`, driven from `NAV_GROUPS`, so the module
list cannot drift from the nav config.

---

# Part two — Modules

## Content (CMS)

**Was** — sections were primary and pages were an accordion grouping, so there
was no way to see a page as a thing, and creating a section meant choosing its
page from a dropdown after the fact.

**Is** — a persistent tree of pages beside an editor. Pages expand to their
ordered sections; HTML5 drag reorders within a page, or moves a section between
pages by dropping on a page header.

**Carried forward** — the two-pane master/detail shape, and `content-tree.tsx`
as the reference implementation of drag-to-reorder with a visible scope.

## Blog

**Is** — a single `PostList`/`PostRow`, previously a `PostsTable` and a
`PostCards` hidden from each other by a breakpoint, with publish/unpublish on
the row.

**Carried forward** — `post-content.tsx` now holds only what is specific to a
post (every link opens a new tab); the markdown pipeline moved to
`components/ui/rich-markdown` so Notes could share it.

Three bugs worth remembering:

- The table of contents used a one-shot effect, so it missed both late-arriving
  _content_ and a late-arriving _article_. It now uses two `MutationObserver`s —
  an arrival watcher on `document.body`, then a content watcher on the container.
- Reading progress measured the window, not the article. It now measures through
  the article with `getBoundingClientRect` and a `ResizeObserver`, and a short
  article that fits entirely on screen no longer reports 100% read.
- A long table of contents could not scroll independently of the page.

## Updates (public + admin)

**Is** — a scrapbook wall of ordered masonry, and an admin board sharing the
same ordering.

**Carried forward — the masonry rule.** CSS `columns-*` fills each column to the
bottom before starting the next, so a newest-first feed reads down the entire
left column before reaching the second item; and cards split across the column
break, which is what cut the washi tape in half. CSS Grid fixes the order but
leaves a hole under every card shorter than the tallest in its row.

Neither pure-CSS option gives both. **`distributeColumns` in
`src/hooks/use-column-count.ts`** deals items round-robin into one bucket per
column, each rendered as a flex stack: reading across the top row gives
newest-first, each column stays chronological, nothing leaves a gap. Used by
Updates and Notes. Chunking instead of round-robin reintroduces the original
bug, which is why a test asserts the top row is `[0,1,2]` and not `[0,3,6]`.

## Navigation

**Was** — a list of labels with a visibility switch.

**Is** — the site's page manifest. `(public)/[...slug]` builds one prerendered
page per _visible_ nav link whose first segment is not reserved, so for those
paths the link is the only thing making the page exist. Each row states what its
path resolves to:

| Kind            | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| Built-in page   | Has its own route file; exists whether linked or not.      |
| CMS page        | Exists only because this link does.                        |
| No page exists  | Reserved, so the CMS skips it, and no route serves it.     |
| Not a site path | An absolute URL, which the build turns into a broken path. |

`/experience`, `/404` and `/500` are all in the third state today.

**Carried forward** — `RESERVED_SEGMENTS` and `BUILTIN_ROUTES` moved to
`src/lib/constants.ts` so the admin and the route agree rather than the admin
guessing. Hiding a CMS link _removes the page from the build_, so it confirms;
hiding a built-in page's link does not, so it does not.

## Assets

**Is** — a browser where usage is first-class.

**Carried forward — two findings:**

- **A move must not rename.** The dialog built its destination from `file_name`,
  the original browser-reported name, while the stored key is
  `<timestamp>_<sanitized>`. Moving therefore dropped the uniqueness timestamp
  and the path sanitisation; and because the storage move runs _before_ the
  database update, a `file_path` collision failed after the object had already
  moved. `targetPathForMove` derives from `file_path`.
- **`used_in` is a warning, not decoration.** Delete names the content that will
  break; move confirms too, because it rewrites the URL and nothing updates the
  references pointing at it.

## Tasks

**Is** — projects, scheduling, dependencies, recurrence, and four views: board,
list, table, and a read-only timeline. Migration `001`.

**Carried forward:**

- **"Blocked" is derived, never stored.** A stored flag is a second copy of a
  fact the dependency graph already holds, and the two drift the moment a
  blocker is completed by a path that forgets to clear it. Computed at render,
  so finishing the last blocker clears it everywhere with no second write.
- **The client never sends a schedule.** Cycle rejection is a database trigger
  (`reject_dependency_cycle`); the picker only offers non-cycling candidates so
  the trigger is never the first time the owner hears "no".
- **Completing a repeating task creates the next instance** rather than
  resetting the current one, so what was finished stays in history. The
  start/due gap is preserved; tracked time does not carry forward; monthly
  repeats clamp to month end; all date maths is UTC so a daily task does not
  skip or duplicate a day at a DST boundary.
- **The project rail** — projects as navigation, not as another filter chip.
  Reused by Notes for tags.
- **The toolbar** — search left; sort, group and a `Filters` popover with an
  active count on the right. Reused by Notes.

## Habits

**Is** — schedules, quantified habits, quit habits, archiving. Migration `002`.

**Carried forward:**

- **A schedule is what makes a streak mean anything.** `target_per_week` was a
  bare number with no notion of _which_ days, so a Mon/Wed/Fri habit broke its
  streak every Tuesday and a weekends-only habit that never missed reported 29%
  completion. Every derived number is computed against `isDueOn`.
- **Quit habits invert.** Success is the absence of a log, so their streak is
  floored at `created_at` — without a floor a clean quit habit reports a streak
  running to the loop bound.
- **A today view, not a grid.** The module opened on a habit-by-day grid, which
  is a record of the past rather than a prompt for the present.
- **The XP card was removed.** Its score was the raw count of every log ever
  written, so fourteen habits ticked once outranked one habit kept for a
  fortnight — the opposite of what a tracker should reward.

## Learning

**Is** — spaced review. Migration `003`.

**Carried forward:**

- **Self-assessment was replaced by behaviour.** The module asked for a status
  and a 1-5 confidence score, acted on neither, and never showed a "Mastered"
  topic again — so everything learned decayed silently. A recall rating is one
  tap, is a real signal because it follows an attempt to remember, and schedules
  the next review.
- **Guilt is designed out on purpose.** The queue is capped at 20 reviews and 5
  new topics a day, because an unbounded backlog after a fortnight away is the
  most reliable way to make someone close a study app for good. A never-reviewed
  topic is _new_, not overdue. "Again" brings a topic back tomorrow rather than
  burying it.
- **Recall rate replaces hours studied.** Time spent rewards sitting still.
- **`record_learning_review` computes the interval in the database**, so a
  review and the topic state it produces cannot disagree; `spaced-review.ts`
  mirrors it only so the UI can preview intervals.

## Notes

**Is** — Keep-style cards on ordered masonry, wikilinks with backlinks, and
editing in place on the note view. Migration `004`.

**Carried forward:**

- **Links live in the text, not a join table.** A link cannot outlive the
  sentence that created it, and there is nothing to keep in sync on save. Code
  fences are skipped — a double bracket in a snippet is code. Unresolved links
  render as plain text and are offered as "not written yet".
- **Colour is `color-mix` against the card token**, not a fixed alpha over
  whatever is behind it. Mixing toward the theme's own surface keeps the text
  contrast the card was designed with; a flat tint made every colour converge on
  grey on a dark preset.
- **One renderer for the card and the view** (`NoteBody`), so a note cannot look
  like two different things depending on where you see it.
- **A document wants the page, not a drawer.** Editing happens on the note view;
  creating opens the same screen empty.

---

# Part three — Recurring patterns

Reach for these; they are already tested and already argued for.

**Derive, do not store.** Blocked (Tasks), settled (Learning), perfect day
(Habits), overdue (everywhere) are computed at render. A stored copy of a
derivable fact drifts the moment any write path forgets to update it.

**Archive, do not only delete.** Anything holding history — habits, topics,
notes, tasks — gets archiving as the default retirement path, and delete says
what goes with it and that archiving is the alternative.

**One control at every width.** No `hidden md:block` sidebar paired with a
`md:hidden` scroller. A component reflows; it is not swapped for a different one
behind a breakpoint. This pattern was removed from Blog, Life Updates, Habits,
Assets, Tasks and Notes.

**Bounds mirror the column.** Every Zod bound matches a CHECK constraint. A
value the form accepts and Postgres rejects surfaces as an opaque write failure.

**Atomic writes are RPCs.** `update_task_order`, `add_task_time`,
`set_habit_log`, `record_learning_review`, `update_habit_order`. A client-side
read-modify-write loses data whenever two operations race on a stale row.

**Confirms name the consequence.** "This cannot be undone" is not a confirm. Say
what breaks: which content references this asset, how many tasks stop being
blocked, that the page will 404.

**Heavy dependencies are code-split.** TipTap at the `novel-editor` barrel,
`rehype-prism-plus` behind `next/dynamic`. Check per-route First Load JS in the
build output after touching a shared module — importing the markdown pipeline
directly took `/admin/notes` from 12.7 kB to 301 kB.

**Empty, loading and error are designed states**, shaped like the thing they
stand in for — a masonry skeleton for a masonry list, not a generic grid.

---

# Part four — Traps already paid for

Do not rediscover these.

**Postgres forbids subqueries in CHECK constraints.** `NOT EXISTS (SELECT ...)`
fails the whole migration. Use an operator — `schedule_days <@ ARRAY[1,...,7]`.

**`auth.uid()` is NULL in the Supabase SQL editor.** It runs as the service
role, so seed data left to the column default is owned by nobody and invisible
to both the app and RLS. Set `user_id` explicitly from the first `auth.users`
row — the same rule `is_admin()` uses.

**`tiptap-markdown` escapes square brackets.** It serializes through
prosemirror-markdown, so a wikilink typed in the editor is stored
backslash-escaped. Any pattern matching editor output must tolerate the escapes.
This silently broke every link in Notes.

**Sanitization runs after highlighting.** `rehype-sanitize` must allow
`className` on `pre`/`code`/`span`/`div`, or it strips exactly the classes Prism
just added.

**`typography.css` and `themes.css` are unlayered**, so they beat `@layer base`.
Only utility classes override them. `font-tahu` swaps the family but not the
weight — a handwriting face inherits `--heading-weight` at 700-800 and smears.

**Global prose rules reach further than you think.** 22 bare-`article` selectors
in `globals.css` were styling every semantic article in the app, which is how a
tag row grew disc bullets and a six-unit indent. Prose styling applies via
`.markdown` / `.prose` only.

**A nullable column needs one fallback, in one place.** Not re-derived per call
site — see `habits/habit-color.ts`, `inventory/item-value.ts`. Prefer `??` over
`||` wherever `0` or an empty string is a real value.

**Radix Select registers items for the closed trigger.** An option that only
appears on a second render is never registered, so the trigger renders blank.
Seed form state from props at mount rather than syncing it in an effect.

---

# Part five — Working practice

**Verify a fix is load-bearing.** After writing a test for a bug, revert the fix
and confirm the test fails. Several tests in this rebuild passed against broken
code before this step was added.

**Do not drive code-split components in page tests.** `next/dynamic` resolution
depends on load; assertions through that boundary pass alone and fail under the
full suite. Assert the wiring against a stub and test the real thing where it
lives.

**Unit tests are not proof the feature works.** The Notes wikilink parser had 31
passing tests and did not match a single link the editor produced, because every
fixture was written by hand rather than taken from the editor's output.

**The gate before any commit:** `npx tsc --noEmit`, `npm run lint`,
`npx vitest run`, and a cold `npm run build` for anything touching build or
runtime behaviour. Kill the dev server first — it writes into `.next` and
corrupts the build with `PageNotFoundError`.

---

# Appendix — Migrations

Run in order. All are additive and safe to re-run.

| File                                                | Adds                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `db/migrations/001-tasks-projects-dependencies.sql` | `task_projects`, `task_dependencies`, task scheduling/time/recurrence columns, cycle trigger, ordering and time RPCs |
| `db/migrations/002-habits.sql`                      | Habit schedules, quantities, kind, archiving; `set_habit_log`, `update_habit_order`                                  |
| `db/migrations/003-learning-review.sql`             | Topic review state, `learning_reviews`, `record_learning_review`                                                     |
| `db/migrations/004-notes.sql`                       | Note archiving and bounds                                                                                            |

`db/reset-habits.sql` and `db/reset-learning.sql` are destructive alternatives
that drop and rebuild with seed data. They keep nothing.

`db/schema.sql` carries every definition, so a fresh install arrives at the same
place without running any migration.

---

# Appendix — Status

**Rebuilt:** Content, Blog, Updates, Navigation, Assets, Tasks, Habits,
Learning, Notes.

**Not yet rebuilt:** Finance, Calendar, Inventory, Whiteboard, Settings,
Security, Dashboard.

**Open:**

- Migrations `002` and `004` have not been applied to the live database.
- `[[` autocomplete against existing titles in `note-form.tsx`.
- The Learning session timer still logs to `learning_sessions` from the notes
  editor only; it is not wired into the review flow, deliberately — a review is
  thirty seconds and a stopwatch on it would reintroduce the friction the
  rebuild removed.
