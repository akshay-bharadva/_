# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Personal Portfolio + Personal OS — Project Guardrails (read this first, every task)

This repository is a personal portfolio website and headless CMS / “Personal OS” built with Next.js 14 App Router. It supports a zero-config static portfolio mode using fallback data and a dynamic CMS/admin mode backed by Supabase. The site is deployed as a static export to GitHub Pages, with public portfolio/content routes and an authenticated Personal OS for managing tasks, learning, finance, content, notes, whiteboards, and other personal data.

**This file is the contract. Every change, in any component, must stay consistent with the architecture and rules below. If a task would require breaking a rule here, STOP and surface it instead of working around it.**

---

## Architecture: components and their boundaries

- **`src/app/`** — Owns route composition, layouts, route groups, and static-export-compatible page entry points. Public interactive pages should use thin `page.tsx` wrappers around feature components. Must not contain reusable domain logic that belongs in `src/features/` or shared UI logic that belongs elsewhere.

- **`src/app/(public)/`** — Owns public portfolio/content routes: home, about, projects, showcase, contact, updates, blog, CMS catch-all pages, and related public chrome. Must not contain admin-only functionality or bypass the public data layer.

- **`src/app/admin/(auth)/`** — Owns unauthenticated authentication routes such as login, signup, MFA setup, and MFA challenge. Must not implement the protected admin shell or duplicate the admin authorization boundary.

- **`src/app/admin/(protected)/`** — Owns protected admin route composition. Its layout is the single route-level boundary for the admin shell and auth guard. Must not duplicate guard logic across individual module pages.

- **`src/features/`** — Owns feature-first UI and feature-specific behavior, for public and admin surfaces alike. Public/shared: home, about, contact, blog, updates, sections, github, admin-auth, admin-shell. Admin modules: dashboard, tasks, habits, learning, calendar, notes, whiteboard, finance, inventory, content, blog-admin, life-updates, navigation, assets, settings, security, focus. Each is a flat directory of kebab-case files with named exports (page components stay default-export). Must not reach into unrelated feature internals; cross-feature behavior should use documented shared contracts.

- **`src/features/admin-shell/`** — Owns the admin shell and client-side admin guard integration. `use-admin-guard.ts` is the single client-side UX guard invoked by the protected admin layout. Must not be treated as the security boundary; database/RLS enforcement remains authoritative. The shell is a top bar over a full-width main, and module navigation is the **app launcher** in that bar. A **sidebar rail is a supported alternative**, chosen per device via `use-shell-layout.ts` and stored in `localStorage` — this went round three times (rail → floating pill bar → rail → launcher) with each answer defended as correct, which is the sign there is no single correct one: a rail is worth its 15rem on a wide monitor and costs a sixth of a laptop screen. Both arrangements read `NAV_GROUPS` and `isActiveNavHref`, so they cannot disagree about what exists or which module is active. Do not add a _third_ navigation overlay — the launcher carries its own search, and `GlobalCommandPalette` is the keyboard route to the same list — and do not hand-write a module list that can drift from the nav config.

- **`src/features/whiteboard/`** — Owns the Excalidraw-backed whiteboard experience, scene serialization/deserialization, theme synchronization, and whiteboard-specific UI. Must not import `@excalidraw/excalidraw` at module scope. Excalidraw must remain client-only and code-split through `excalidraw-canvas-lazy`.

- **`src/components/layout/`** — Owns shared public/admin chrome and structural layout components. Must not contain feature-specific business logic.

- **`src/components/layout/public-chrome.tsx`** — Owns the shared public chrome composition (site header, footer, maintenance/lockdown gate, noindex helper). Must not become a container for page-specific content or data fetching.

- **`src/components/ui/`** — Owns reusable Shadcn/Radix UI primitives. Must remain generic and theme-token based; feature behavior belongs in `src/features/` or the relevant feature/module component. `Input` and `Textarea` accept `null` for `value` and render it as empty — most columns behind them are nullable and react-hook-form passes the row value straight through. `undefined` is deliberately left alone so uncontrolled usage still works.

