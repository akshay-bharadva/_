# v3 — QA pass: analysis and plan

The product plan derived from `QA.md`. `QA.md` keeps the original feedback and
carries the status markers; this file is the reasoning behind each one and the
order the work is done in.

**Status: complete.** All five phases were worked through; `QA.md` carries the
per-item outcome and `v3-implementation-log.md` Part seven records what the
pass taught. Three items are marked partial there, with the remaining work
named. Everything marked
_confirmed_ was reproduced by reading the code that causes it, with the file and
line named so the claim can be checked rather than trusted. Everything marked
_unverified_ needs the running app first, and is called out rather than guessed
at.

Baseline at the time of writing: 96 test files, 1899 tests, all passing.

---

## A note on numbering

`QA.md` numbers two different items `15` (Discover, then Tasks) and so runs
1–23 with a collision. They are **QA-15a (Discover)** and **QA-15b (Tasks)**
here. Twenty-three items in total.

---

# Part one — Three things to decide before Phase 1

Not implementation details. Each changes what "correct" means for several items,
and two are conflicts with the existing contract that should not be resolved
unilaterally.

## 1. `CLAUDE.md` and the admin shell disagree about the sidebar

`CLAUDE.md` states, as a rule:

> The shell is a single floating top bar over a full-width main — **there is no
> sidebar rail.** Module navigation goes through `GlobalCommandPalette`.

and lists "a left icon-rail as the admin's primary navigation" among the retired
v2 motifs `design-system.test.ts` is supposed to fail the build over.

`src/features/admin-shell/admin-shell.tsx` renders a fixed left rail with a
collapse toggle, and its own comment says the rail was brought back on purpose:

> An earlier pass replaced the rail with a floating pill bar and moved module
> navigation into the command palette. That was a marketing-site pattern applied
> to an admin tool… The rail is back, anchored and always visible.

Both cannot be true. The test does not catch it because it only bans four named
custom classes. **QA-23 resolves this in the contract's favour** — replacing the
rail with a top bar plus an app launcher is what `CLAUDE.md` already describes —
so the plan proceeds on that basis and `CLAUDE.md` needs no edit. The stale
comment does. That a written, supposedly build-enforced rule went unenforced
through an entire rebuild is the reason Phase 1 begins with the guard rather
than with a feature.

## 2. The retired v2 grammar is not actually retired

`design-system.test.ts` bans the custom classes `bg-graph-paper`, `rule-dotted`,
`status-line`, `section-label`, and Tailwind's shadow scale. It does **not** ban
either of the two motifs the design vision names most loudly:

| Retired motif                            | Guarded? | Live instances                     |
| ---------------------------------------- | -------- | ---------------------------------- |
| Dotted/dashed rules as separators        | No       | ~14 divider usages across 12 files |
| Monospace as a decorative metadata voice | No       | ~25 files                          |

`TimelineLayout` opens with `border-l-2 border-dotted` (QA-4). The blog TOC rail
has the same (QA-5). The Updates card divider the user asks to make solid is
`border-t border-dashed` (QA-6). **The user is reporting the v2 aesthetic still
being visible, three times, in three modules.** That is one root cause, not
three, and it is why Phase 1 is a foundation phase rather than a warm-up.

The rule must distinguish two cases or it will be reverted the first time it
fires:

- **Banned** — dashed/dotted on a single edge (`border-t`, `border-l`,
  `divide-*`). That is the retired rule motif.
- **Allowed** — dashed on a _complete box_: drop zones, empty states, "add
  another" placeholders. Universal convention for "nothing here yet / drop
  here", unrelated to v2.

Mono needs the same care: banned as a metadata voice; allowed for code, serial
numbers (already argued for in Inventory), and the terminal status-panel variant
whose whole purpose is to look like a terminal.

## 3. Two items require schema changes

Surfaced here rather than made quietly.

- **QA-21, goals.** `financial_goals` holds `current_amount NUMERIC(12,2)` and
  nothing else — no account reference, no contribution history. "Add money to a
  goal" is a counter that increments while no money moves and the ledger never
  hears about it. Modelling it as asked — _from which account?_, and withdrawal
  as well as deposit — needs `finance_goal_contributions`. **Migration 013.**
- **QA-15a, watchlist.** Nowhere stores which instruments the owner follows.
  `discover_topics` is the closest shape and the wrong one. **Migration 014**,
  following the Discover rule already established: store _what to ask for_,
  never the answer.

