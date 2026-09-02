I would like to mention few issues,

> **Status legend** — `[x]` resolved, `[~]` partially resolved, `[ ]` pending.
> The original feedback below is kept verbatim; status and implementation notes
> are appended to each item. The analysis behind every item, and the phase order
> the work runs in, is in `docs/redesign/v3-qa-plan.md`.


1. on main home page, I didnt like the Hero section so when the status panel is not shown the right section looks empty, previously it used to center the hero section centered align - I want you to redesign that section with design brainstroming

**`[x]` Resolved.** The grid was unconditional — `lg:grid-cols-[1.35fr_1fr]`
rendered whether or not the status panel did, so switching the panel off left
the text at 57% width beside a column that was still there and simply empty.
Two deliberate compositions now: the asymmetric band with the panel, and one
column across the full measure without it. Centring was the other candidate and
is rejected on the v3 rule that a full-width block of text is not centred — at
display size a centred name over a left-aligned paragraph pulls the eye along
two axes.

2. on Home, page I didn't like the Contact CTA - like the banner is good but I should have better design and visibility with few theme the UI/coloring system is off

**`[x]` Resolved — and the "colouring is off" was measurable.** `band-accent`
is `hsl(var(--accent) / 0.35)` over the page background, and every piece of
text on it was `--foreground`/`--muted-foreground`. No test covers that pair:
`theme-contrast.test.ts` gates `accent` against `accent-foreground`, a
different colour. Composited and measured over the 52 presets, the real pair
**fails WCAG AA on 31 of them** — `muted-foreground` down to 2.10:1 on
cyberpunk, and `foreground` itself failing on solarized-light, onedark-pro and
monokai.

Re-tinting would trade a failure on pale presets for one on dark presets, so
the content moved onto a `Surface` instead: its ground is `--card` and its text
`--card-foreground`, which *is* gated everywhere. The band keeps its accent
weight so it still reads as the end of the page, and visibility now comes from
elevation, which is a fixed shadow and therefore identical on all 52 presets.
Hierarchy tightened too — the email link was a second elevated card competing
with the primary action, and is now a quiet inline link.

3. on about page, I asume there is grid section for profile pic and about info, so when the profile is not shown the about description is in profiles's grid container in single long column brainstrom on the design and see how can you make it better UI/UX and over all functionality

**`[x]` Resolved.** Same root cause as item 1. `sm:grid-cols-[8rem_1fr]` was
unconditional while the picture was optional, so with no picture the bio still
rendered into the *second* column and the first stayed an empty 8rem gutter —
the text began a third of the way across for no visible reason. The column now
exists only when there is a picture, including the case where the switch is on
but the URL is empty.

4. for section renderer section, I didn't like the timeline UI/UX the design is off and it's not aligned properly I want something like github commit/branch timeline structure - I should be able to clearly see the timeline, if some process overlaped (like similar to parallel branching and merging) - brainstrom and make something like that

**`[~]` Resolved, with one deliberate limit stated up front.** The timeline was
a flat `<ol>` with `border-l-2 border-dotted` — a dotted rule as a separator,
which is retired v2 grammar — and a shape with no way to say that two things
happened at once. It is now a lane graph: chronology newest-first, a lane
opening when two items genuinely overlapped in time, that lane rejoining the
trunk when the overlap ends, and an open tip for work with no end date.

**What it cannot do, and why I did not fake it.** `portfolio_items` has no
parent, branch or lane column of any kind. Concurrency is derivable from
overlapping dates and is honest. A *merge* in the git sense — "X was merged
into Y" — is not: it needs an explicit parent pointer, and inferring one from
"this ended around when that began" would draw a relationship you never stated.
So a lane rejoins the trunk when it ends, which is true, and nothing claims
causation. Adding `depends_on` to `portfolio_items` is the right change if you
want real merges; say the word and it is a small migration, but I have not made
it on speculation.

