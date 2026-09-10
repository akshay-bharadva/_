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

## Whiteboard

**Is** — the Excalidraw board, made usable with a pen. The module was already
sound structurally, so this is about the input device rather than the model.

**Carried forward:**

- **A drawing surface owns every gesture on it.** Without `touch-action: none`
  and `overscroll-behavior: none` the browser wins first: a two-finger drag
  zooms the page instead of panning the canvas, a long press raises the
  selection callout mid-stroke, and a downward swipe at the top pulls to
  refresh and takes the board with it. `-webkit-touch-callout: none` and
  `select-none` finish the job; `env(safe-area-inset-bottom)` keeps the toolbar
  off the home indicator.
- **Palm rejection is the app's job, not the library's.** Excalidraw draws from
  pointer events and cannot tell a stylus from the hand resting beside it, so
  on a tablet the palm lands first and draws before the nib is down. The
  listeners in `use-pen-input.ts` run in the **capture** phase on the wrapper —
  above the canvas, because Excalidraw owns pointer events on its own surface —
  and stop single-finger touch while pen-only is on. Two or more fingers pass
  through: a mode that blocked all touch would also block pan and pinch and
  make the board unusable on exactly the device it was meant to help.
  `passive: false` is required, since `preventDefault` on a touch pointer is
  what stops iOS treating the gesture as a page scroll.
- **The pen-only toggle stays hidden until a stylus has been seen.** There is no
  way to ask whether a pen exists — `maxTouchPoints` reports that a screen
  accepts touch, which every tablet does whether or not a pen was ever paired —
  so `pointerType === "pen"` on a real event is the only signal. On a laptop it
  is a control for a problem the owner does not have.
- **Autosave on idle, not on change.** A tablet session ends by locking the
  screen or swiping the app away, neither of which runs a save handler, so
  waiting for an explicit Save is how work is lost. Excalidraw fires `onChange`
  per pointer move, so this polls a timestamp on an interval rather than
  debouncing per change — re-arming a timeout on every frame is work during a
  stroke. The first autosave of a new board captures the id it returns;
  without that every later save would insert another row.
- **`beforeunload` is the guard for the paths the component never sees** — a
  closed tab, a reload, a followed link. It cannot save, because the handler
  may not await, so it only asks.

- **Excalidraw's own UI slots, not absolute positioning.** The library owns the
  top-left (menu), top-centre (toolbar) and top-right (library) of its surface,
  so anything floated over the canvas collides with one of them at some
  viewport width. Board actions go through `renderTopRightUI` and the title and
  save state through the exported `<Footer>`, so the chrome moves with
  Excalidraw's layout instead of guessing at it. The canvas is full-bleed —
  a bordered box inside a padded panel put two frames around the one thing the
  page is for.
- **Save is the way out, so it is never disabled.** Autosave means an untouched
  board is already written; pressing Save then closes without a second write,
  which would otherwise bump `updated_at` and reorder the gallery for nothing.
- **A gallery card shows a drawing, so the drawing gets the room.** Fixed 4:3
  so the grid stays even when one board is a wide flowchart and the next is
  three boxes, inset on the page ground rather than a grey plate — the export
  carries its own background, so a dark-theme board reads as a dark board. The
  card previously carried `hover:border-primary/50` and no border, so the one
  affordance saying it was clickable did nothing.

## Inventory

**Was** — a searchable list that led with four money figures, and stored what a
thing cost without ever recording where it was.

**Is** — the same records, arranged around the one question that has an answer
worth acting on. Migration `005`.

**Carried forward:**

- **Money is a fact; a warranty is a task.** The page led with four totals,
  which describe what the inventory is _worth_ rather than what it asks you to
  do. A warranty lapses whether or not anyone looks, so the page now opens with
  the ones expiring within a month, soonest first, as a control that filters to
  them. Expired warranties are deliberately excluded — an expired warranty is
  history, and mixing the two turns a short actionable list into a long one
  that gets ignored.
- **Days remaining, not a status word.** "Expiring soon" reads the same at
  twenty-nine days and at one, and the difference is the entire point of
  showing it.
- **Location and quantity were missing from the model.** A home inventory is
  asked "where is it?" more than anything else, and six of the same cable was
  six rows each holding a sixth of the value. Totals count units separately
  from rows so both numbers are true.
- **Archive keeps the price.** Things get sold, given away and thrown out;
  deleting the row takes what it cost with it, which is the one number still
  worth having once the object is gone. `archived_reason` records which.
- **Both views at every width.** The table was swapped for the grid below `md`,
  so serial numbers and warranty dates — the two things you look up while
  standing next to the object — did not exist on a phone.
- **Mono earns its place on a serial number** and nowhere else here. A serial is
  read character by character, and a proportional face makes `1`, `l` and `I`
  the same shape. The sort control was a dropdown menu that marked its selection
  by concatenating a tick into the label; it is a select now, matching Tasks and
  Notes.

## Security

**Was** — a screen that described protections it did not have.

**Is** — the same controls, saying only what is true, plus the migration that
makes the strongest one real. Migration `006` is **opt-in**.

**Carried forward:**

- **A security screen that overstates itself is worse than one that does
  less.** Level 2 was labelled "API Read-Only. No edits allowed." and enforced
  nothing: `lockdown_level` appeared in the schema exactly twice — the column
  and a seed row — and no policy referenced it. The owner could set it
  believing writes were refused while every write succeeded. Each level now
  carries an `enforcement` field — `none`, `client` or `database` — and the UI
  states which, including that maintenance is a client-side check on a static
  export and therefore hides the interface rather than the data.
- **A kill-switch must never be able to trap you.** `006` adds
  `NOT public.writes_locked()` to admin write policies but deliberately leaves
  `security_settings` unconditional, so the switch that lifts lockdown is never
  itself blocked. The migration documents the service-role escape hatch anyway.
- **Confirmation text was indexed by level.** The column permits 0–3 and the
  array had three entries, so an out-of-range level produced a confirm dialog
  with an empty description — at the moment one matters most. An unknown level
  is now treated as the strictest rather than the most permissive.
- **`signOut()` defaults to global scope in Supabase.** The ordinary logout
  button was terminating every session on every device, so logging out of a
  laptop killed the phone. Ordinary logout is now `local`; revoking everything
  is a separate, deliberate action on this page.
- **The password rule was `length < 6`** — the floor Supabase enforces anyway,
  on the one account that can change everything. It is now a real assessment
  that names the specific missing thing rather than showing a percentage, since
  a score invites tuning until the bar goes green.
- **"May lock you out" understated MFA.** Admin access is granted by the
  database only at AAL2, so removing the last factor stops every admin write
  immediately. The confirm says that.

---

## Settings

**Was** — ten cards in a two-column grid, one form, one Save button, and no way
to see what a theme looked like before committing to it.

**Is** — a navigator with a live preview: a rail of ten groups, one group in the
pane, a Save that belongs to the group you are looking at, and a third pane
rendering the real public views against unsaved values. Design options were put
up as three rendered mockups (grouped navigator / navigator plus preview /
sectioned scroll) and the middle one chosen.

**No SQL migration.** `profile_data` was already JSONB and the shape is enforced
in Zod, so everything below is a client and contract change.

**Carried forward:**

- **Form layout was deciding content shape.** `BIO_SLOTS = 2` and
  `EXPLORING_SLOTS = 2` were constants in the page, and the load effect padded
  the stored array to exactly that length — so a site could have one bio
  paragraph or two and never three, a limit present in neither the schema nor
  the database. Both are open lists now with ceilings in `SITE_LIST_LIMITS`.