- **`src/components/admin/`** — Owns shared admin infrastructure only: `shared/` (PageHeader, ManagerWrapper, StatCard, EmptyState, LoadingState, SearchInput, FormSheet, MobileBottomNav), `novel-editor/` (the TipTap editor and its lazy wrapper), and `LoadingSpinner`. Admin module internals live in `src/features/<domain>/` — do not reintroduce per-module directories here.

- **`src/components/admin/shared/LoadingState.tsx`** — Owns the busy indicator for admin surfaces, with `page`/`section`/`inline` variants and a `role="status"` region. Modules must not hand-roll a spinner; `LoadingSpinner` is a thin delegate kept for `next/dynamic` fallbacks. A `<Loader2>` inside a submit button is a different thing and stays inline at the call site.

- **`src/store/api/publicApi.ts`** — Owns public RTK Query data access: ten public endpoints (site identity, nav links, published posts, post by slug, view increment, published life updates, sections by path, GitHub repos, contact submit, lockdown status) over `fakeBaseQuery()` with direct Supabase calls. Every endpoint must keep its `if (!supabase)` fallback branch. Must not contain admin-only mutations or authorization assumptions.

- **`src/store/api/adminApi.ts` and `src/store/api/admin/`** — Own admin RTK Query endpoints. `adminApi.ts` is the barrel; the shared base slice is `admin/baseApi.ts`, and feature-specific endpoint slices are injected into it. Always import admin hooks from the barrel, never directly from an individual feature slice — the barrel import is what registers the injections. Must preserve tag-based cache invalidation.

- **`src/store/api/admin/query-helpers.ts`** — Owns typed standard Supabase CRUD `queryFn` factories. Standard CRUD should use these helpers; bespoke joins, RPCs, and storage side effects may use hand-written query functions.

- **`src/store/slices/`** — Owns local client state such as the focus timer and learning sessions. Must not become a replacement for server-backed RTK Query state.

- **`src/lib/`** — Owns shared configuration, constants, utilities, fallback data, theme logic, schemas, and other domain-independent infrastructure. Must remain the single source for shared business contracts rather than accumulating feature-local duplicates.

- **`src/lib/schemas.ts`** — Owns the canonical Zod validation schemas, the shared fragments they are built from (`boundedRequiredString`, `boundedOptionalString`, `money`, `optionalMoney`, `optionalInt`, `hexColor`, `slug`, `tagList`), and the `LIMITS` / `MONEY_MAX_*` ceilings. Must remain the source of truth for validated form/domain shapes; do not create component-local schema variants when an existing schema applies — use `.pick()` when a form only collects part of an entity. Bounds must track `db/schema.sql`: money ceilings mirror the NUMERIC column widths, and ranges mirror the CHECK constraints.

- **`src/lib/site-identity-defaults.ts`** — Owns the canonical empty `site_identity` shape. Deliberately free of any Zod import: it is reached from the public data path, and `publicApi` is on every route. `schemas.ts` re-exports it as `siteSettingsDefaultValues` with the type annotation that checks it against the schema.

- **`src/lib/site-identity.ts`** — Owns `normalizeSiteContent`, applied in `publicApi.getSiteIdentity`. `profile_data`/`social_links`/`footer_data` are unconstrained JSONB, so this is the single place that decides what a missing key means. Public renderers must be able to trust the shape `SiteContent` declares; do not add defensive optional chaining in the renderers instead.