A third is a near miss and is deliberately **not** a schema change — see QA-4.

---

# Part two — Triage

**Must fix** — a direct QA requirement with a confirmed defect behind it.
**Strong improvement** — clearly serves the request; some judgement in scope.

| #   | Area             | Class  | Root cause                            | Scope         | Phase |
| --- | ---------------- | ------ | ------------------------------------- | ------------- | ----- |
| 1   | Home hero        | Must   | Layout — unconditional grid           | Feature       | 2     |
| 2   | Home contact CTA | Strong | Visual hierarchy                      | Feature       | 2     |
| 3   | About layout     | Must   | Layout — unconditional grid           | Feature       | 2     |
| 4   | Timeline         | Strong | Interaction/visual design             | Shared layout | 2     |
| 5   | Blog TOC         | Must   | State — active-heading detection      | Feature       | 2     |
| 6   | Updates design   | Must   | Retired v2 motif + typography         | Feature       | 2     |
| 7   | Contact states   | Must   | Conditional layout / IA               | Feature       | 2     |
| 8   | Admin nav active | Must   | Routing — trailing slash              | **Shared**    | 1     |
| 9   | Content surfaces | Must   | Surface token nesting                 | Feature       | 3     |
| 10  | Blog editor      | Strong | Component architecture                | Feature       | 3     |
| 11  | Updates admin    | Strong | Visual system drift                   | Feature       | 3     |
| 12  | CMS page 404     | Must   | **Architectural** — build-time routes | Route         | 1     |
| 13  | Assets           | Must   | State bug + interaction design        | Feature       | 3     |
| 14  | Inbox            | Strong | Interaction design                    | Feature       | 3     |
| 15a | Discover         | Strong | Information architecture              | Module + data | 4     |
| 15b | Tasks view/edit  | Must   | Interaction model                     | Feature       | 3     |
| 16  | Habits           | Strong | Product/emotional design              | Feature       | 4     |
| 17  | Learning         | Strong | Product architecture                  | Module + data | 4     |
| 18  | Calendar all-day | Must   | Layout — unverified                   | Feature       | 4     |
| 19  | Notes titles     | Must   | Copy + metadata design                | Feature       | 4     |
| 20  | Whiteboard       | Must   | State — false dirty                   | Feature       | 3     |
| 21  | Finance          | Mixed  | Several; one needs schema             | Module + data | 4     |
| 22  | Settings preview | Strong | Composition                           | Feature       | 5     |
| 23  | Admin launcher   | Strong | Navigation architecture               | **Shared**    | 5     |

---

# Part three — Item analysis

Only the non-obvious reasoning is recorded.

## QA-8 — Dashboard link never shows as active _(confirmed)_

`admin-sidebar.tsx:15`

```ts
return pathname === href || (href !== "/admin" && pathname.startsWith(href));
```

`next.config.js` sets `trailingSlash: true`, so `usePathname()` returns
`/admin/`, not `/admin`. The equality fails, and the `startsWith` fallback is
explicitly excluded for `/admin` — without that exclusion `/admin` would match
every module. So Dashboard is the one item that can never be active, which is
exactly the report.

**Solution.** One `isActiveNavHref(pathname, href)` in `nav-config.ts`,
normalising trailing slashes on both sides and matching a descendant only on a
segment boundary — `/admin/blog` must not match `/admin/blog-drafts`.
`admin-sidebar.tsx` and `activeNavItem` implement this twice today with
different bugs; both call the shared one after.

**Verification.** A table over `/admin/`, `/admin`, `/admin/tasks/`,
`/admin/tasks/123/`, and the `/admin/blog` vs `/admin/blog-drafts` pair, watched
failing against the current implementation first.

**Why Phase 1:** it is a shared contract, and QA-23 rewrites its only consumers.

## QA-12 — CMS page 404s _(confirmed; architectural)_

Not a bug in the resolver. `generateStaticParams` in
`src/app/(public)/[...slug]/page.tsx` runs **at build time** and
`dynamicParams = false`. The nav link is fetched at _runtime_, so a page created
in the admin after the last deploy appears in the navigation of a build that
contains no HTML for it. GitHub Pages then serves `404.html`.

Inherent to `output: "export"`. It cannot be fixed by generating more routes —
the page does not exist when the build runs.