- **A closed list silently deleted data.** Social links were rendered by mapping
  over `siteSettingsDefaultValues.social_links` and merging stored values in by
  `id`, so a link whose id was not in the defaults file never appeared in the
  form — and was dropped from the row on the next save. The list is open, ids
  are editable, and `normalizeSocialLinks` repairs entries individually.
- **"What does a missing key mean" had two answers.** `site-identity.ts`
  answered it for the public site; a sixty-line `nullsToStrings` + merge + pad
  block inside the page's `useEffect` answered it again for the admin, and only
  the first had a test. The form now loads through `normalizeSiteContent`,
  which grew a recursive `mergeDefaults` handling absent keys, explicit nulls
  and wrong-typed values in one pass.
- **One resolver over one submit means one bad field blocks every save.** A
  malformed GitHub username stopped you fixing a footer typo. `issuesForGroup`
  scopes validation to the group's field paths and `buildGroupPayload` writes
  only the columns that group owns — so saving Footer sends `footer_data` alone
  and cannot carry a half-typed name along with it. Both are pure functions
  with their own tests.
- **Every free-text field in the blob was unbounded.** `logo.main`,
  `status_panel.title`, `availability`, `latestProject.*` and the GitHub
  username had `.min(1)` and no ceiling, unlike every other module. They now
  carry `LIMITS`, and the ones that were needlessly required are optional —
  a required field in one group must not be what stops a fresh install from
  saving an unrelated one. GitHub's username is required only while `show` is
  on, via `superRefine`.
- **A preview must be the real component or it is a second design.**
  `HeroView`, `AboutView` and `ContactView` were split out of their fetching
  wrappers so the preview renders exactly what ships. `ContactView` takes the
  form and services as slots, because a preview must not render a working
  submit button or fire the CMS query.
- **Scope the theme, do not apply it.** The `theme-*` class and any custom
  palette go on the preview subtree. Applying them to `<html>` would repaint the
  admin on every hover through 52 presets and leave the site in the last one
  hovered if you navigated away. `customThemeVars` was extracted from
  `applyCustomThemeColors` so both use one mapping — and extracting it surfaced
  that `--destructive` was being set to a raw hex, producing `hsl(#ef4444)` on
  every custom theme.
- **Scale a preview, do not narrow it.** Rendering into a 380px column shows the
  mobile layout, which is not the layout you are choosing a theme for. The frame
  renders at 1180px and is scaled by a measured factor; the scaled height is
  measured too, because `transform` does not change layout size and the pane
  would otherwise end in a screen of empty background.
- **The build gate and the live check must be the same function.** The 52
  presets are gated at AA by `theme-contrast.test.ts`; custom colours are typed
  at runtime and reach no test. `contrastRatio` moved into `color-utils` and both
  call it. `contrastRatioHex` refuses an unparseable value rather than returning
  a confident ratio, because `hexToHsl` answers `"0 0% 0%"` for anything it
  cannot read.
- **`useFieldArray` is for arrays of objects.** It keys rows on an identity it
  injects into each entry, so `append("")` on a `string[]` does not reliably
  land as an empty string. `useStringList` manages both primitive lists through
  `setValue` instead — changing the columns to objects to suit a form hook would
  be the form deciding the data shape all over again.
- **Nothing is dirty before the form has been filled.** Between first render and
  the reset effect the form holds defaults while the server state holds the row,
  so every group compared as dirty and the save bar flashed on every visit. Gate
  the comparison on a hydration flag.
- **A fixed bar is furniture the page has to make room for.** It covered the
  last field of every group. The container reserves its height while it is up,
  and the sticky preview column shortens by the same amount — neither reserves
  anything on a clean page.
- **Per-group save needs a master save beside it.** Editing three groups and
  saving each one individually is three round trips and three chances to forget
  one. `saveGroups` takes a list, so "Save all" is a single write over every
  dirty group's fields; a group that fails validation is dropped from that write
  and named in a second toast rather than sinking the others. Both buttons show
  only when they would do different things.
- **The preview belongs behind a split boundary.** Imported directly it took the
  route to 409 kB first load, the largest in the app, on a screen most visits
  open to change one string. Behind `next/dynamic` it is 345 kB.

---

## Inbox (contact submissions)

**Was** — nothing. `contact_submissions` shipped in the first schema with admin
SELECT and DELETE policies and no interface, so every message the site ever
received landed where nobody could read it.

**Is** — a list/detail inbox with four derived states, plus the two things that
had to be fixed alongside it. Migration `007`.

**Carried forward:**

- **A table with policies and no screen is a table nobody reads.** Worth
  checking the rest of the schema for the same shape rather than waiting to
  notice again.
- **This is the only row an unauthenticated stranger can create.** The INSERT
  policy is `WITH CHECK (true)`, the columns were `TEXT`, and the Zod schema had
  `.min()` on every field and `.max()` on none — so any visitor could insert
  rows of any size, as often as they liked. Bounds are now CHECK constraints
  mirroring `CONTACT_LIMITS`, and a BEFORE INSERT trigger refuses more than 3
  per address per hour or 10 site-wide per minute. Both in the database: the
  client that matters here is the one you do not control.
- **`NEXT_PUBLIC_` is not a place to keep a credential.** The Discord webhook
  was called from the browser using `NEXT_PUBLIC_CONTACT_WEBHOOK_URL`, which
  Next.js compiles into the bundle — and a webhook URL is full authority to post
  in that channel. It now lives on `integration_settings`, which has **no public
  read policy at all**, and the ping is sent by an AFTER INSERT trigger through
  `pg_net` (free on every Supabase plan). Not `site_identity`: that table is
  `FOR SELECT USING (true)`, so a URL there would be world-readable.
- **Static mode keeps the client call, because it has no alternative.** With no
  database there is no trigger and no server; the exposure is a property of
  having no server, not a choice. Dynamic mode no longer reads the env var.
- **Read is not replied.** Four states derived from three independent columns in
  `inbox-filters.ts`, so the badge, the tabs and the ordering cannot disagree.
  Opening a message marks it read and it _stays_ in the needs-reply view — an
  inbox that empties itself when you glance at something is how enquiries get
  lost. Archiving is the deliberate "done".
- **The needs-reply view sorts oldest first.** Everywhere else is newest first.
  Age is the only signal an inbox has about neglect.
- **No compose box.** There is no outbox, no sending domain and no
  deliverability story, so Reply is a `mailto:` with the thread quoted and every
  value percent-encoded — an unescaped `&` in a subject truncates the URL.
- **The one string in the app written by a stranger is rendered as plain text.**
  Putting it through a markdown pipeline would hand an anonymous visitor a
  rendering surface inside the admin.
- **`lg:hidden` does not unmount a Radix dialog.** A sheet hidden that way still
  renders its overlay and still traps focus, so on a wide screen it swallows
  every click behind it. Structure decided by a breakpoint needs a measured
  media query — `useMediaQuery` / `useBelowBreakpoint`, which `useIsMobile` now
  delegates to.
- **A pasted credential deserves shape validation.** A mistyped webhook fails
  silently inside a trigger where nobody sees the error. `isDiscordWebhook`
  parses the URL rather than matching it, so a host merely _containing_
  `discord.com` is rejected, and requires HTTPS because `pg_net` would otherwise
  send the message body in the clear.
- **The public contact form** lost the `font-mono` status line (retired v2
  metadata voice), gained counters that appear only past 80% of a real ceiling,
  and now shows the database's own refusal — "Too many messages from this
  address" tells a person what to do; "Something broke" does not.