- **`src/components/ui/markdown.tsx` and `rich-markdown.tsx`** — Two renderers, split on cost. `Markdown` is short-form (taglines, bios, CMS blurbs) and carries only `remark-gfm`. `RichMarkdown` is long-form — raw HTML, sanitization, Prism, heading ids — for anything authored in the editor. `rehype-prism-plus` is ~290 kB, so `RichMarkdown` must only be reached through a `next/dynamic` boundary; importing it directly took `/admin/notes` from 12 kB to 301 kB first load. Its sanitize schema allows `className` on `pre`/`code`/`span`/`div` because sanitization runs _after_ highlighting and would otherwise strip the classes Prism just added.

- **`src/lib/cn.ts`** — Owns `cn`. Kept separate from `utils.ts`, which re-exports `date-utils` (and therefore date-fns); the package is not marked `sideEffects: false`, so importing `cn` from `utils.ts` pulls date-fns into the chunk. Leaf components on code-split routes should import from here. `utils.ts` re-exports it, so existing call sites are fine.

- **`src/hooks/use-column-count.ts`** — Owns ordered masonry: `useColumnCount` plus `distributeColumns`, which deals items round-robin into one bucket per column. Used by `/updates` and Notes. CSS `columns-*` fills each column to the bottom before starting the next, so a sorted list reads down the whole left column before reaching the second item, and cards split across the column break; CSS Grid fixes the order but leaves a hole under every short card. Any new masonry surface uses this rather than reintroducing either.

- **`src/lib/fallback-data.ts`** — Owns mock/fallback data used when Supabase is not configured. Must preserve zero-config static mode and remain compatible with the same contracts used by dynamic data.

- **`src/types/index.ts`** — Owns central TypeScript interfaces and shared application types. Must not be duplicated with incompatible local interfaces.

- **`src/supabase/client.ts`** — Owns Supabase client initialization. Must not contain hard-coded credentials or application-specific business logic.

- **`db/migrations/`** — Owns the ordered, additive migrations that bring an existing database up to `db/schema.sql`. Every file is guarded (`IF NOT EXISTS` / `DROP ... IF EXISTS`) and safe to re-run. A schema change ships as **both** a migration and the matching edit to `schema.sql`, so a fresh install and an existing one land in the same place. `db/reset-*.sql` are destructive rebuild-from-scratch alternatives and keep nothing.

- **`db/schema.sql`** — Owns the authoritative database schema and RLS policies. Database-level authorization must remain stronger than client-side assumptions.

- **`src/styles/globals.css`** — Owns the v3 "Surface" design system: the shape (`--r-surface`/`--r-control`), fluid type (`--t-*`), measure (`--w-*`), elevation (`--e-1..3`) and motion (`--m-enter`/`--m-exit`) tokens; the `.band-*`, `.surface*` and `.t-*` utility classes; and prose styles. **Spacing is Tailwind's scale** — a parallel `--s-*` scale existed and was removed, because `--s-4` was literally `1rem` and two spacing vocabularies is one too many. **Colour must never appear here** — the presets own it and are contrast-gated, so a raw hex would sit outside that gate and would not move when the visitor switches theme. Guarded by `src/styles/design-system.test.ts`.

- **`src/components/layout/band.tsx` and `surface.tsx`** — Own the two v3 layout primitives. A public page is a sequence of full-bleed `Band`s whose weights alternate (`feature`/`content`/`accent`); a `Surface` is a fill plus an elevation, where elevation encodes interaction state rather than decoration. Compose these rather than re-deriving padded containers and bordered cards per page.

- **`src/styles/themes.css`** — Owns the 52 theme presets. It is intentionally raw/unlayered so runtime-applied theme classes are preserved. Do not move runtime theme definitions into a tree-shakeable Tailwind layer. The preset list must stay in sync with `THEME_PRESETS` in `src/lib/constants.ts`.

- **`src/styles/typography.css`** — Owns the 12 typography presets and the shared font stacks. Same raw/unlayered constraint as `themes.css`; imported after it, so it wins at equal specificity. Must stay in sync with `TYPOGRAPHY_PRESETS` in `src/lib/constants.ts`. (`themes.css` still contains a superseded legacy `.typo-*` block — edit typography presets here, not there.)

