# FolioKit v2 — Rebuild Plan

Branch: `redesign/v2`. Every phase boundary must pass `npm run test` + `npm run build`.

## Ground rules
- The DB schema, RLS, RPCs, store layer (publicApi/adminApi/slices), Zod schemas, types,
  and lib utilities are **ported, not redesigned** — they are the business logic.
- Everything the user sees — routes, layouts, components, navigation, styling — is
  **rebuilt from scratch** per `01-design-vision.md`.
- App Router and Pages Router coexist during migration; a route moves to `src/app/` and its
  `src/pages/` counterpart is deleted in the same step (collisions fail the build).
- Radix-based `components/ui` primitives are treated as commodity infrastructure: kept,
  but re-skinned entirely through the new token system.

## Phase 1 — Foundation
1. Split `globals.css`: theme presets (30) + typography presets → `styles/themes.css`
   (ported verbatim — contract for the preset capability + contrast test); new
   `styles/globals.css` with the v2 base token scale, prose styles, utilities.
2. Two new presets embodying the v2 identity: `theme-ink-light` (default) and
   `theme-ink-dark`; registered in `THEME_PRESETS`, validated by the contrast test.
3. Fonts via `next/font`: Space Grotesk (heading), Inter (body), JetBrains Mono (mono).
4. `src/app/layout.tsx` root layout + `src/app/providers.tsx` (Redux, next-themes,
   MotionConfig, ConfirmDialog, Toaster, theme sync, command palette mount).
5. Shared patterns: PageHeader, EmptyState, StatCard, DataTable scaffold, Section shell.

## Phase 2 — Public site
Route-by-route in `src/app/(public)/` with new header/footer/command palette:
home → about → showcase → projects → blog (+view) → updates → contact → `[...slug]`
(generateStaticParams) → not-found. Delete matching `src/pages/*` files as each lands.
New section-renderer with the same `layout_style` contract (21 layouts).

## Phase 3 — Admin
1. `(auth)` routes: login, signup, setup-mfa, mfa-challenge (same AAL flow).
2. `src/app/admin/layout.tsx`: guard (replaces withAdminPage HOC) + Personal OS shell
   (sidebar groups, topbar, focus timer, learning pill, quick add, ⌘K).
3. Dashboard, then modules in dependency order: tasks, notes, habits, learning, calendar,
   finance, inventory, blog, content CMS, updates, navigation, assets, settings, security.

## Phase 4 — Cleanup & polish
- Delete `src/pages/`, orphaned components; port/adapt the 11 test files; a11y pass
  (landmarks, focus, reduced motion); bundle audit (dynamic imports for TipTap,
  FullCalendar, Recharts, QR); docs update (CLAUDE.md, README).

## Status log
- [x] Functional specs extracted (00a public, 00b admin, 00c data)
- [x] Design vision + architecture docs
- [x] **Phase 1 foundation** — themes.css split (32 presets, contrast-gated), Ink/Ink-Noir
  default identity, App Router root layout + provider stack, Space Grotesk headings.
- [x] **Phase 2 public site** — new chrome (site-header, footer, maintenance gate),
  home (hero + 3 status-panel designs), about, showcase, projects (+ GitHub grid),
  contact (validated form), updates (scrapbook + timeline), blog list + post view
  (preserved markdown/sanitize pipeline, new TOC + reading progress), `[...slug]` CMS
  pages, App Router 404. New 21-layout section renderer with registry-coverage test.
- [x] **Phase 3a admin auth + router migration** — new login/signup/setup-mfa/mfa-challenge
  screens (AAL routing contract preserved verbatim); all 15 admin routes ported to the
  App Router `(protected)` group; Pages Router fully deleted; admin chrome converted
  next/router→next/navigation; build workarounds reverted (App-Router-only, clean).
- [x] **Phase 3b-shell admin shell** — DONE. New `src/features/admin-shell/`: grouped
  collapsible sidebar (Overview/Content/Life/System), topbar (breadcrumb, command-palette
  trigger, live learning pill, quick-add, account menu), `use-admin-guard` (App Router
  successor to `withAdminPage`), `admin-shell` composition. `(protected)/layout.tsx` guards
  once + wraps all 15 routes; pages simplified to render managers directly. Deleted the v1
  `withAdminPage`/`AdminLayout`/`Sidebar` and the dead `/admin/test` nav link. CLAUDE.md
  updated for the App Router. Runtime-verified: all public routes + admin/login boot 200
  with no runtime errors.
- [ ] **Phase 3b-modules module internals** — REMAINING. The ~15 module managers
  (`src/components/admin/*`) still carry v1 internal design. They are token-styled, so they
  inherit the new Ink theme and read coherently inside the new shell, but their layouts
  (dashboard widgets, kanban, finance tabs, editors) haven't been bespoke-redesigned. This
  is the long tail: restyle per-module using the shared patterns.
- [ ] **Phase 4 cleanup & polish** — a11y sweep, dynamic-import remaining heavy deps
  (Recharts on dashboard/finance, TipTap suites — calendar + blog editor already dynamic),
  port/expand admin tests, README.

## Current build/test state (as of latest commit)
- `npm run build` (static export) green, cold + warm; 29 routes, public shared JS ~88 kB
  (was ~292 kB under Pages Router — admin bundle no longer loaded on public pages).
- `npm run test` 176 passing; `npx tsc --noEmit` clean.
- Pages Router fully removed; app is App-Router-only; dev server boots, pages render 200.