---

## Analytics (visitors)

**Was** — `NEXT_PUBLIC_VISIT_NOTIFIER_URL`, a Discord ping fired once per
session from the hero, storing nothing. There was no way to answer "how many
people came this month", let alone from where.

**Is** — one row per visit, aggregated in Postgres, read on `/admin/analytics`.
Migration `008`.

**Carried forward:**

- **A static export has no server, but Postgres sees the request.** PostgREST
  exposes `current_setting('request.headers')`, and Supabase's proxy sets
  `x-forwarded-for` — so a `BEFORE INSERT` trigger can capture the client IP
  with no Edge Function and no origin server of our own. That single fact is
  what makes the whole module possible.
- **No IP address is stored.** The trigger keeps only
  `sha256(secret || current_date || ip || user_agent)`. The secret lives in a
  table with RLS **enabled and no policy at all** — RLS with no policy denies
  every client role, so the anon key cannot reach it under any circumstances.
  Unique counts are accurate within a day and the column identifies nobody.
- **Free meant client-side geo.** `ipapi.co`'s free quota is counted per
  _calling_ address, so having each visitor's own browser make the call means
  nobody ever hits a shared limit. Ad-blockers block it, which is a normal path,
  not an error — `countryFromTimezone` covers the country for those visitors.
- **The second anonymous-write table gets the first one's discipline.** Length
  CHECKs on every free-text column and a rate-limit trigger, exactly as
  `contact_submissions` got in `007`. One difference: this trigger returns NULL
  to drop silently rather than raising, because telemetry must never be able to
  break a page view.
- **Bots are flagged, not rejected.** "60% of this traffic is Googlebot" is
  itself worth knowing, and a filter that silently discards is one you cannot
  check. Excluded by default with a toggle to include.
- **Aggregate in the database.** `get_visitor_analytics` returns one JSONB
  document; the page never sees an individual visit row. The alternative is
  shipping a year of traffic to the browser to count it.
- **`SECURITY DEFINER` steps over RLS, so the guard goes inside.** Both RPCs
  re-check `is_admin()` in their own body rather than trusting the policy they
  bypassed, and `EXECUTE` is revoked from `anon`.
- **Track from the chrome, not the hero.** The old hook fired once per session
  from the home page, so a visitor who landed on a blog post and read four more
  registered as nothing. `useVisitTracker` lives in `PublicChrome` and keys off
  `usePathname`.
- **A missing header must not read as a missing audience.** `visitor_hash` is
  null when `x-forwarded-for` never arrives, so `count(DISTINCT …)` is zero
  while views are not. "0 visitors / 412 views" looks like a broken site;
  `visitorCountUnavailable` detects it and the page says which it is.
- **Fill the gaps in a daily series.** `GROUP BY` omits days nobody visited, and
  a line chart joining the 3rd to the 9th draws a straight line across the gap —
  which reads as steady traffic rather than none.
- **Parse user-agents in the right order, and test with real strings.** Every
  Chromium browser carries a Chrome token, Chrome carries a Safari token,
  ChromeOS carries X11, and iPadOS 13+ sends a desktop Mac string verbatim so
  touch support is the only cue. A hand-simplified fixture passes a parser that
  fails on the real thing.
- **One webhook editor, two webhooks.** Contact and visit pings are the same
  table, slice, validation and security argument, so `WebhookSettings` is
  parameterised by which columns it writes. It lives in `features/integrations/`
  because both Inbox and Analytics compose it, and a feature reaching into
  another feature's internals is what the architecture forbids.

---

## Finance

**Was** — three flat tables and no concept of currency at all. Amounts were bare
numbers and `$` was hard-coded into six render sites.

**Is** — a multi-currency ledger with accounts, budgets, forecasting, what-if
scenarios, remittance tracking and coaching. Migration `009`.

**The three decisions everything else follows from:**

- **Rates are frozen at the transaction.** Every row stores its amount, its own
  currency, and the rate to base _on the day it happened_, filled by a trigger
  so a CSV import is as consistent as the form. Converting the past at today's
  rate rewrites your history every time the market moves; a report that changes
  when you did nothing is not a report. It is also what makes changing the base
  currency safe rather than destructive.
- **Balances anchor on a reconciliation, not a complete ledger.** An account
  stores "on this date it really held X" and derives forward. Correcting drift
  is editing two fields, not hunting a missing row — which is what makes a
  credit card, whose bill is unknown until it lands, tractable instead of a
  source of small lies. This came directly from the owner saying so.
- **Recurring items are proposed, not posted.** A biweekly salary is 1,000 until
  two days of unpaid leave make it 800. `auto_post` is off by default and the
  queue is derived (rules minus posted minus skips), so nothing drifts when a
  rule changes. `occurrence_date` is distinct from `date`: a salary due Friday
  and entered Monday is still Friday's occurrence.

**Carried forward:**

- **Nullable is the honest return type for a derived figure.** `savingsRate`
  with no income, `runwayMonths` with no essential spending, `ratePercentile`
  under ten samples, `effectiveRate` on a zero divisor, `hiddenMargin` with no
  market rate — all null, all rendered as "—". A confident zero where the real
  answer is "not enough data" is what makes a finance tool untrustworthy, and an
  infinite runway or a free-looking remittance provider are the specific lies
  those nulls prevent.
- **`Intl` knows things you are about to hard-code.** Yen has no minor unit and
  dinars have three, so `currencyDecimals` asks rather than assuming two.
  `formatMoney` goes through `Intl` too, because "$-1,234.00" is not how any
  locale writes a negative.
- **`Math.round(x * 100) / 100` is wrong twice.** Wrong for the currencies
  above, and wrong for 1.005, which is really 1.00499999999999989. Round via a
  string exponent.
- **A missing rate must never default to 1.** It would report ₹60,000 as
  $60,000. `rateFrom` returns null and the affected accounts are named and
  excluded from net worth.
- **Two enums, two vocabularies.** `transaction_type` is
  ('earning','expense') and describes direction; `category_bucket` is
  ('income','need',…) and classifies a category. Mixing them is a runtime error,
  which is how migration `009` failed the first time it was run.
- **Never name a plpgsql variable after a column.** `base` collided with
  `fx_rates.base` and would have failed inside a trigger on the first
  transaction — after the migration appeared to succeed.
- **`toISOString()` in a date-key helper is a timezone bug.** It converts to UTC
  first, so in any zone ahead of UTC local midnight on 1 August is 31 July and
  every budget lookup misses its own month. Format from local calendar fields.
  Test fixtures built from `Z` strings hide it and send the next person hunting
  the wrong bug.
- **Forecast two lines, not one.** Commitments alone draw a beautifully rising
  line that ignores that you buy groceries; a run-rate alone buries the number
  you control. The gap between them is what can change. A date — "this runs out
  on 14 March" — is what makes a chart actionable.
- **Budgets are read as pace, not as a limit.** "60% spent" means opposite
  things on the 8th and the 25th, so the bar carries a marker for where the
  month is. Ten points of tolerance, because a budget that shouts on day three
  is one you stop reading.
- **Seed the fields nobody would think to fill in.** `bucket` and
  `is_essential` are what make 50/30/20 and runway computable at all, so the
  nineteen starter categories arrive with both already set.
- **Transfers are two rows sharing a group, not a table.** The ledger stays one
  queryable thing. Both amounts are entered rather than one computed — what
  arrived is a fact you observed, margin included. The form writes the legs
  sequentially, because half a transfer is a balance wrong in both directions.