- **`scripts/copy-excalidraw-assets.mjs`** — Owns copying the required Excalidraw fonts into the generated, gitignored public asset directory. Fonts are copied at `predev`/`prebuild` time and must not be committed.

- **`.github/workflows/`** — Owns CI/deployment automation. Tests must run before the production build in the deployment workflow.

---

## Shared contracts

The following are cross-component contracts and must have one source of truth:

- **Zod schemas** — `src/lib/schemas.ts` is authoritative for validated data shapes. React Hook Form integrations should use `@hookform/resolvers`.
- **TypeScript interfaces** — `src/types/index.ts` is authoritative for shared application types. A field must be optional/nullable here whenever its column is nullable in `db/schema.sql`, even if the form always supplies it. Typing a nullable column as required does not make it non-null; it only moves the failure from the compiler to the user's screen.
- **Supabase schema and RLS** — `db/schema.sql` is authoritative for database structure and authorization policies. Zod bounds must not be looser than the column: a value the form accepts and Postgres rejects surfaces as an opaque write failure.
- **Per-entity display fallbacks** — when a nullable column needs a default for display, that decision lives in one helper next to the feature (`inventory/item-value.ts`, `habits/habit-color.ts`), not re-derived at each call site. Prefer `??` over `||` for anything where `0` or `""` is a real value.
- **RTK Query APIs** — public data goes through `publicApi`; admin data goes through the admin API barrel and injected feature endpoints.
- **Fallback/dynamic data contract** — fallback data must satisfy the same public/admin-facing shapes expected by dynamic data.
- **Theme tokens** — styling must use semantic tokens such as `bg-card`, `text-primary`, and `border-border`, not hard-coded colors that bypass the theme system.
- **Whiteboard scene format** — `scene-io.ts` is authoritative for mapping Excalidraw scenes to the `elements`, `app_state`, and `files` database columns.
- **Admin authorization** — database RLS and Supabase Auth/MFA are authoritative. Client guards are UX protections only.
- **Static export compatibility** — every route must work with `output: "export"`; do not introduce server-only runtime dependencies that require a persistent Next.js server.

---

## Cross-cutting rules (non-negotiable)