**Solution — a client-side resolver on the 404 page.** GitHub Pages serves
`404.html` for any unmatched path, and the static export emits it from
`src/app/not-found.tsx`, which already exists. Make it read `location.pathname`,
ask `navigation_links` whether a visible CMS page claims that path, and render
the same `CmsPage` if so — otherwise the real not-found. No server, no SSR, no
new dependency. The prerendered route stays the fast path for everything that
existed at build time; this is the catch-up path for everything created since.

Second half, because the first is a rescue rather than a cure: the admin
navigation row should say that a new CMS page **is live now via the fallback and
prerendered at the next deploy**. Navigation already classifies each row's path
(built-in / CMS / reserved / external), so this is a fifth state in an existing
vocabulary, not a new concept.

**Verification.** The resolver is a pure function over (pathname, links) with
its own tests — reserved segments, trailing slash, unknown path, hidden link —
then a real `npm run build` confirming `404.html` carries it.

## QA-5 — TOC highlight is wrong and clicking does not fix it _(confirmed)_

`table-of-contents.tsx`. Active heading comes from an `IntersectionObserver`
with `rootMargin: "-20% 0px -70% 0px"` that sets active only
`if (entry.isIntersecting)`. Three failures fall out of that:

1. **Clicking a TOC entry can never highlight it.** `scrollToHeading` parks the
   heading `SCROLL_OFFSET = 96`px from the top. The observer's band is 20%–30%
   of viewport height — 180–270px on a 900px window. The heading lands _above_
   the band, never intersects, and never becomes active. Precisely the reported
   symptom.
2. **The last heading is often unreachable** — at the document bottom there may
   be no scroll left to bring a final short section into the band.
3. **Multiple entries in one callback resolve by array order, not scroll
   order**, so a fast scroll can leave a lower heading active than the one on
   screen.

**Solution.** Stop asking "is a heading inside a band" and ask "which heading
did I most recently pass" — the last heading whose top is at or above the same
offset the click uses, falling back to the first when above them all and forcing
the last at document bottom. One pure function over heading offsets,
rAF-throttled, sharing one `SCROLL_OFFSET` with the click handler so the two
cannot disagree. That shared constant is what fixes failure 1.

## QA-4 — Timeline as a git graph _(data model: derive, do not extend)_

`PortfolioItem` has `date_from`, `date_to`, `title`, `subtitle`, `tags`,
`display_order`. **There is no parent, branch or lane field**, and the brief
asks that this be identified explicitly rather than worked around.

Representable honestly with no schema change:

- **Chronology** — from the dates.
- **Parallel tracks** — two items whose ranges overlap were genuinely
  concurrent. That is real branching in the only sense the data supports.
- **Lane assignment** — interval-overlap clustering plus greedy first-fit, which
  the calendar already solved and tested in `calendar/grid-layout.ts`. The
  algorithm generalises; the renderer does not.
- **Ongoing vs finished** — a null `date_to` is the open branch, drawn as the
  live tip.

**Not** representable, and so not faked: a true merge in the git sense — "X was
merged into Y" — needs an explicit parent pointer. Drawing a merge curve
inferred from "one thing ended near when another began" invents a relationship
the owner never stated. The design shows a lane **rejoining the trunk** when it
ends, which is true (the concurrency stopped), without claiming causation.

**Decision: no schema change this pass.** A `depends_on` column on
`portfolio_items` is the right answer if real merges are wanted later; recorded
as future, not built speculatively.

**Shared-contract impact.** Lane packing moves to a shared module so Calendar
and Timeline share one tested implementation rather than two.

Mobile collapses to a single trunk with a lane badge — parallel lanes on a 375px
screen give four-pixel columns, the exact failure the log already records for
month view.

## QA-1, QA-3, QA-7 — three instances of one mistake _(confirmed)_

All three are an **unconditional grid whose column count assumes optional
content is present**:

- `hero.tsx` — `lg:grid-cols-[1.35fr_1fr]` renders regardless of `panel.show`,
  so hiding the status panel leaves the text at 57% width beside a void.
- `about-page.tsx` — `sm:grid-cols-[8rem_1fr]` with the image conditional, so
  with no picture the bio still sits in column two behind an 8rem gutter.
- `contact-page.tsx` — the `Direct lines` heading and its `<ul>` render with
  zero social links, and `lg:grid-cols-[3fr_2fr]` leaves an empty 2fr column
  when badge and socials are both absent.

