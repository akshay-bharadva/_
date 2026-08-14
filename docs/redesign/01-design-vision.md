# FolioKit v2 — Design Vision

> Ground rule: the existing app is a **functional specification only**. Nothing below is
> derived from its current look, layout, navigation, or component structure.

## 1. Brand concept — "Precision Instrument"

The owner is an AI engineer who ships production LLM systems and has formal security
training. The identity should read as _engineered_, not decorated: the confidence of a
well-built tool. Editorial typography for the narrative, terminal precision for the
metadata.

Voice anchor (from the owner's own copy): _"Most AI projects never leave a Jupyter
notebook. I build the ones that do."_ The design's job is to make that claim credible
before a single word is read.

## 2. Visual language

### Color

- **Light**: warm paper (`oklch(0.985 0.004 95)`), near-black ink. Not sterile white.
- **Dark**: deep neutral charcoal (`oklch(0.16 0.005 270)`), soft off-white text. Not blue-black.
- **Accent**: a single electric indigo (`oklch(0.55 0.22 275)` light / `oklch(0.72 0.18 275)` dark),
  used only for interaction and emphasis — links, focus rings, active states, the status dot.
- **Semantic**: success / warning / danger tuned for AA on both surfaces (finance, habits,
  and task views need them constantly).
- All colors are tokens; the existing **theme-preset capability is preserved** as
  data-driven token sets layered on top of the new base scale.

### Typography

- **Display / headings**: Space Grotesk — geometric, technical character.
- **Body / UI**: Inter — invisible, legible.
- **Mono / metadata**: JetBrains Mono — dates, tags, stats, code, terminal motifs.
- Fluid scale via `clamp()`; readable measure (`65ch`) on prose; self-hosted via `next/font`.

### Texture & motifs

- Fine graph-paper grid in hero regions, barely-there (2–3% opacity), nodding to
  engineering paper.
- A recurring **status line** motif: `● open to work — Toronto, ON` in mono, like a
  terminal prompt. Appears in the hero, footer, and contact page.
- Dotted horizontal rules instead of solid borders for section separation.
- Numbered section labels in mono (`01 / Work`) to give long pages a table-of-contents feel.

### Motion

- Purposeful only: 150–250ms ease-out; staggered reveal on scroll (IntersectionObserver);
  spring physics reserved for the command palette and drawers.
- `prefers-reduced-motion` collapses everything to opacity-only or none (existing a11y
  behavior is a requirement, not an option).

## 3. Public site — information architecture

Routes are preserved for link stability; the experience around them is new.

| Route                       | Role in the new IA                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | Narrative landing: hero + status line → proof strip (production metrics) → featured case studies → selected repos → latest writing → updates teaser → contact CTA |
| `/showcase`                 | Case studies — long-form proof of shipped work ("Hey Ami!", Complexity Matrix)                                                                                    |
| `/projects`                 | GitHub repos (live API) + featured projects, filterable                                                                                                           |
| `/about`                    | Story + experience timeline + stack + education, single scrolling narrative                                                                                       |
| `/blog`, `/blog/view?slug=` | Editorial reading experience: TOC rail, reading progress, copyable code blocks                                                                                    |
| `/updates`                  | Timeline of life updates (pinned first), category-filtered                                                                                                        |
| `/contact`                  | Form + services + availability badge                                                                                                                              |
| `/[...slug]`                | CMS-defined dynamic pages, rendered through the same section system                                                                                               |

Sitewide: sticky minimal header that recedes on scroll, ⌘K command palette for
navigation + theme, skip link, footer with status line.

## 4. Admin — "Personal OS" shell

One consistent application shell replacing per-page ad-hoc layouts:

- **Left sidebar**, grouped: _Overview_ → _Content_ (pages, blog, updates, navigation,
  assets) → _Life_ (tasks, habits, learning, calendar, notes, finance, inventory) →
  _System_ (settings, security). Collapsible to icon rail; drawer on mobile.
- **Top bar**: breadcrumb, global search / command palette, focus-timer chip (persistent
  across pages), theme toggle, account menu.
- **Interaction grammar** (identical across all 15+ modules):
  - list views = filterable data tables or card grids with empty states and skeletons
  - create/edit = side sheets (drawer) for quick entities, full pages for rich editors
    (blog, CMS sections)
  - destructive actions = confirm dialog, always
  - every mutation gives toast feedback (sonner)
- **Dashboard**: widget grid summarizing each life module, each widget deep-linking to
  its module.

## 5. Experience principles

1. **Content-first**: chrome recedes; the owner's work and writing carry the page.
2. **One grammar**: a pattern learned once (table → sheet → toast) applies everywhere.
3. **Fast by default**: static export, route-level code splitting, heavy editors and
   charts dynamically imported, zero JS for pure content where possible.
4. **Accessible by construction**: semantic landmarks, focus management in overlays,
   AA contrast enforced by token tests, reduced-motion paths.
5. **Intentional at every width**: mobile-first; the admin shell reflows to bottom-sheet
   patterns on small screens rather than shrinking desktop UI.