- No hard-coded secrets — credentials, keys, URLs, bucket names, and deployment configuration come from environment variables/config.
- Preserve zero-config mode — when Supabase is not configured, public functionality must continue to work using `src/lib/fallback-data.ts`.
- Static export is mandatory — changes must remain compatible with `output: "export"` and GitHub Pages deployment.
- Tests travel with code — every behavior change ships with an appropriate Vitest/React Testing Library test.
- No silent scope creep — a change scoped to one component must not alter another component's behavior without explicitly surfacing the cross-component impact.
- Determinism where it matters — fallback data, serialization, validation, theme parsing, and other reproducible behavior must remain deterministic.
- Database security is authoritative — never rely on client-side guards as a substitute for Supabase RLS, MFA, or database constraints.
- Preserve mandatory MFA — admin write access requires the database-enforced authenticated/MFA model already defined in `db/schema.sql`.
- Preserve single-admin enforcement — do not weaken or bypass the `block_additional_signups` database constraint.
- Never weaken RLS to make a client feature work — fix the client/data contract instead.
- Do not duplicate auth logic — `use-admin-guard.ts` is invoked once by the protected admin layout; individual pages must not recreate the old per-page guard/HOC architecture.
- Supabase calls remain client-compatible — interactive Supabase-backed experiences must remain compatible with the static-export architecture.
- Never top-level import Excalidraw — `@excalidraw/excalidraw` must only be reached through the lazy client-only loader.
- Preserve Excalidraw asset behavior — required fonts are generated/copy-installed, not committed; `window.EXCALIDRAW_ASSET_PATH` must be configured before the Excalidraw module is evaluated.
- Preserve whiteboard persistence semantics — scene data remains split across `elements`, `app_state`, and `files`; session-only app state such as selection, collaborators, and theme must not be persisted.
- Treat whiteboard previews as untrusted data — gallery previews remain SVG data URLs rendered as images rather than executable markup.
- Theme through tokens — use semantic theme classes and tokens so all 52 presets and custom themes continue to work. `chart-2` is the success accent and `chart-3` the warning accent; literal palette classes such as `text-green-600` or `bg-amber-500` do not move with the presets and must not be reintroduced.
- **Read `docs/redesign/v3-implementation-log.md` before rebuilding a module.** It records what every rebuilt module became and why, the patterns to reuse (derived state, archiving, one control at every width, RPCs for atomic writes), and the traps already paid for. **Append an entry to it when a module is finished** — a module is not done until its entry exists.
- **The v3 identity is "Surface" — see `docs/redesign/v3-design-vision.md`.** Hierarchy comes from elevation, size and space, not from labels and lines. Use `shadow-e1/e2/e3` rather than Tailwind's default shadow scale, `rounded-surface` for panels and `rounded-control` for controls, and Tailwind's spacing scale. A surface is a fill plus a shadow: do not give it both a border and an elevation.
- **The v2 "Precision Instrument" grammar is retired and must not return**: graph-paper grounds, dotted rules as separators, numbered mono section labels (`01 / Work`), the terminal status line, monospace as a decorative metadata voice (mono is for code, and for the terminal status-panel variant whose whole purpose is to look like a terminal), and a left icon-rail as the admin's _only_ navigation. (The rail itself is no longer retired — it is one of two arrangements the owner can choose, and the launcher is always available beside it. What is retired is the rail being the sole way to reach a module.) `src/styles/design-system.test.ts` fails the build if any of these reappear.
- Anything that offers a plain light/dark choice must pass a real preset class (`LIGHT_THEME`/`DARK_THEME`). Passing `"light"`, `"dark"` or `"system"` to next-themes strips the active `theme-*` class and leaves the app with no tokens at all.
- The `dark` class on `<html>` is derived by `applyTheme` from the resolved `--background` lightness, which is what makes `dark:` variants work at all. Do not set it from a preset name list, and do not assume a visitor-facing OS toggle exists — `enableSystem` is `false`.
- Preserve WCAG AA contrast — theme changes must satisfy the existing contrast test in `src/lib/theme-contrast.test.ts`.
- Every admin form that persists data must validate against a `src/lib/schemas.ts` schema before the write, including editors built on plain `useState` rather than react-hook-form.
- Components must survive the data the database can actually return: absent, empty, zero, and far longer than expected. Truncation on a flex child needs `min-w-0` to engage, and clamping does not constrain a single unbroken token — add `break-words`.
- Never interpolate user-supplied text into a storage key without a sanitiser that rejects traversal segments — see `assets/asset-utils.ts`.
- Preserve reduced-motion behavior — the global `MotionConfig reducedMotion="user"` contract must remain intact. Do not hide meaningful content behind JavaScript-only animation.
- Prefer `whileInView` with `viewport={{ once: true }}` for scroll-triggered Framer Motion effects.
- Toasts use Sonner exclusively — do not introduce another toast/notification system.
- Avoid unnecessary shared-bundle growth — particularly for large client-only libraries such as Excalidraw. `publicApi` is loaded on every route, so anything it imports lands in every page's first load; keep Zod and other form-layer dependencies out of that path. Check the per-route First Load JS in `npm run build` output after touching a shared module.
- The package is **not** marked `sideEffects: false`, and marking it so is not a safe drive-by: `src/store/api/adminApi.ts` re-exports modules whose `injectEndpoints()` calls are genuine module-scope side effects, so tree-shaking one would silently unregister admin endpoints at runtime without failing a test.
- Keep admin API imports consistent — consumers must import admin hooks from the API barrel, not feature endpoint implementation files.
- Use existing query helpers for standard CRUD — bespoke query functions are reserved for operations that genuinely require joins, RPCs, storage effects, or other non-standard behavior.
- Report architecture conflicts — if a requested change requires violating one of these rules, stop and surface the conflict rather than introducing a workaround.