Stated once: **content availability must decide the layout, not merely fill
it.** Each is fixed at its own site — they are three compositions, not one
component — but each gets the same treatment: choose the grid from what exists,
and never render a heading for an empty list.

The hero also gets the composition rework QA-1 asks for rather than a centring
switch: with the panel, today's asymmetric band; without it, a centred measure
with the CTA row as second focal point, so the band has a centre of gravity in
both states instead of one state and a hole.

## QA-13 — the flickering drop overlay _(confirmed, and a test that cannot fail)_

`use-asset-operations.ts:95`

```ts
const handleDragEvents = (e, isEntering) => { …; setIsDragging(isEntering); };
```

wired to `onDragEnter`, `onDragLeave` **and** `onDragOver` on a container full
of cards. HTML5 drag fires `dragleave` on the parent every time the cursor
crosses into a **child**, immediately followed by `dragenter`. Dragging across a
grid of assets toggles the flag continuously — the reported flicker, and a
state-management bug exactly as the brief suspects, not a CSS problem.

**Solution.** A depth counter: increment on enter, decrement on leave, overlay
while depth > 0, reset on drop and `dragend`.

**For the log.** `use-asset-operations.test.ts:257` asserts the current
behaviour and therefore **passes with the bug in place** — the sixth instance of
this pattern in the project. The replacement drives enter → enter → leave and
asserts the overlay is still up, which is red against today's code.

The rest of QA-13 — full-workspace layout, folder drop targets, move-by-drag,
progress — is interaction design, scoped in Phase 3 after research.

## QA-20 — "Discard changes?" on an untouched board _(confirmed)_

`board-editor.tsx:140`

```ts
const handleChange = useCallback(() => {
  lastChangeAt.current = Date.now();
  setIsDirty(true);
}, []);
```

with the comment directly above conceding that Excalidraw fires `onChange` for
pointer moves and selection. It also fires during initial scene load, so
**opening** a board marks it dirty and Close asks to discard edits that do not
exist.

**Solution.** Dirty is a comparison, not an event: fingerprint the scene through
`scene-io.ts` — the authoritative serializer; a second one would be a second
contract — at load, and compare on change. Excalidraw's own cheap signal,
element count plus the sum of element `version`s, is sufficient and avoids
serializing on every pointer move.

Renaming: **both places.** The board view has it; the list needs it too, because
renaming is the one edit that does not require opening the board, and making
someone load a canvas to fix a typo is the friction the brief asks to remove.

## QA-19 — Notes _(confirmed, partly a question)_

"Untitled" is hard-coded at seven sites across notes, life-updates and
whiteboard. For a note the title is genuinely optional, so the honest
representation is the note's **first line of body text**, falling back to a
muted "New note" only when the note is entirely empty. One helper, not seven
literals.

The pinned-note timestamp is the sharper observation. `updated_at` is bumped by
a database trigger on **any** update, so pinning rewrites the modified time —
the note reports "modified a minute ago" when no content changed, and pinning
silently reorders anything sorted by recency. Confirm against the trigger before
choosing between showing pinned state instead of a timestamp on pinned cards, or
excluding `is_pinned` from the trigger's touch.

## QA-18 — Calendar all-day overlap _(unverified)_

`all-day-row.tsx` stacks with `space-y-1` and does not overlap, so the reported
overlap is either in month view or is the all-day row growing without bound and
pushing the hour grid off screen. **This needs the running app before a fix is
designed** — guessing produces a change to a component that was not the problem.

One real defect was found while reading it regardless: `all-day-row.tsx:49`
computes `dayEnd = dayStart + 86_400_000`. That is the trap the implementation
log records four times over — a day is 23 or 25 hours across a clock change — so
on those two days an all-day entry can be missed or duplicated at the boundary.
Fixed with `addDays` whatever the overlap investigation concludes.

## QA-21 — Finance

Eight requests in one item. Six local, two not.

| Request                          | Verdict                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reveal/hide sensitive figures    | Must. Session-scoped, default visible, one shared control.                                                                                             |
| Recurring form category picker   | Must. Inconsistent input for the same field; reuse the picker.                                                                                         |
| Two Add buttons in Activity      | Must. Confirm which is which, keep one.                                                                                                                |
| Category buckets are unexplained | Must. The bucket is what makes 50/30/20 and runway computable — the UI shows the outputs and never says the input exists. Explain at the point of use. |
| Goal money movement              | **Schema.** Migration 013 — see Part one.                                                                                                              |
| Budget "pace" is unexplained     | Must. The number is defensible; the label is not.                                                                                                      |
| What-if banner appears wrongly   | Must, after reproducing.                                                                                                                               |
| 5–7 year forecasting             | Strong, with the constraint below.                                                                                                                     |