**A second constraint worth knowing.** `date_from` and `date_to` are free-text
`TEXT` columns, so a value can be `2023`, `Jan 2023`, `2023-04-17` or `Summer
2022`. The parser reads the first three and returns *nothing* for the fourth
rather than guessing — ordering "Summer 2022" as the epoch would silently sink
it to the bottom of every timeline. Undated items keep their given order on the
trunk and claim nothing, and a section where no date parses degrades to an
ordered trunk rather than to a broken graph.

Drawn in CSS rather than SVG, because row heights vary with description length
and an SVG overlay would have to measure every row and re-measure on resize and
font load. Below `sm` the lanes collapse to one rail — parallel lanes at 375px
are four-pixel columns — and concurrency is stated in words instead, so a phone
does not lose the information.

5. for blog page, public, the table of content is off with the blog content, I can scroll down to the page but some title in TOC is not highlighed even when I click on TOC title the blog scrolls to that but it's not higlighted.

**`[x]` Resolved.** The active heading came from an `IntersectionObserver` with
`rootMargin: "-20% 0px -70% 0px"`, setting the id only while a heading sat
inside a band 20–30% down the viewport. Three failures came out of that, two of
which you hit:

- **Clicking could never highlight.** The click parks the heading 96px from the
  top; on a 900px window the band starts at 180px. The heading landed *above*
  the band, never intersected, and the highlight stayed where it was — the page
  scrolled correctly and the wrong entry stayed lit.
- **The last heading was often unreachable.** At the end of a document there is
  no scroll left to lift a short final section into the band, so its entry
  never lit at all.
- (Unreported) several entries arriving in one callback resolved by array
  order, so a fast scroll could leave a lower heading active than the one on
  screen.

It now asks "which heading did I last pass", against the *same* constant the
click scrolls to — that shared constant is the whole fix for the first failure
— with an explicit rule for the bottom of the document. Exactly one entry is
active at every scroll position.

6. in updates after all notes I need "--that's all for now--" in script/design font centered align - also the font for date and #tags I want script and intead of dotted line I want solid line in card - do brainstrom for design

**`[x]` Resolved.** `— that's all for now —` closes the feed, centred, in the
handwriting face, and it shows for a filtered view too: "that's all" is as true
of a filtered feed, and hiding it there would leave you wondering whether the
filter cut the list short or failed. Date and `#tags` are in the same face.

Two notes on the script font. `font-normal` is load-bearing — `typography.css`
is unlayered and puts `--heading-weight` (700–800) on bare headings, and a
handwriting face at that weight smears. And the sizes went *up*: Tahu at the
0.6875rem that row used to be is unreadable, because a script face carries far
less ink per pixel than the UI face.

The dotted divider is solid. It was not an oversight — it was unguarded: the
design gate banned a custom `rule-dotted` class and said nothing about
Tailwind's `border-dashed`. That is now a rule, so the same thing cannot come
back here or anywhere else.

7. on contact page, if I don't have any social link then the direct link title is still available with no social link also if the avalability and social is not there the form should be full legth, also check the layout for all three permutation and combinations, brainstrom the contact page for orders of the section what to visible locially and actually with what parts and all

**`[x]` Resolved, with an IA change rather than only a fix.** Three things were
wrong: the "Direct lines" heading rendered over an empty list; a link whose URL
`safeLinkUrl` rejected still counted as a link and rendered as an invisible row
under that heading; and `lg:grid-cols-[3fr_2fr]` was unconditional, so with no
links and no badge the form sat at 60% of the band beside nothing.

On the order: availability moved out of the aside to directly under the page
heading. It is context for the whole page — whether writing is worth it at all
— and in the old source order a phone reader met the entire form before
reaching it. The grid is then chosen from what exists: form plus links is two
columns, either one alone takes the band, and with the form off the links
become a two-up grid rather than very wide single rows.

8. admin, when I'm on main admin dashboard page the dashboard link is not with active coloring

