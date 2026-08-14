# FolioKit v3 — Design Vision: "Surface"

> This document is written **without reference to the v2 "Precision Instrument"
> identity**. Where v2 is named below, it is only to record what v3 must _not_
> reuse, so the rebuild does not drift back into it.

## 0. The one inherited constraint

The 52 theme presets and 12 typography presets are **functionality**, not
decoration: visitors and the owner switch them at runtime, and
`src/lib/theme-contrast.test.ts` gates every one at WCAG AA. They own the
semantic colour contract — `--background`, `--foreground`, `--card`,
`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`,
`--input`, `--ring`, `--chart-1..5`.

v3 therefore **keeps those token names and invents nothing in colour space.**
Every other axis is a clean slate:

| Axis                | v3 owns it |
| ------------------- | ---------- |
| Colour token names  | inherited  |
| Layout & IA         | new        |
| Density & spacing   | new        |
| Shape / radius      | new        |
| Type scale          | new        |
| Elevation & depth   | new        |
| Motion              | new        |
| Component structure | new        |
| Admin navigation    | new        |

## 1. Concept — "Surface"

Content lives on **surfaces that float**, not on a flat page divided by rules.
Hierarchy comes from **elevation, size and space** rather than from labels,
ornament, or lines. The page should feel like objects arranged on a desk, not
like a printed document.

The failure v3 exists to correct: every module presented its contents the same
way — a uniform stack of same-weight blocks, so nothing looked more important
than anything else and the eye had nowhere to land.

## 2. Rules v3 does not break

These are the v2 mannerisms. They are retired, and reintroducing any of them
means the rebuild has drifted:

- ✗ Dotted horizontal rules as section separators
- ✗ Graph-paper / engineering-grid backgrounds
- ✗ Numbered mono section labels (`01 / Work`)
- ✗ Terminal "status line" motif (`● open to work — …`)
- ✗ Monospace as a decorative metadata voice — mono is for code only
- ✗ Left icon-rail sidebar as the admin's primary navigation
- ✗ Uniform full-width stacked sections as the default public layout

## 3. Visual language

### Shape

A **two-tier radius system** replacing the single preset `--radius`:

- `--r-surface: 1rem` — panels, cards, sheets, media
- `--r-control: 0.5rem` — buttons, inputs, chips
- Pills (`9999px`) only for status and counts

Surfaces are generous; controls stay crisp. The contrast between the two is the
shape signature.

### Elevation

Four steps, all derived from a single shadow colour so they hold on every
preset. Elevation encodes **interaction state**, not decoration:

- `--e-0` flat — page ground
- `--e-1` resting surface — cards, panels
- `--e-2` raised — hover, active row
- `--e-3` floating — sheets, popovers, dialogs

Borders become secondary: a surface is defined by its shadow and its fill, with
a hairline border only where two surfaces of the same fill meet.

### Type

- **One family for UI and headings.** Hierarchy comes from size and weight, not
  from a second typeface. This is what the typography presets already vary, so
  it stays preset-driven.
- Fluid display scale via `clamp()`: `--t-display`, `--t-title`, `--t-heading`,
  `--t-body`, `--t-small`, `--t-micro`.
- Display sizes carry tight tracking (`-0.03em`) and short leading (1.05).
  Body text stays at 1.6 and a 68ch measure.

### Space

An 8px-based scale exposed as `--s-1`…`--s-12`, plus three **density modes** on
the page root — `comfortable` (public), `compact` (admin lists), `dense`
(tables). Density is a class on a container, not a per-component prop.

### Motion

- Enter: 220ms, `cubic-bezier(0.32, 0.72, 0, 1)` — a soft decelerate.
- Exit: 140ms, ease-in. Exits are always faster than entrances.
- Overlays spring; content fades and lifts 8px. Nothing slides horizontally.
- Everything collapses to opacity-only under `prefers-reduced-motion`.

## 4. Public site — information architecture

The route list is preserved for link stability. The presentation is new.

**The organising idea: every public page is a sequence of _bands_, and bands
alternate weight.** A band is full-bleed and owns its own background treatment;
content inside is constrained. No two adjacent bands share the same weight, so
the page has rhythm instead of a uniform column.

Three band weights:

- `feature` — large type, generous vertical space, at most one idea
- `content` — the working band; grids and prose live here
- `accent` — a tinted surface used sparingly to close a section or carry a CTA

| Route        | Band sequence                                                                       |
| ------------ | ----------------------------------------------------------------------------------- |
| `/`          | feature (identity) → content (selected work) → content (writing) → accent (contact) |
| `/showcase`  | feature → content (case studies as full-width alternating media/text)               |
| `/projects`  | content (featured) → content (repos, filterable)                                    |
| `/about`     | feature (portrait + story) → content (timeline) → content (stack)                   |
| `/blog`      | content (index, no hero — the list is the point)                                    |
| `/blog/view` | feature (title block) → content (article, TOC rail)                                 |
| `/updates`   | content (feed)                                                                      |
| `/contact`   | feature → content (form + direct channels)                                          |
| `/[...slug]` | feature (page title) → content (CMS sections)                                       |

CMS sections keep all 21 `layout_style` values — that contract is functionality.
Each layout is re-implemented against the new grid and surface language.

## 5. Admin — "Workbench"

**The sidebar rail is gone.** Sixteen modules in a vertical list of icons made
every module look equally important and cost horizontal space on every screen.

Replacement: a **persistent top bar + a Switcher**.

- **Top bar** — the current module's name, its primary action, the focus timer
  chip, the active-learning pill, account. Always one row.
- **Switcher** (`⌘K`, or click the module name) — a single overlay that lists
  every module, grouped, searchable, with recent modules first. Navigation is a
  keystroke, not a permanently-rendered rail.
- **Home is a workbench**, not a dashboard of equal cards: a two-column
  asymmetric grid where the left column is "what needs you now" at full weight
  and the right column is a set of small module gauges.

**One interaction grammar**, unchanged in behaviour from what exists (this is
functionality) but re-skinned:

- list → surface panel with a header row that holds search and view toggles
- create/edit → side sheet for quick entities, full page for rich editors
- destructive → confirm dialog, always
- every mutation → toast

## 6. Build order

1. Foundation — tokens, density modes, motion, primitives.
2. Public bands + the 21 CMS layouts.
3. Admin shell (top bar + Switcher) and the workbench home.
4. The 16 modules, re-skinned against the new patterns, behaviour untouched.

Each phase must leave `npm run test`, `npx tsc --noEmit`, `npm run lint` and
`npm run build` green, and must not regress the contrast test or the per-route
First Load JS.