On long horizons: the honest version compounds _stated assumptions_ and labels
them, and must never render a 7-year figure in the same visual weight as a bank
balance. The log's own rule — a derived figure with insufficient data returns
null and renders "—" — applies with more force at 84 months than at 3. A
mortgage is representable as a long-dated commitment with a rate and a term,
which is a row in the existing recurring model plus an end date. It is not an
amortisation engine, and Finance does not become an accounting system this pass.

## QA-15a, QA-16, QA-17 — the three product-thinking items

Deferred to Phase 4 with a research step each, because the brief asks for
information architecture rather than fixes and each is module-sized. Their
analysis is written when their phase starts: a design written six phases early
is a design written without what the earlier phases taught.

Two constraints are already known and will shape all three:

- **Discover** has no server and no key. Every source must be CORS-open and
  keyless — that is what killed Google News and what makes most market data
  unavailable. A watchlist is therefore storable and searchable, but its quote
  data depends entirely on finding a keyless CORS-open source. If none survives
  verification the design must degrade honestly rather than invent numbers, and
  that verification happens **before** the UI is designed, not after.
- **Learning** already has spaced review, an RPC computing intervals in the
  database, and a deliberate anti-guilt cap. The gap named — subtopics that are
  explanations rather than flashcards — is a content-type gap, not a scheduling
  gap. The loop to build toward is Learn → Recall → Practice → Assess → Review →
  Retain, and only the middle of it exists.

---

# Part four — Phases

Ordered by dependency, not by the numbering in `QA.md`.

### Phase 1 — Foundation

1. `isActiveNavHref` shared helper — **QA-8**, and the precondition for QA-23.
2. Design-system guard extended to dashed/dotted dividers and decorative mono,
   with the box/divider and code/metadata distinctions from Part one; then the
   ~14 divider sites swept.
3. The CMS fallback resolver — **QA-12**. Architectural, blocks nothing, but the
   only item where a user is currently seeing a hard 404.

### Phase 2 — Public site

**QA-1, 2, 3, 7** — the conditional-layout family, done together because they
are one lesson. Then **QA-5** (TOC), **QA-4** (timeline, including extracting
lane packing), **QA-6** (Updates typography and end-of-feed marker).

### Phase 3 — Admin UX

**QA-9**, **QA-20**, **QA-15b** — small and confirmed. Then **QA-11**,
**QA-14**, **QA-10** (after research), **QA-13** (flicker fix first, file
management after research).

### Phase 4 — Product modules

**QA-18** and **QA-19** first, small and confirmed. Then the research-led
modules — **QA-21** (with migration 013), **QA-17**, **QA-15a** (with migration 014) — each following the ten-step sequence in the brief.

### Phase 5 — Settings and navigation

**QA-22**, then **QA-23**, last because it rewrites the navigation every earlier
phase was tested through.

**Phase 5 does not start while Phase 1 is incomplete** — QA-23 consumes the
Phase 1 helper and would otherwise re-implement the bug it fixes.

---

# Part five — How each fix is proved

The project's own rule, and the one that has caught the most: **every new test
is watched failing first.** Six tests in this rebuild passed with their bug in
place — and one of them, `use-asset-operations.test.ts:257`, is the test for a
bug in this very QA list, asserting the broken behaviour as correct.

| Area                | Test                                                           |
| ------------------- | -------------------------------------------------------------- |
| Active nav          | Table over trailing slash, prefix collision, nesting           |
| CMS resolution      | Pure resolver: reserved, hidden, unknown, trailing slash       |
| TOC                 | Pure active-heading fn, including the click-offset case        |
| Conditional layouts | Each permutation renders no empty region and no orphan heading |
| Timeline lanes      | Overlap clustering — shared with the calendar's suite          |
| Asset drag          | enter → enter → leave keeps the overlay up                     |
| Whiteboard dirty    | Load then no-op change is not dirty                            |
| Goal movement       | Contribution debits an account; withdrawal reverses it         |
| Calendar all-day    | Many items, long titles, and the DST boundary                  |

Static export is re-verified with a real `npm run build` after Phase 1 (routing)
and Phase 4 (Discover) — the two phases that change how routes and external data
resolve.
