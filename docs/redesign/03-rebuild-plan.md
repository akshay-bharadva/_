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
- [x] **Phase 3b-modules module internals** — DONE. Approach corrected: v1
      managers in `src/components/admin/` are **rebuilt as new feature-first
      implementations** (per `02-architecture.md` §2), not restyled in place; the old files
      are deleted at parity. **Tasks done** — new `src/features/tasks/` (tasks-page,
      task-board, task-list, task-form, task-pills, task-meta): single `task-meta.ts`
      source of truth for status/priority labels/icons/colors; all color via tokens
      (`primary`/`destructive`/`chart-2`/`chart-3`) so the 32 presets apply; Ink grammar
      (section-label column headers, status dots, mono counts, dotted rules); edit sheet
      now uses shared `FormSheet` (drawer on mobile); focus-start handler lifted to the
      page (was duplicated in board + tree). Old `tasks-manager.tsx` + `tasks/` deleted.
      **Notes done** — new `src/features/notes/` (notes-page, note-card, note-editor):
      masonry grid + tag rail preserved, Ink touches (heading font, mono metadata,
      section-label rail, destructive tokens, shared EmptyState); per-note pastel colors
      kept (user data, not theme). Old `notes-manager.tsx` + `note-editor.tsx` deleted.
      Also: v1 `border-2 border-dashed` normalized to single-width dashed across
      remaining modules. **All remaining modules rebuilt the same way** — habits,
      life-updates, inventory, navigation, assets, blog-admin, learning, security,
      calendar, finance, content, settings, and finally dashboard + focus. Each lives in
      `src/features/<domain>/` as flat kebab-case files with named exports (page
      components stay default-export), keeps its business logic verbatim (RTK Query hooks
      from the `adminApi` barrel, Zod schemas, Supabase calls, MFA/RLS behavior), and is
      recomposed with the shared admin patterns plus token-only color. Every admin route
      is now a thin wrapper. Notable fixes along the way: the content CMS now passes
      `layout_style` through to `ItemEditorSheet` (v1 never did, leaving its layout-hint
      registry dead), and dead v1 files were dropped rather than ported (LearningDashboard,
      SubjectTopicTree, EventBadge, the calendar day-event drawer/sheet).
      `src/components/admin/` now holds only shared infrastructure: `shared/`,
      `novel-editor/`, and `LoadingSpinner`.
- [~] **Phase 4 cleanup & polish** — IN PROGRESS. **Code splitting done**: the TipTap
      suite is now split once at the `novel-editor` barrel (a `novel-editor-lazy`
      wrapper), so all five editing surfaces — notes, learning, content x2, blog —
      get it on demand without touching their call sites; the dead `getExtensions`
      re-export was dropped from the barrel because it kept the extensions eager.
      Recharts is split at the admin landing route and behind the two finance chart
      tabs. First Load JS: `/admin` 326→90 kB, `/admin/learning` 540→341 kB,
      `/admin/notes` 523→326 kB, `/admin/content` 514→319 kB, `/admin/finance`
      470→355 kB. Remaining: a11y sweep, port/expand admin tests, README.
      `/blog/view` (539 kB, react-markdown + prism) is the last heavy route.

## Current build/test state (as of latest commit)

- `npm run build` (static export) green; 31 routes, public shared JS ~88 kB
  (was ~292 kB under Pages Router — admin bundle no longer loaded on public pages).
  Heaviest admin route is now `/admin/tasks` at 344 kB; no admin route exceeds 355 kB.
- `npm run test` 176 passing (11 files); `npx tsc --noEmit` clean.
- Pages Router fully removed; app is App-Router-only; dev server boots, pages render 200.