- **Say which rates these are.** ECB mid-market is the right benchmark for "is
  today a good day" and the wrong number for "what will they receive". The FX
  screen repeats the distinction rather than letting the reader assume.

---

## Calendar

**Was** — six usable columns on `events`, no recurrence, no grouping, nine
hard-coded hex colours, and a range query with two real bugs. FullCalendar plus
a 352-line CSS override block fighting it.

**Is** — a native grid with recurrence, calendars, a second time-zone gutter and
drag-to-schedule from the task list. Migration `010`.

**Carried forward:**

- **Filter a range query on overlap, never on start date.** The old query used
  `start_time::date BETWEEN start AND end`, so a trip from the 28th to the 4th
  was invisible when you looked at the following week — it did not _start_
  there. Any event crossing a view boundary disappeared from the far side.
- **A synthetic id must be deterministic.** Summary rows were built with
  `gen_random_uuid()` inside the query, so the same day's habit summary was a
  different object on every refetch: an unusable React key, and nothing that
  could be selected or scrolled to. Derive it from the kind and the date.
- **Do not invent a clock time to make a date fit a grid.** Tasks were pinned to
  09:00, habits to 07:00, transactions to 12:00 by literal `interval '9 hour'`
  arithmetic. Those times are wrong in every timezone. Date-only records are
  all-day, and the grid has a row for them.
- **Expand recurrence on the client, not in SQL.** A weekly 09:00 standup is
  09:00 _local_ on both sides of a clock change — a property of the viewer's
  zone, which only the browser knows. Postgres would have to pick one.
- **A parser that cannot read a rule must produce nothing, not a guess.** The
  RRULE subset is deliberate (FREQ, INTERVAL, BYDAY, COUNT, UNTIL); anything
  else yields no occurrences. A rule that silently expands to the wrong dates
  is a missed appointment.
- **`new Date("2026-12-31")` is UTC midnight.** The third time this trap has
  appeared — after the budget month key and the analytics fixtures. A series
  ending 31 December would have stopped on the 30th for every viewer behind
  UTC. Parse date strings from their parts.
- **Compute grid positions from real dates, never an hour index.** A week
  containing a clock change has 167 or 169 hours. Doing the arithmetic in dates
  means no special case for it at all.
- **Overlap layout is clustering plus greedy first-fit.** Group events by
  transitive overlap so one event cannot need two widths, then reuse the
  leftmost free column — consecutive meetings stack rather than marching
  rightwards. Three overlapping events do not always need three columns.
- **A second hour gutter is read through `Intl`, not an offset.** India is +5:30
  and never changes; most zones shift twice a year, and an offset captured in
  summer is wrong all winter.
- **Show the parse before saving it.** Natural-language entry does not have to
  be perfect if the interpretation is visible first. A bare number is only a
  time after "at", so "sprint 3 review" is not a 3am meeting.
- **Editing one occurrence of a series is ambiguous, so ask.** This Thursday or
  every Thursday? The sheet offers both and writes either an exception row or a
  series update. Deleting one occurrence is a cancellation, not a delete —
  removing the row would take every other Thursday with it.
- **Aggregated rows stay read-only.** Tasks, habits and finance appear on the
  calendar and say which module owns them. Two places that can edit the same
  row is how they drift.
- **Month view stays shallow on purpose.** A month grid at full fidelity is
  where calendars go to become unreadable — thirty cells of four-pixel text.
  Three items and a count, then click through.
- **Removing a library removed its constraints.** The nine hard-coded hex
  colours were not carelessness; they were what FullCalendar requires, since it
  wants a concrete colour per event rather than a class. Colours are tokens now
  and move with all 52 presets.

### Audit pass — findings

The module was reviewed after it was declared finished. Four defects, none of
which a type check, a lint or the existing suite had an opinion about.

- **`<SelectItem value="">` throws.** Radix reserves the empty string to mean
  "nothing selected", so an item carrying it does not warn or degrade — it
  raises, and takes the whole sheet down. The recurrence dropdown's "Does not
  repeat" option was `{ value: "" }`, so clicking any event crashed the sheet.
  Use a named sentinel (`none`) and map it back to `null` at the write. The
  same applies to any "no calendar" / "no category" option: a select that
  represents absence needs a value for it.

- **`auto-rows-fr` sizes every row to the tallest.** One day with several
  events stretched all six rows of the month grid past its container. A month
  cell must have a **fixed** height and clip, reporting the remainder as a
  count — that is why every real calendar shows "+3 more" rather than growing.
  The count itself must be derived from the row and chip heights, not
  hard-coded, or the two drift and the cell overflows the clip it was given.

- **Walking days by adding 86,400,000ms is wrong twice a year.** A day is 23 or
  25 hours across a clock change, so a cursor stepped in fixed milliseconds
  drifts off midnight and every bucket lookup past the boundary misses. Events
  vanished from the last week of March and October. Step with `addDays`. This
  is the same family as the `new Date("2026-12-31")` trap recorded above — the
  fourth appearance of local-versus-absolute time in this rebuild.

- **An endpoint with no call site is not dead code — it is a missing feature
  that looks present.** `useDeleteCalendarMutation` shipped unused, so a
  calendar could be created and then never renamed, recoloured or deleted;
  `useDeleteEventExceptionMutation` meant a moved occurrence could never be put
  back in step with its series. Nothing flags this, so
  `calendarApi.test.ts` now asserts every calendar hook is reachable from the
  UI. Worth copying to other modules.

**A detached occurrence must be reversible.** Writing an exception row is easy;
living with one is not. The exception outlives every later edit to the series,
so an occurrence moved once silently stops tracking the rest forever. Carry the
exception's id on the occurrence and offer to discard it.

**A source scan is a weak test — check the data, not the JSX.** The first guard
for the empty-`SelectItem` bug scanned for `value=""` in markup and passed with
the bug reintroduced, because the empty string lived in an options array as
`value:`. Test the array the component maps over. Related: ``new RegExp(`\b${x}\b`)``
in a plain template literal is a _backspace_ character, not a word boundary,
and silently matches nothing — use `String.raw`.

---

## Dashboard

**Was** — eleven cards of equal weight, where overdue tasks sat beside total
blog views: a number that has never once required a decision. Equal weight is
the failure, because it makes the reader do the triage the screen exists to do.

**Is** — the workbench the design vision specified. One asymmetric grid: the
left column is a single ranked list of what needs you, the right a few small
gauges. Recharts is gone from the route, which took `/admin` to 100 kB.

**Carried forward:**

- **The ranking is the design, so it is testable.** `attention.ts` orders by
  what it costs to miss — an overdue task is a broken promise, a meeting in
  progress is one you are absent from, a habit has all evening, a message has
  tomorrow. Eighteen tests cover that ordering, because it is judgement rather
  than layout.
- **A "needs you now" panel must forget.** An event that finished at nine is
  not something that needs you at ten. Without that rule the panel becomes a
  log of the day so far.
- **Cross-feature derivation belongs to the feature that owns it.** Whether a
  habit counts as done comes from the habits module's own pure helpers.
  Schedules can be weekday-only, weekly-count or quantified; a second
  implementation here would drift from what Habits itself shows. The dependency
  is on two pure functions, never on the module's state.
- **Say "nothing is waiting" out loud.** An empty panel reads as a page that
  failed to load.

---

## Discover (new)

**Is** — weather for the places that matter, and what is being written about
the subjects you follow. Migration `012`.

**Carried forward:**

