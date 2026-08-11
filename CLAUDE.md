# CLAUDE.md

All code produced in this repository will be reviewed and validated by an automated agent such as OpenAI Codex or equivalent.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio website + headless CMS ("Personal OS") built with Next.js 14 (App Router). Supports two modes: static portfolio (zero-config with mock data) and dynamic CMS with Supabase backend. Deployed as a static export (`output: "export"`) to GitHub Pages.

> **v2 redesign (branch `fable`):** the app was rebuilt from scratch with a new
> visual identity ("Precision Instrument" — Ink theme) and migrated Pages Router → App
> Router. The data layer, Zod schemas, DB schema, and RTK store were preserved as business
> logic. See `docs/redesign/` for the functional specs, design vision, architecture, and
> phase plan. Every route is a static-export client experience; Supabase is called from the
> client, so interactive pages are client components under thin server `page.tsx` wrappers.

## Commands

| Command                 | Purpose                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Dev server on port 8889                                                                                                |
| `npm run build`         | Production build + static export to `./out/`                                                                           |
| `npm run lint`          | ESLint                                                                                                                 |
| `npm run test`          | Vitest (run once); `npm run test:watch` for watch mode                                                                 |
| `npx vitest run <path>` | Run a single test file, e.g. `npx vitest run src/lib/theme-contrast.test.ts`; add `-t "<name>"` to filter by test name |
| `npm run format`        | Prettier                                                                                                               |

## Architecture

### Dual-Mode Data Layer

All API calls check if Supabase is configured. If not, mock data from `src/lib/fallback-data.ts` is returned. This enables zero-config static deployment without a database.

### State Management (Redux Toolkit + RTK Query)

- **`src/store/api/publicApi.ts`** — 6 queries for public content (no auth). Uses `fakeBaseQuery()` with direct Supabase calls.
- **`src/store/api/adminApi.ts`** — barrel for the admin API. Endpoints live in per-feature slices under `src/store/api/admin/` (tasks, finance, learning, etc.) injected into a shared base via `injectEndpoints`. Always import hooks from the barrel, never from a feature file. Tag-based cache invalidation.
- **`src/store/api/admin/query-helpers.ts`** — typed `queryFn` factories for standard Supabase CRUD (getAll/insert/update/save/delete); bespoke endpoints (joins, storage side-effects, RPCs) keep hand-written queryFns.
- **`src/store/slices/`** — Local state for focus timer and learning sessions.

### Routing

- **App Router** (`src/app/`), static export.
- **Public** — route group `src/app/(public)/` with shared chrome (`components/layout/public-chrome`): `/`, `/about`, `/projects`, `/showcase`, `/contact`, `/updates`, `/blog`, `/blog/view` (`?slug=`, static-export-friendly), `/[...slug]` (CMS catch-all via `generateStaticParams`). Plus `src/app/not-found.tsx`.
- **Admin** — `src/app/admin/`: `(auth)` group (login, signup, setup-mfa, mfa-challenge) with no guard; `(protected)` group whose `layout.tsx` runs the guard + Personal OS shell and wraps dashboard + 14 modules (tasks, habits, learning, calendar, notes, finance, inventory, content, blog, updates/life-updates, navigation, assets, settings, security).
- **Auth guard**: `src/features/admin-shell/use-admin-guard.ts`, invoked once by the `(protected)` layout (replaces the old per-page `withAdminPage` HOC). `src/hooks/use-auth-guard.ts` now only exports the read-only `useSupabaseSession` for chrome.
- **Feature-first UI**: page-specific logic lives in `src/features/<domain>/` (home, about, contact, blog, updates, sections, github, admin-auth, admin-shell); `src/components/layout/` holds shared chrome; `src/components/ui/` the primitives. Admin _module internals_ still live in `src/components/admin/` (v1 components, token-styled so they inherit the new theme).

### Validation

Zod schemas in `src/lib/schemas.ts` (50+ schemas) are used with React Hook Form via `@hookform/resolvers`. Types are inferred from schemas with `z.infer<>`.

### Styling

- Tailwind CSS with token-based theming. The base token scale + prose/motif styles live in `src/styles/globals.css`; the **32 theme presets** (v2 default `theme-ink-light`/`theme-ink-dark`) + 8 typography presets live in `src/styles/themes.css` (raw CSS, deliberately unlayered so Tailwind can't tree-shake runtime-applied classes). Labeled registry in `src/lib/constants.ts` (`THEME_PRESETS`); application logic in `src/lib/themes.ts` + `src/hooks/use-theme-sync.ts`; WCAG AA contrast gate in `src/lib/theme-contrast.test.ts` (parses `themes.css`). Toasts use sonner exclusively.
- Design language: Space Grotesk headings (`font-heading`), Inter body, JetBrains Mono metadata (`font-mono`); motif helper classes `bg-graph-paper`, `rule-dotted`, `status-line`, `section-label`. Style with token classes only (`bg-card`, `text-primary`, `border-border`…) so all presets keep working.
- UI primitives from Shadcn/Radix in `src/components/ui/`.
- Animations via Framer Motion (`MotionConfig reducedMotion="user"` globally; use `whileInView` + `viewport={{ once: true }}`, never hide content behind JS-only animation).

### Key Directories

- `src/app/` — App Router route tree (`(public)`, `admin/(auth)`, `admin/(protected)`), root `layout.tsx` + `providers.tsx`.
- `src/features/` — feature-first UI (home, about, contact, blog, updates, sections, github, admin-auth, admin-shell).
- `src/components/layout/` — shared public/admin chrome. `src/components/ui/` — Shadcn UI primitives (40+ components).
- `src/components/admin/` — Admin module internals (~80 files), organized by feature (tasks/, finance/, habits/, learning/, etc.); rendered inside the new admin shell.
- `src/lib/` — Config, constants, utilities, Zod schemas, fallback data
- `src/types/index.ts` — Central TypeScript interfaces (150+ types)
- `src/supabase/client.ts` — Supabase client initialization
- `db/schema.sql` — Full database schema (21+ tables with RLS policies)

### Auth & Security

Supabase Auth with mandatory MFA/TOTP. Row Level Security on all tables — public read for published content, admin-only write. Session max age: 24 hours.

MFA and single-admin are enforced **at the database level**, not just in the client: write policies require `public.is_admin()` (first registered user + AAL2 session) or `auth.uid() = user_id AND public.is_aal2()`, and a `block_additional_signups` trigger on `auth.users` rejects account creation once an admin exists. The client-side `useAdminGuard` checks are UX, not the security boundary. Blog markdown is sanitized with `rehype-sanitize` (after `rehype-raw`, before prism/slug).

### Testing

Vitest + React Testing Library (jsdom). Tests live next to source as `*.test.ts(x)`; shared setup in `src/test/setup.ts`, config in `vitest.config.ts`. CI runs tests before the build in `.github/workflows/next-deploy.yml`.

### Environment Variables

Required for dynamic mode:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_BUCKET_NAME        # Storage bucket, default "assets"
NEXT_PUBLIC_SITE_URL           # Deployed URL (required for builds)
```

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).