**`[x]` Resolved.** `trailingSlash: true` makes `usePathname()` report
`/admin/`, so the `pathname === href` comparison failed — and `/admin` is
deliberately excluded from the prefix fallback, since every module path begins
with it. Dashboard was therefore the one entry that could never be active, and
`activeNavItem("/admin/")` returned undefined, which also left the document
title wrong on that screen. The rule existed twice with the same two bugs; there
is now one `isActiveNavHref`, which also fixes segment-boundary matching so a
future `/admin/blog-drafts` cannot light up Blog.

9. on admin/content, Pages section, the div with Items and add item button have different bg coloring which is off and clearly visible - check that out

**`[x]` Resolved.** Incorrect surface token, not incorrect nesting. The section
detail pane is `rounded-surface bg-card shadow-e1`, and the sticky Items header
inside it was painted `bg-background/95` — a different token, and a visibly
different colour on nearly every preset, so the header read as a foreign strip
laid across the panel.

A sticky bar does need a fill (its job is to occlude what scrolls under it);
the fill just has to be its *container's*. The same mistake was sitting
unreported in the habits grid, whose frozen first and last columns were
`bg-background/95` inside a `bg-card` table — four places in total.

Guarded now, and that guard is worth a note: the first version used `` word
boundaries, and the backslash did not survive the tooling that wrote the file —
it became a literal backspace character, so every pattern matched nothing and
the rule reported the codebase clean **with the bug still in it**. It compares
tokens instead. Two files that legitimately paint `bg-background` (a bar inside
a Sheet, and the blog editor's page-level toolbar) are allowed by name with
their reason, checked in both directions so an allowance cannot outlive it.

10. same UI issue in blog post edit view, take a reference of medium, dev.to and substacks bloging flow system and restructure the Blog components - also when the blog is long the tool bar is not sticking up it scrolls with the editing box

**`[~]` The toolbar is fixed and the writing surface is reworked; the
publishing flow is unchanged.**

**Why the toolbar scrolled away.** `position: sticky` resolves against the
nearest scrolling ancestor, and an `overflow-hidden` box counts as one. The
editor root carried `overflow-hidden`, so the toolbar was pinned to the top of
a box that *never scrolls* — the editor grows with the document and the page is
what scrolls — and it travelled off the screen with it. The blog editor's own
wrapper around the editor had the same `overflow-hidden`, so both had to go.

The toolbar now pins below the chrome above it. The admin topbar is `h-14`,
this page's bar is `h-14` beneath it, so the formatting toolbar sits at `7rem`
— passed in by the caller, because only the page knows how tall its own chrome
is. And it is one row that scrolls sideways on a phone rather than `flex-wrap`,
which grew it to three or four rows and took most of a small screen away from
the thing being written. That is the mobile problem the brief warned about.

**Two things found in the editor's own CSS while in there:**

- **Every heading in the editor was monospace.** Worse than a style slip: the
  published post renders headings in `font-heading`, so you were drafting in
  one typeface and publishing in another — the one thing a WYSIWYG editor
  exists to avoid.
- **The writing surface was `prose-sm`.** Drafting long-form at 0.875rem is
  uncomfortable in a way that only shows after a few hundred words, and it ran
  the full admin width — 120+ characters a line. Now base prose at a bounded
  46rem measure, which is close to what Medium, Substack and Ghost all settle
  on. **This is a shared component**, so Notes, Learning and CMS sections get
  the same larger, narrower writing surface.

**Research.** Medium keeps no persistent toolbar at all — a bubble on selection
and a `+` in the margin — while Substack and DEV keep a slim one pinned to the
viewport. All three separate metadata from writing, which this editor already
does via the settings sheet. The persistent-toolbar model is kept here because
the slash menu and bubble menu already exist alongside it and removing it would
be a change to how you write, not a fix to what you reported.

**Not done:** a distraction-free mode, and moving the title/slug/word-count
block into the document flow rather than above it.

11. in updates, it seems like the table/list view is old and other components are new sync the list/table with current new UI/UX

**`[x]` Resolved.** "Old generation" was specific once you look at it — the row
was still built the v2 way:

- **It hovered by growing a border** on a transparent one. Hierarchy drawn with
  a line is exactly the grammar v3 replaced; a row in a list responds by
  changing its fill.
- **`opacity-55` on an unpublished update.** That makes the title harder to
  read in order to say something the Draft badge beside it already says
  outright — and it dimmed the actions along with it.
- **Monospace on the timestamp**, plus `text-muted-foreground/60` stacking an
  arbitrary alpha on a token that is already muted.
- **`rounded-md`** thumbnails rather than the control radius.
- **"Untitled"** again, so the same rule as Notes applies: named by the
  update's own first line, with "Empty update" kept for one with nothing in it
  at all.

Functionality is unchanged, as asked. The shared `firstMeaningfulLine` moved to
`src/lib/text-preview.ts` on the way, since Notes and Life updates both need it
and a feature reaching into another feature's internals is what the
architecture forbids.

12. on Navigation, when I created new link say /ABCD it show correctly in navigation that this will be CMS page, it also shows on public nav bar but when I vist that it says 404.

**`[x]` Resolved.** Not a bug in the resolver — `generateStaticParams` runs at
build time with `dynamicParams = false`, while the navigation is fetched at
runtime. A page created after the last deploy is therefore in the site's own
menu of a build that has no HTML for it. That is what `output: "export"` means,
and generating more routes cannot fix it.

GitHub Pages serves `404.html` for any unmatched path, which makes it the one
place a static export can still decide about a URL. The 404 page now asks the
navigation whether a visible link claims the path and renders the same
`CmsPage` if so. Verified in a real build: `404.html` prerenders the loading
skeleton and contains no "404" text at all, so there is no error flash before
the resolver runs. The admin's Navigation row now also says a CMS page works
immediately and is built in at the next deploy.

13. in assets section, take a look at google drive functionality, currently the upload section is very small not full screen, also when I drag and drop to the assets the "drop the upload to assets folder" is flickering containuosly, also I should be able to drag and drop move from root to and folder that is visible, similar to Drive - Througly research and brainstrom on it and then implement

**`[~]` Mostly resolved.** Taken as three separate problems.

**The flicker was a state bug, as suspected.** `dragenter` and `dragleave` fire
per *element*, not per region — crossing from the drop area onto any card
inside it raises `dragleave` on the area and `dragenter` on the card, in that
order. A boolean set from those two events therefore switches the overlay off
and on again for every card the cursor passes. It counts depth now, so the
*region* is what is tracked, and a drag abandoned outside the window (or
cancelled with Escape) clears it too, which nothing did before.

Worth flagging: the existing test for this **passed with the bug in place**. It
drove exactly one enter and one leave, the only sequence the boolean got right.

**The upload area is a workspace now.** The drop region wraps the toolbar and
the grid, so with a handful of assets it was a few hundred pixels tall and the
target was a sliver of the page. It has a minimum height, so a folder has a
shape whether it holds three files or three hundred.

**Drag from root into a visible folder now moves the asset.** Folder cards are
drop targets, asset cards are draggable, and dragging one of several selected
assets moves the whole selection while dragging an unselected one moves just
that one. Both the drag and the existing dialog go through a single move path,
so a drag gets the same warning about `used_in` references breaking — a second
implementation would be a second chance to forget it.

The two drags are told apart by `dataTransfer.types`, which is the only thing
readable during `dragover`. Without that an in-app move raised the "drop to
upload" overlay over a gesture that was not an upload, and dropping it ran the
upload handler with nothing to upload.

**Still open:** upload progress per file, keyboard-accessible moving, and
dragging *up* to a breadcrumb. The first is the one worth doing next; a large
upload currently shows only a global spinner.

14. for inbox setting the UI should be like Outlook - sort by new first and the UI/UX should be similar

**`[x]` Resolved.** The "sort by new first" part turned out to be a real
finding. The **Needs attention** view is the default *and* it forced
oldest-first, so opening the inbox put the oldest message at the top. That was
deliberate — age is the only signal an inbox has about neglect — but it was the
wrong thing to impose on the view you land on, and it reads as a bug rather
than as a policy. Newest first everywhere now, with oldest one click away in an
explicit Sort control, because it *is* the right order for working through a
backlog.

Three changes toward the mail-client feel:

- **A list, not a stack of cards.** Every row was its own elevated surface with
  a gap between — a good shape for eight things and a poor one for two hundred,
  since the eye has to re-acquire the left edge on each row. One surface with
  flush rows and hairline dividers is what every mail client converges on.
- **Unread carries a rail as well as weight.** Bold alone is weak once several
  rows are bold.
- **Absolute timestamps in a fixed shape** — the time if it arrived today, the
  weekday within a week, a short date beyond. "3 days ago" has to be decoded
  before it can be compared with the row above it. Counted in calendar days,
  not elapsed hours, so a message from 11pm yesterday still reads as yesterday
  when you look at 1am.

15. for discover, in money and market it;s only showing BTC & ETH no I don't want that and there is on banner with srock indices are not shown, intead is there any way we can watchlist some stock/MF/ETF we can search it and if we find the result we can watchlist and maintain watchlist; in career tab, the only career is list from germany and other but I'm in NA also I want carrer fulltime/parttime/freelance all aspect of things; for What happened tab, it seems goog to me but I know for sure that you can do much better - take full responsiblility of discover module throught research and analyse world web and reconstruct the mosule.
Recently I'm more interested in reading aartficle which is most popular. Like I have mostly read substack articlers with more than 30K likes and most reshared. Can we do something like that 

15. for tasks, every thing is good - expect when i click on task it directly opens the editing ppanel intead I want a view first then edit if user wants to, also in projects the listed projects is always editable

**`[x]` Resolved.** Clicking a task opened the edit form directly, so every
glance at something put its every field one stray keystroke from being changed.
The sheet reads first now — status, priority, project, dates, estimate and
tracked time, tags, subtasks, what blocks it — and Edit is a deliberate second
action. Cancelling an edit that began from a view returns to the view rather
than closing outright, because you opened it to read something. Creating goes
straight to the form: there is nothing to read yet.

Two things stay live in the read view, because both are decisions rather than
edits to the record: ticking a subtask, and seeing what blocks the task. A view
that made you enter edit mode to tick something off would trade one friction
for a worse one.

Projects had the same problem in a stronger form: **every row was a live
`<Input>` with eight colour swatches permanently under it**, so the project
list was a page of forms and there was no way to simply look at your projects.
Rename and recolour are behind an explicit Edit now. Delete stays one click
away — it is guarded by a confirm that names what it affects, and burying an
ordinary list action is the opposite mistake.

(While in there: a comment claimed the swatches were read from the active
theme's chart tokens. They are literal hexes and always were; the comment now
says so.)

16. for habit, I don't look it personalized, it's not that lured section that can attract me to come to habit section, all the functionality and everything is awesome but it's not able lured me to it.

17. for learning module it's good compare to previous one but, let's say if there are module subtopic it's always not the flashcard that can be read all along in review system, right? I need solid learning module, that can change my nuroplasticity and help me become knowledable. and help me study and prepare for certifications for career.

18. in calander if there are multiple all day event or habit it's overlapping the UI, like it's not showing side by side.

**`[x]` Resolved.** Not an overlap-layout problem — a flex one, which is why it
only appeared once there were several items.

The all-day row sits in a flex *column* that is `min-h-0 flex-1
overflow-hidden`. With the default `flex-shrink: 1` the browser is free to
compress that row below the height of its own contents, and the chips — which
keep their intrinsic height — then paint straight over the hour grid beneath.
One or two items were short enough that shrinking never bit. `shrink-0` is the
entire fix, and the day-header row above it had the same latent bug.

Two things came with it. The row now caps its height and scrolls within itself,
because fixing the shrink alone means a day with a dozen all-day items eats the
whole viewport before the hour grid gets a single row. And in **day** view the
items now sit side by side in a grid — one column has the full width to spend,
whereas across a week each column is too narrow for anything but stacking.

Also fixed while in there: the row computed its day window as `startOfDay +
86_400_000`. A day is 23 or 25 hours across a clock change, so on those two days
an item could fall out of its own column. Now `addDays`.

19. for notes, if there is not title then don't show untitled. LOL. Also, I just pinned and it just says last modified min ago. is that will be the case?

**`[x]` Resolved — and the second half was a real bug, not just a display
choice.**

*"Untitled". LOL* — agreed. A note's title is genuinely optional; a heading is
often the last thing you add, if ever, so a board of quick captures read
"Untitled / Untitled / Untitled" while each note's own first line said exactly
what it was. An untitled note is now named by that first line, with the
markdown syntax stripped so `## Groceries` reads "Groceries" rather than
falling through. It is set muted, so a borrowed line does not look like a title
you wrote. "New note" is kept for the one case where there is genuinely nothing
to show — an empty note. Sorting by name follows the same labels, so A–Z now
matches the order your eye reads down the board.

*The pin timestamp.* You were right to doubt it. `update_updated_at_column()`
fires `BEFORE UPDATE FOR EACH ROW`, so it rewrote `updated_at` on **any** write
— including a pin toggle. The timestamp was true about the row and false about
the note, and because `notes_updated_at_idx` is DESC and the list sorts by it,
pinning also silently jumped the note to the top of "recently modified".

**Migration 013** makes `updated_at` mean what it is read for: the trigger
leaves it alone when the only difference is organisational (`is_pinned`,
`display_order`). Written as a JSONB difference rather than a list of column
comparisons, so a column added to `notes` later counts as content by default
rather than silently opting out. The card says "Edited …" now, which is a claim
it can actually support.

20. in whiteboard, should I be able to rename whiteboard from listed whiteboard view or it just should be from boardview page, also if I just opened the existing page and I have not made any change and click on close it shouln't be asking to discard, it doen't make any sense.

**`[x]` Resolved — and there were two bugs, in opposite directions.**

*The one you saw.* Excalidraw fires `onChange` for pointer moves, selection
**and its own initial load**, and the editor treated every one of them as an
edit. So opening a board marked it dirty and Close asked to discard changes
that did not exist. Dirty is a comparison now, not an event: the reader must
have touched the canvas *and* the drawing must differ from what was opened.
Both conditions are needed — the interaction test survives the library
renumbering elements while loading, and the fingerprint stops a mere selection
or a pan from costing a prompt.

*The one you did not.* Nothing marked the board dirty when you **renamed** it.
Autosave only runs while dirty and Close only asks while dirty, so renaming a
board and closing it discarded the new name in silence. That is worse than a
spurious prompt, and it is fixed by the same change.

**Renaming: both places.** The editor keeps its title field for while you are
working, and the gallery card now renames in place — Enter commits, Escape
cancels, an emptied name cancels rather than wiping the title. Renaming was the
one edit that never needed a canvas open, and requiring the heaviest screen in
the app to fix a typo was the friction worth removing.

One note on the tests: the canvas stub did not fire the load-time `onChange`
that causes the bug, so the first guard passed with the bug reintroduced. The
stub now fires it, which also turned two older tests into real ones.

21. in finance, there should be reveal/unreveal button, right? for numbers. Also in recurring form there is category text box which should be category dropdown similar to txn form; in activity tab: there are two add button which is redundant. In category creating category make sense but I didn't understand the need,income,etc.. in category how it'll help and how can I benfit from it. Also in goals, if I'm adding money it should ask me from which account you want to add to goal, from goal it should not only add some time in emergency we have to remove/take from it. also on budgeting I didn't understand the calculation on pace of $XXXX, ahead of pace. For forecast, I didn;t got the commitment only thing also when I did something on whatif scenario it showed  this is a consequence of the what ifs belows, not your current plan banner why it came in that only scenario, rest of the scnario is okay. Also What can be done to see forecast for further far future let's say 5 year, 7 year. I want to see that as I'm taking mortgage in india of about 50 lakh ruppes.

**`[~]` Seven of the eight are done; the eighth was a question rather than a
bug.**

**Reveal/hide — done.** A "Hide amounts" toggle blurs every figure, per browser
session. Done as a *container* rule rather than by wrapping each value: there
are around a hundred money figures across a dozen components here, and a
`<Money>` wrapper would only hide the ones somebody remembered to migrate — the
balance left visible would be the one that mattered. Blurred rather than
replaced, so nothing reflows, and made unselectable, because text under a blur
still copies out in the clear. It is a defence against the person behind you
and says so; the figures are one click away.

**Recurring category — done.** It was a free-text box while the transaction
form had a proper picker. Beyond the inconsistency, it meant a rule could carry
a category name matching no category, so it never set `category_id` and every
figure that groups by category silently omitted it. Same control, same rows,
same income/expense filtering.

**Two Add buttons — done.** The page header carries an Add menu covering all
four things this module creates, on every section; the ledger toolbar repeated
two of those four. One control, in one place. The empty state keeps its own
call to action — it only appears when there is nothing to look at.

**Categories — done.** The copy named the outputs ("the 50/30/20 check", "your
runway") which only helps if you already know what those are. It now says what
each switch *buys*: bucket is the grouping the 50/30/20 line compares against,
and essential is the only input to runway, so an unmarked list makes that
figure meaningless rather than merely approximate.

**Goals — done, and it needed a migration (014).** "Add to goal" bumped a
counter and wrote a ledger row attributed to **no account**, so no balance ever
moved — and the two writes were independent, with the second one only
`console.warn`ed on failure, so the goal could climb with nothing recording it.
The read-modify-write also loses an amount when two contributions race. It is
one `SECURITY DEFINER` RPC now (re-checking AAL2 itself, per migration 011's
lesson), it asks which account, and **Take out** is a first-class action —
an emergency fund you cannot draw on is not a fund. The database refuses to
take out more than the goal holds.

**Budget pace — done.** "Ahead of pace" was a conclusion with its workings
hidden. Each line now reads "62% spent, 55% through the month · on pace for
£X", which is the whole rule, next to the marker on the bar that shows the
second number.

**Long-horizon forecast — done.** 3, 5 and 7 years added. Past eighteen months
the *series* is monthly while the **arithmetic stays daily**, so a shortfall
date is still exact to the day — stepping the maths monthly would only ever be
able to name the month, and "this runs out on 14 March" is the sentence the
whole forecast exists for. Long horizons carry a banner saying plainly that
they compound today's commitments and today's spending rate and assume both
hold: useful for the shape of a mortgage decision, not for any number on it.

**The what-if banner — not a bug.** Its condition is already correct: it
appears only when your plan as it stands does *not* run out and the sliders
create the shortfall, which is why it showed on one scenario and not the
others. The message did not explain that, so it now says the sliders are
changed and that resetting them shows the real line.

**Not done:** a mortgage as a first-class long-dated commitment with a rate and
a term. It is representable today as a recurring rule with an end date, which
is enough for the forecast; making it an amortising instrument turns Finance
into an accounting system, so I have left it.

22. for Settings, for preview I want same exact preview as the actual website, not few components.

23. after all of these changes I want you to make a admin side bar layout instead of sidebar to google options, like google have 9 dots on top right beside the profile button from where we have access to all google applications.