- **A key in a static export is a published key.** There is no server, so a key
  would travel as `NEXT_PUBLIC_*` and be compiled into the bundle. That is the
  whole reason the module is built on Open-Meteo, Hacker News via Algolia,
  dev.to and Wikipedia: no key at all, and all four verified CORS-open. A
  key-based service cannot be added here without a server to hold the key.
- **Store what to ask for, never the answer.** Caching a forecast means
  deciding when it goes stale, and a stale forecast is worse than none.
- **Third-party calls resolve, never throw.** These sit on someone else's
  uptime and behind whatever the visitor's ad-blocker decides. A failed panel
  says so; the page carries on. The visit tracker established the pattern.
- **Capture fixtures from the live service.** The tests here parse real
  responses, so when a shape moves they fail in CI rather than as an empty
  panel in production — the opposite of the Notes wikilink parser, which had 31
  passing tests against payloads its author invented.
- **Encode a search term, never interpolate it.** A topic containing `&`
  truncates the query and silently searches for something else.

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

**`<SelectItem value="">` throws — Radix reserves `""` for "nothing
selected".** It does not warn or degrade; it raises and unmounts the tree
around it. Any "none" / "no category" option needs a named sentinel mapped back
to `null` at the write. Applies to every Radix `Select` in the app, not just
the one it was found in.

**A day is not 86,400,000ms.** Twice a year it is 23 or 25 hours, so any cursor
stepped in fixed milliseconds drifts off midnight and every keyed lookup after
the boundary misses. Step with `addDays`. This is the same family as the
`new Date("2026-12-31")` trap below — local calendar arithmetic must be done
with calendar functions, never with arithmetic on the epoch.

**An RTK Query endpoint with no call site is a missing feature, not dead
code.** Nothing flags it: the hook exists, the reducer is registered, the types
check. The user just finds a thing they can create and never edit. Assert
reachability in a test — see `src/store/api/admin/calendarApi.test.ts`.

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

**Scan the data, not the markup.** The first guard written for the empty
`SelectItem` bug searched the JSX for `value=""` and passed with the bug
reintroduced, because the empty string lived in an options array as `value:`.
If a component maps over a list to render, test the list.

**Every new test must be watched failing.** Revert the fix, run it, confirm red,
restore. Three tests in this rebuild would have passed with their bug in place —
the source scan above, an `AnimatePresence` visibility assertion that never
completed in jsdom, and ``new RegExp(`\b${x}\b`)``, where `\b` inside a plain
template literal is a _backspace_ character rather than a word boundary, so the
pattern silently matched nothing and every case in the suite failed at once.
Use `String.raw` for regex fragments built from templates.

**The gate before any commit:** `npx tsc --noEmit`, `npm run lint`,
`npx vitest run`, and a cold `npm run build` for anything touching build or
runtime behaviour. Kill the dev server first — it writes into `.next` and
corrupts the build with `PageNotFoundError`.

---

---

# Part six — The readiness audit

Run after every module except Dashboard was declared finished, to answer one
question: is this safe to put in front of a user. The answer was no, four times
over. What follows is what a "done" module still had wrong, and the checks that
now hold each line.

The shape of every finding is the same: **none of them failed a type check, a
lint, or the test suite.** They were invisible to every gate the project had.

## The MFA bypass

The schema enforces mandatory TOTP through RLS — every policy reads
`auth.uid() = user_id AND is_aal2()`. **`SECURITY DEFINER` bypasses RLS**, and
six functions checked only `auth.uid()`, or nothing beyond a `GRANT` to
`authenticated` — which includes a session that has passed a password and not
the second factor.

With a password alone: `get_calendar_data` returned the whole calendar,
`account_balance` the account balances, `get_analytics_overview` the dashboard
aggregates, and the three `*_transaction_category` functions could rewrite
categories across the entire ledger. All scoped to `auth.uid()`, so nothing
leaked between users — but the second factor was optional for a meaningful
slice of the data it was supposed to protect.

Three of the six came from this rebuild.

**The rule:** a `SECURITY DEFINER` function is _outside_ RLS. Whatever the
policy on its tables would have required, the function has to require itself.
`REVOKE ... FROM anon; GRANT ... TO authenticated` is not that check —
`authenticated` includes AAL1.

Four also had no `SET search_path`, which resolves unqualified names through
the _caller's_ path. Supabase's own advisor flags this as "Function Search Path
Mutable".

Held by `src/lib/db-security.test.ts`: pinned search_path, AAL2 with a
documented allowlist for the triggers and public endpoints that must not
require it, and RLS on every table.

## Every date was the UTC date

`toISOString().slice(0, 10)` formats the **UTC** day, which is a different day
for part of every day. In Toronto at 20:30 on 15 August it already reads the
16th. Twelve call sites.

So, every evening after 8pm: a transaction was dated tomorrow, an FX cache key
never matched the day it was written for, a recurrence `UNTIL` serialised a day
late, and the recurring-payment queue keyed occurrences by a day its own
producer never generates. East of Greenwich it fails the other way — local
midnight in Kolkata is still the previous day in UTC.

The cause was an asymmetry: the codebase had `parseLocalDate` for reading and
**no counterpart for writing**, so every writer improvised the same wrong thing.
Where a codebase gives you half a pair, expect the other half to have been
reinvented badly in a dozen places.

`toLocalISODate` is the other half. One place keeps UTC deliberately — analytics
buckets arrive from the database already grouped in UTC — and opts out through a
marker comment rather than a filename exemption, so the exception stays visible.

## Forms accepted what the columns would not

Zod schemas existed and were correct; the forms did not use them.

The transaction form asked whether the amount was a positive number. The column
is `NUMERIC(10,2)`, so anything past 99,999,999.99 arrived as `numeric field
overflow` — which the user sees as a save that simply failed, on a form that had
already accepted the figure. Transfers were worse: both legs are transactions,
so the overflow raises on the _first_ write and leaves the balance wrong in both
directions.

The calendar's event sheet checked that the title was non-empty and wrote
everything else unvalidated, against columns bounding `location` at 300,
`meeting_url` at 2048 and `rrule` at 500.

Both were the same drift: a rebuild added columns and did not extend the schema
that guards them.

**The rule, now mechanical:** the bounds are read back out of `db/schema.sql` in
a test. A migration that moves a column fails there rather than at someone's
next save. All 34 `char_length` constraints were swept against the form that
writes them.

## Features that existed only as endpoints

An RTK Query endpoint with no call site is not dead code that lints away — it is
a feature that _appears_ to exist. The hook is there, the reducer is registered,
the types check. The user simply finds a thing they can create and never edit.

Nine came back from the sweep. The genuine ones: a calendar could be created and
never renamed, recoloured or deleted; a moved occurrence could never be put back
in step with its series; Learning filtered on `archived_at` in every list while
nothing could ever set it, so clearing a settled topic meant destroying the
review history that proved it had been learned; and both Tasks and Habits had a
`display_order`, a query sorting by it, and a reorder RPC — with no gesture. The
tasks query even carries a comment reading "manual rank first so drag-to-reorder
sticks".

The root cause was one line of config: `next/core-web-vitals` does not enable
`no-unused-vars`, so a symbol could be imported, wired to nothing, and pass every
gate. Enabling it found sixteen more, including the calendar's own density
picker — imported, never rendered, which is why the control the user had been
told about was never clickable.

`endpoint-reachability.test.ts` now holds every admin slice, with an allowlist
where not-calling is a decision. **The allowlist is checked in both directions**,
and that second half earned itself immediately: wiring the reorder gestures and
the saved scenarios turned six entries stale, and the test said so.

## What the audit says about testing