---

## Stack conventions

- **Language / runtime:** TypeScript / Node.js / Next.js 14
- **Framework:** Next.js 14 App Router with `output: "export"`
- **UI:** React + Tailwind CSS + Shadcn/Radix primitives
- **State:** Redux Toolkit + RTK Query
- **Backend:** Supabase Auth, Postgres, RLS, and Storage
- **Validation:** Zod + React Hook Form + `@hookform/resolvers`
- **Animation:** Framer Motion
- **Whiteboard:** Excalidraw, client-only and dynamically imported
- **Testing:** Vitest + React Testing Library + jsdom
- **Formatting:** Prettier
- **Linting:** ESLint
- **Install:** `npm install`
- **Development:** `npm run dev` — port `8889`
- **Production build:** `npm run build` — generates static export in `./out/`
- **Test:** `npm run test`; use `npx vitest run <path>` for a specific test file
- **Watch tests:** `npm run test:watch`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Path alias:** `@/*` maps to `./src/*`
- **Style:** Follow existing patterns in the file being edited and use semantic theme tokens rather than hard-coded visual values.

### Required dynamic-mode environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_BUCKET_NAME
NEXT_PUBLIC_SITE_URL
```

`NEXT_PUBLIC_BUCKET_NAME` defaults to `assets` when applicable. `NEXT_PUBLIC_SITE_URL` is required for production builds.

---

## How agents work here

1. **Read this file first.** Treat it as the repository contract before inspecting or editing code.
2. **Inspect the owning component.** Identify the route, feature, API slice, schema, type, or shared primitive that owns the requested behavior.
3. **Plan before editing anything multi-file.** Confirm the change fits the architecture and identify every shared contract affected.
4. **Stay in the owning component.** Do not reach into another component's internals to avoid establishing a new dependency.
5. **Use existing contracts.** Reuse schemas, types, query helpers, theme tokens, API barrels, and shared primitives before creating new abstractions.
6. **Preserve both modes.** For data-backed changes, verify behavior with Supabase configured and with fallback/mock data when configuration is absent.
7. **Protect the static-export boundary.** Do not introduce assumptions that require a persistent server, server-side runtime APIs, or dynamic server rendering.
8. **Protect the security boundary.** Treat RLS, MFA, and database constraints as authoritative; client-side guards are not authorization.
9. **Run focused tests first.** Add/update tests next to the affected code, then run the relevant test file(s).
10. **Run repository validation before completion.** At minimum, run tests relevant to the change and lint; for changes affecting build/runtime behavior, run `npm run build`.
11. **Report obstacles.** If a requirement conflicts with this contract, explain the conflict and stop rather than weakening an architectural rule.
12. **Surface cross-component impact.** If a task genuinely requires a shared-contract or cross-component change, state the impact explicitly before making it.
13. **Keep the diff narrow.** Do not refactor unrelated code, rename unrelated APIs, or “clean up” neighboring components without a task requirement.
14. **Review security-sensitive changes explicitly.** Auth, RLS, MFA, storage access, content sanitization, and admin writes require particular scrutiny before considering the task complete.

---

## Model routing (cost discipline)

- **Local lane (Ollama)** — repository exploration, implementation volume, routine refactors, tests, formatting, and documentation.
- **Cloud lane (Claude/Pro)** — architecture analysis, design decisions, security review, difficult debugging, and final review.
- Never set `ANTHROPIC_API_KEY` in the cloud lane; setting it switches the workflow to metered billing.
- Automated reviewer/security agents are the merge gate. Optimize changes for deterministic validation and machine review.