Five tests written during this rebuild **would have passed with their bug in
place.** Two of them were written during this audit, to catch the bugs the audit
had just found:

- A scan for empty `SelectItem` values searched the JSX for `value=""`, while
  the real one lived in an options array as `value:`. It passed with the bug
  reintroduced.
- The first `SECURITY DEFINER` test split functions on a `$$` terminator the
  schema uses three different forms of, so most bodies came out two characters
  long, matched nothing, and reported the whole schema clean **while the bypass
  was still open**.

Both were only caught by seeding the regression and watching for red. A test
written to catch a bug you have already fixed has no evidence it works. The bug
is the only fixture that proves it.

Two smaller traps, both of which produced a silently-empty result rather than an
error: ``new RegExp(`\b${x}\b`)`` — inside a plain template literal `\b` is a
_backspace_, not a word boundary — and a `glob` pattern that matched nothing, so
a scan over "every file" scanned none. Any test that filters a collection needs
an assertion that the collection is non-empty.

---

# Appendix — Migrations

Run in order. All are additive and safe to re-run.

| File                                                | Adds                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `db/migrations/001-tasks-projects-dependencies.sql` | `task_projects`, `task_dependencies`, task scheduling/time/recurrence columns, cycle trigger, ordering and time RPCs |
| `db/migrations/002-habits.sql`                      | Habit schedules, quantities, kind, archiving; `set_habit_log`, `update_habit_order`                                  |
| `db/migrations/003-learning-review.sql`             | Topic review state, `learning_reviews`, `record_learning_review`                                                     |
| `db/migrations/004-notes.sql`                       | Note archiving and bounds                                                                                            |
| `db/migrations/005-inventory.sql`                   | Item location, quantity, tags, archiving, and a warranty/purchase-date check                                         |
| `db/migrations/006-lockdown-enforcement.sql`        | **Opt-in.** Makes lockdown level 2 refuse admin writes at the database                                               |
| `db/migrations/007-contact-inbox.sql`               | `contact_submissions` triage columns, `integration_settings`, rate limit and Discord notify triggers                 |
| `db/migrations/008-visitor-analytics.sql`           | `site_visits`, `analytics_secret`, daily-salted visitor hashing, `get_visitor_analytics`, `prune_site_visits`        |
| `db/migrations/009-finance-foundation.sql`          | Accounts, categories, budgets, scenarios, FX rates, per-transaction frozen rates, `account_balance`                  |
| `db/migrations/010-calendar.sql`                    | `calendars`, `event_exceptions`, `calendar_settings`, recurrence and overlap-filtered `get_calendar_data`            |
| `db/migrations/011-harden-definer-functions.sql`    | **Security.** Adds the AAL2 check and a pinned `search_path` to six `SECURITY DEFINER` functions that lacked both    |
| `db/migrations/012-discover.sql`                    | `discover_places` and `discover_topics` — what to ask the public APIs for. Nothing fetched is stored                 |

`db/reset-habits.sql` and `db/reset-learning.sql` are destructive alternatives
that drop and rebuild with seed data. They keep nothing.

`db/schema.sql` carries every definition, so a fresh install arrives at the same
place without running any migration.

---

# Appendix — Status

**Rebuilt:** Content, Blog, Updates, Navigation, Assets, Tasks, Habits,
Learning, Notes, Whiteboard, Inventory, Security, Settings, Inbox (new),
Analytics (new), Finance, Calendar, Dashboard, Discover (new).

**Not yet rebuilt:** none. Dashboard was the last, and Discover is new.

**Audited:** everything except Dashboard, in Part six. Four classes of defect
found and fixed, each now held by a test that was watched failing first.

**Open:**

- Everything up to `011` is applied. `012` adds the two Discover tables and
  must be run before that module works. `006` remains opt-in.
- Retention is a function and a button, not a schedule. `prune_site_visits()`
  can be put on `pg_cron` if the table ever grows enough to matter.
- `[[` autocomplete against existing titles in `note-form.tsx`.
- The Learning session timer still logs to `learning_sessions` from the notes
  editor only; it is not wired into the review flow, deliberately — a review is
  thirty seconds and a stopwatch on it would reintroduce the friction the
  rebuild removed.
- CSV import and auto-categorisation in Finance, and investment holdings, are
  named in the guide and not built.
- **Nothing here has been exercised against real data by a person.** Every
  check in Part six is static or unit-level. That is the remaining gap between
  "the gates are green" and "this is safe to use".

---

# Part seven — The QA pass

Twenty-three items of owner feedback, analysed in `docs/redesign/v3-qa-plan.md`
and worked through in five phases. The analysis is worth reading before the
code: several items that arrived as three separate complaints turned out to be
one cause, and two arrived as bug reports and were not bugs.

## What the pass says about the gates

**Three items were one mistake.** Hero, About and Contact each declared a
multi-column grid while the content filling one column was optional, so turning
the option off left the column there and empty. The owner reported them as
three unrelated problems on three pages.

**Three more were one unguarded rule.** The timeline, the blog table of
contents and the Updates card all still used a dotted rule as a separator —
retired v2 grammar — because `design-system.test.ts` banned the custom class
`rule-dotted` and said nothing about Tailwind's own `border-dashed`. The owner
was reporting the old aesthetic three times.

**And one was a rule the code had quietly stopped following.** `CLAUDE.md`
states the admin shell has no sidebar rail and lists a left icon rail among the
retired motifs. A fixed 15rem rail had been sitting there regardless, with a
comment explaining why it was brought back. Nothing caught it because the
design gate only checks class names.

The lesson is consistent: **a rule that is written down but only mechanically
enforced for its easiest case is not enforced.**

## Traps added to the list

**`position: sticky` resolves against the nearest scrolling ancestor, and
`overflow-hidden` makes one.** The blog editor's toolbar was pinned to a box
that never scrolls — the editor grows with the document and the _page_ scrolls
— so it travelled off screen. Two ancestors had to lose `overflow-hidden`, and
neither was obvious from the symptom. Guarded by a source test, because jsdom
does no layout and this is invisible to every other gate.

**A flex child with no `shrink-0` is compressed below its own content.** The
calendar's all-day row sat in a `min-h-0 flex-1 overflow-hidden` column, so
with several items the browser squeezed it and the chips painted over the hour
grid. One or two items were short enough that it never bit, which is why it
read as "overlapping with multiple items".

**`dragenter` / `dragleave` fire per element, not per region.** Crossing from a
drop area onto a card inside it raises leave-then-enter, so a boolean flag
flickers once per card. Count depth instead. The existing test drove exactly
one enter and one leave — the only sequence the boolean got right — and passed
with the bug in place.

**Two drags can land on the same page.** Files from the desktop and items being
moved within the app are told apart by `dataTransfer.types`, which is the only
thing readable during `dragover`. Without that check an in-app move raises the
upload overlay and drops into the upload handler.

**`\b` was eaten again.** A guard written with word boundaries had them turned
into literal backspace characters by the tooling that wrote the file, so every
pattern matched nothing and the rule reported the codebase clean _with the bug
it was written for still in it_. Caught only by seeding the bug and expecting
red. Compare tokens rather than writing regexes with escapes — `tokenize` from
`class-rules.ts` exists for this.

**A trigger that fires on every update makes `updated_at` a lie.** Pinning a
note rewrote its modified time, so a note claimed to have been edited when only
its filing changed — and, since the list sorts on that column, pinning silently
reordered it. Migration 013 compares the row as JSONB minus the organisational
fields, so a column added later counts as content by default.

**Bundle regressions arrive through innocuous imports.** Rendering a task
description through the markdown pipeline cost 47 kB of first-load JS on
`/admin/tasks` — and was also inconsistent, since the form is a plain textarea.
Check the per-route figure after adding any renderer.

## Decisions worth reusing

**Content availability decides the layout.** A grid template naming two columns
is a promise that both exist.

**A sticky bar is painted in its container's fill.** `bg-background` inside a
`bg-card` panel is a different colour on nearly every preset.

**Ratchets, not sweeps, for debt you cannot fix in one pass.** Monospace could
not be judged mechanically — code and serial numbers are legitimate — so it is
a budget of the files using it, checked in _both_ directions. The list went 48
→ 44 during this pass and cannot grow. The same shape covers the two files that
legitimately paint `bg-background` under a sticky bar.

**Read before you edit.** Tasks, Projects, Notes and Whiteboard all opened
straight into an editor, so every glance put a record one keystroke from a
change. The read view is not a lesser version of the form: it is what you
wanted nine times out of ten.

**Verify a source before designing on it.** Discover's watchlist is shaped the
way it is because keyless CORS-open equity quotes were _tested for and not
found_ — Yahoo 429s, Stooq 404s and sends no CORS headers, marketdata.app
answers only for `AAPL`. The design that follows from that is honest; the one
that would have followed from assuming otherwise would have shipped empty
panels.

**Capture fixtures from the live service.** Remote OK's array begins with a
licence notice rather than a job, and its locations arrive as "York, " and
"Goa, ". No hand-written fixture contains either.

## Migrations added

| File                                 | Adds                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `013-notes-organisational-touch.sql` | `updated_at` on notes means the content changed                                     |
| `014-goal-contributions.sql`         | `finance_goal_contributions`, and `record_goal_contribution` — atomic, AAL2-checked |
| `015-learning-material-kinds.sql`    | `kind` / `prompt` / `answer` / `choices` on learning topics                         |
| `016-discover-watchlist.sql`         | `discover_watchlist`, and a market-data key on `integration_settings`               |
| `017-portfolio-item-merges.sql`      | `merged_into` on portfolio items, for real timeline merges                          |
| `018-library.sql`                    | `library_sources`, `library_highlights`, and `get_random_public_highlight()`        |
| `019-section-show-title.sql`         | `show_title` on sections — a hidden title stays in the page, screen-reader-only     |

## Library (new)

**What it is.** One module under Life for the reading list and the lines kept
from it. A _source_ is a book, article, video or podcast with a status (want,
in progress, done, set aside), dates and a rating; a _highlight_ is a line,
optionally from a source, with who said it, where (a page or a timestamp), a
private note, and two flags — favourite, and public.

**The public boundary is one function.** Visitors have no policy on either
table. `get_random_public_highlight()` is `SECURITY DEFINER`, returns one row
marked `is_public`, and returns only the columns a citation needs — never the
note. It is allowlisted in `db-security.test.ts` with that reason. Everything
is private by default; making a line public is a deliberate toggle, and the
form previews it using the visitor's own component.

**Placement is a CMS layout, not a hard-coded slot.** `highlight` is a
self-sourcing layout beside `github-grid`, so the owner puts it on Contact,
Updates or any page from Content. Updates gained `DynamicPageContent` for this —
it was the one content page without a CMS slot. The widget resolves to nothing
on any failure (empty library, network, migration not yet run): a quote is
decoration, and must never be why someone else's page shows an error.

**Playing here, where the provider allows it.** YouTube (the nocookie player),
Vimeo, Spotify and Apple Podcasts embed; articles open on the original site,
because most sites refuse framing and a reader view needs a server this export
does not have. The iframe `src` is **built from a parsed ID against an exact
host allowlist, never copied from the pasted link** — `youtube.com.evil.example`
contains "youtube.com", and a `javascript:` URL parses. A highlight whose
location is a timestamp gets "Play from 12:34", which reloads the player there.
A bare number is deliberately not read as seconds: "42" is a page far more
often than a second.

**Decisions worth reusing.**

- A status reads in the verb its kind takes — "Want to read", "Watching",
  "Listened" — because the list holds all four kinds.
- Moving a status stamps the date it implies (started, finished) without
  overwriting one already recorded, and skips a finish date that would precede
  the start, since the CHECK would refuse it.
- Deleting a source keeps its highlights (`ON DELETE SET NULL`), and the
  confirm says how many will lose their source before it happens.
- Attribution beats the creator in a citation: a podcast guest said the line,
  the host did not.
- The zero-config site shows three correctly attributed lines from
  `MOCK_HIGHLIGHTS`, picked with the injectable `pickRandom`.

## Timeline, designed from scratch

Two versions went before this one in the same week: the multi-lane graph
(accurate, hard to read) and a git-log restyle of a supplied snippet (a card
per commit with a hash). The owner rejected both and asked for a designed
timeline. `timeline.tsx` replaces `timeline-graph.tsx`.

**The layout is when / rail / what.** From `md` up the period has its own
column — the start date large, the end or a pulsing "Present" under it, the
duration under that — so the dates alone read as the shape of a career. It is
sticky, so a long card never scrolls its own date away. On a phone the period
folds into one line above the card and the rail moves to the edge.

**The rail fills as you read.** A spring-smoothed, scroll-linked primary fill
over a track that fades out below the oldest entry; each node fills as it
arrives; ongoing work pulses. Cards and periods ease in once, on the
`--m-enter` curve. Under reduced motion nothing moves — no progress fill,
nodes filled, content present from the start.

**Relationships are words first.** Concurrency (derived) sets an item in as a
side track — smaller hollow node, indented card — and names the main-line item
it overlapped most ("Alongside Day job"). A declared merge reads "Became part
of …". No lanes.

**Durations are honest.** Months count inclusively, as a CV does; a bare year
gives whole years only; and an ongoing item's duration waits for the
visitor's clock after mount, because the page is statically exported and a
build-time "Present" would be stale and would not hydrate.

**Theme.** Tokens only. Nodes are hollow on a card fill rather than ringed in
a gap colour — a band's fill is not something a node can know.

## Public section layouts, redesigned

After the timeline, the owner asked for the same treatment across every
public section. Done in layers so the nineteen layouts share one vocabulary
instead of each inventing a shadow, a hover and an entrance.

**The shared layer.** `motion.tsx` holds three moves — `Reveal`, `Stagger` /
`StaggerItem`, and `CountUp` — all run once on the `--m-enter` curve and all
absent under reduced motion. The stagger step shrinks with the group so a
long list never takes more than ~0.7s to arrive. `shared.tsx` gained `CARD`
and `CARD_INTERACTIVE` (the lift, only on linked cards — a card that rises
promises it goes somewhere), `LinkCue` (up-right leaves the site, right stays
on it, nothing for an unusable link) and `Monogram`. Tags and dates left
monospace for the body face; `shared.tsx` and the three layout files left the
mono budget.

**Count-up is only for quantities.** A year counting from zero, a ratio
("24/7") counting its first half, and a phrase ("Since 2019") render as
written. The server renders the real value; screen readers get it once from
an `sr-only` copy, never the frames; the animation always lands on the
author's exact string.

**Per layout, one signature each.** Stats and impact figures count up;
impact sizes its columns to the number of figures. Masonry was CSS columns —
the reading-order bug `CLAUDE.md` names — and now deals round-robin through
`distributeColumns`. Testimonials set the first voice large on its own.
Speaking marks each entry by kind, read from the subtitle. Work experience
shows the timeline's honest duration via the shared `useNow`. Case studies
put the story beside a rail of facts. Uses is one panel per category.
Feature rows arrive from their own side, inside `overflow-x-clip` so the
entrance cannot widen the page.

**Not verified visually.** The browser extension was not connected, so this
pass was checked by tests and the design-system gates, not by eye. The five
public pages were requested from the dev server and return 200 with no error
overlay — but sections load client-side through RTK Query, so that proves the
pages compile, not how the layouts look. The production build could not be
checked either: a `next dev` on port 3000 shares `.next` and collides with
`next build`.

## Every public page, redesigned

The section pass left the frame untouched, and the owner asked for every
public component, from `/` outward, to the standard of a top product team.
Done route by route in five commits.

**Chrome.** The header is a translucent pill that thickens and rises once
content scrolls under it; the active page is one shared pill that travels
between links (`layoutId`), not a colour swap; the phone menu is a floating
sheet that closes on navigation and Escape. The footer is a floating panel
that answers the header — identity, the site's pages, channels, copyright and
Back to top — and takes `links` as an optional prop so the settings preview
still composes from what it is given. `PageHeader` arrives in three beats at
display size. The 404 offers the site's own pages, not only "home". The
maintenance screen says "Back shortly", not "status: maintenance".

**Home, About, Contact.** The hero's name rises word by word from a mask while
staying one accessible name; it gained the primary and secondary actions it
never had, with channels as named round icon buttons. About is an editorial
spread: a portrait card beside the bio, which opens on a larger first
paragraph. Contact puts the form in a raised card and says under each channel
where a tap lands.

**Blog.** The newest post leads as a featured card while browsing and steps
aside while filtering; tag chips come from the posts and `?tag=` arrives
pressed. A post opens on "All posts", its first topic and a large title, and
closes on share (X, LinkedIn, copy link) and an author card.

**Updates and repositories.** The journal timeline holds each month beside its
entries; the repository grid got cards, tabular stats and an outline "Load
more".

**Security, found on the way.** The About portrait, Updates images and
repository links reached `src`/`href` without the allowlist. All now go
through `safeImageUrl` / `safeLinkUrl`, each with a test.

**Ratchets tightened.** Seven more files left the monospace budget; the
dotted `hr` in `globals.css` — a v2 rule the class gate could not see — is
solid; code blocks and images lost their borders. The motion primitives moved
to `components/layout`, because a feature may not import another's internals.

**One edge, everywhere.** Every public page runs down a single left edge —
page header, section titles, cards. The random highlight was first redesigned
as a centred card and the owner rejected it for exactly that: a centred block
under a left-aligned section title puts the eye on a second axis. It now
shares the featured testimonial's grammar (faded corner quote mark, heading
face at a reading measure, a round mark beside the citation), and a test pins
it to the left edge. Centring is reserved for standalone full-page moments —
the 404, maintenance, post-not-found — and for empty states inside their own
box.

**Not verified by eye.** The browser extension was not connected, and the
production build collides with the owner's `next dev` on the shared `.next`.
Tests, typecheck, lint and the design gates pass, and every new test was
watched failing against a seeded bug.

## Themes, audited against the pages and the published palettes

The owner asked that every public layout element adapt to all 52 presets, and
that the palettes be checked against their sources on the web.

**Components were already on tokens.** No Tailwind palette classes, raw hex,
`rgb()` or colour-bearing inline styles in public code. The one exception was
outside the components: `themeColor: "#0a0a0a"` in the root metadata, which
painted the phone's address bar black on every light preset. The static value
is now the default preset's ground, and `applyTheme` retints the
`theme-color` meta from the resolved `--background` — custom themes included.

**The contrast gate tested pairs the pages did not use, and missed pairs they
did.** It checked nine token pairs; the redesign introduced text in the theme
colour on page and cards, muted and error text on cards, and relies on input
borders and focus rings being visible. Those are now gated — five more text
pairs at 4.5:1 and four non-text pairs at 3:1 (WCAG 1.4.11). Composites the
gate cannot express were measured separately and fixed in the components:
text on a `primary/10` tint failed on 15 presets (the text is now
`foreground`, the colour stays on the dot or icon); Spotlight's 75% labels and
tinted chips failed on four (full-strength labels, outlined chips); muted text
on `bg-secondary` failed on Neobrutalism Punk (secondary pills and inactive
filter chips now use `secondary-foreground`, the gated pair).

**Orientation is gated.** Every preset whose name says light or dark is
checked with `isDarkBackground` — the function that sets the `dark` class — so
a preset cannot claim one mode and render the other's shadows and prose.

**Palettes, checked against their sources.** Seventeen named presets were
compared with the Dracula spec, Nord docs, ethanschoonover.com/solarized, the
Catppuccin palette.json, rose-pine/neovim, folke/tokyonight.nvim,
morhetz/gruvbox, rebelot/kanagawa.nvim, sainnhe/everforest, Shatur/neovim-ayu,
Binaryify/OneDark-Pro, sickill/vim-monokai and GitHub Primer. Seven had
drifted and were restored where the official value passes AA — Ayu Dark
(ground and accent), GitHub Dark (ground, text, blue), Monokai, One Dark Pro,
Tokyo Night and Everforest text, Nord's accent (nord8). Solarized Dark's text
is base1, and its muted text sits between base0 and base1 on a base02 muted
ground, because base0 itself is 4.2:1 there. `theme-palettes.test.ts` pins
every anchor within 10/255 per channel; accents that fail AA as published
(Solarized blue) are listed with the reason. Glass Dark, not a published
theme, was nudged over the line on three pairs.

## Follow-up

**The watchlist was built**, in two tiers. Crypto is priced live with no key
(CoinGecko is keyless and CORS-open); stocks, ETFs and indices are priced once
the owner supplies their own free Finnhub or Twelve Data key, both of which were
verified CORS-open; funds and bonds link out, because neither free tier covers
them, and a row showing nothing beside neighbours showing prices reads as a bug
rather than as a limit.

The key lives on `integration_settings` — RLS, no public read policy — and
Discover is an admin route, so the owner's browser reads it and it never enters
the bundle. Same argument as migration 007. The field sits in the panel beside
the rows it unlocks rather than on a settings screen, because that is where the
gap is felt.

**Finnhub reports an unknown symbol as a zero price, not an error.** Treated as
no quote. A confident wrong number is the failure worth guarding on a money
screen.

**The shell arrangement became a preference.** This project went round the same
loop three times — rail, floating pill bar with navigation behind a keystroke,
rail again, launcher — defending each as correct. That is the signature of a
question with no single answer: a rail is worth its 15rem on a wide monitor and
costs a sixth of a laptop screen. It is now chosen per device in
`localStorage`, not synced, because the right answer differs between the two
machines the same person uses. Both arrangements read `NAV_GROUPS` and
`isActiveNavHref`, so neither can disagree with the other about what exists.

`CLAUDE.md` was updated to match. It previously said "there is no sidebar rail"
while a rail sat in the code, which is how this pass's contradiction arose;
leaving it stale a second time would be that mistake made knowingly.

## Still open

- Learning's certification layer — timed mock exams, per-exam progress, an
  importable question bank — sits on top of the loop this pass built and is not
  built.
- Assets: keyboard-accessible moving, dragging onto a breadcrumb. (Per-file
  upload progress shipped.)
- Library: no public bookshelf — only the random highlight is public, by
  choice. A shelf page would be a second public function, not a table policy.
- **Migration 018 is unapplied.** Until it is, the Library admin errors on load
  and the public widget shows nothing.
