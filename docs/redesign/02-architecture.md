# FolioKit v2 — Target Architecture

## 1. Framework decisions

| Decision   | Choice                                    | Rationale                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router     | **App Router** (`src/app/`)               | Nested layouts give the public chrome and the admin shell for free; route groups map 1:1 to the two experiences; this is the stack named in the rebuild brief. Static export (`output: 'export'`) is fully supported and remains — deployment target is GitHub Pages. |
| Data       | **Redux Toolkit + RTK Query, preserved**  | The store layer (publicApi / adminApi feature slices, query-helper factories, tag invalidation) is business logic, not design. It survives the rebuild; UI imports hooks from the same barrels.                                                                       |
| Auth       | Supabase Auth + mandatory TOTP, unchanged | The DB-level enforcement (`is_admin()`, AAL2 policies, signup-blocking trigger) is the security boundary and is untouched. Client guard is reimplemented as an admin route-group layout.                                                                              |
| Validation | Zod + React Hook Form, preserved          | Schemas in `src/lib/schemas.ts` are the entity contracts.                                                                                                                                                                                                             |
| Styling    | Tailwind + CSS-variable tokens            | New token scale (see design vision); theme presets become data-driven token layers.                                                                                                                                                                                   |

Because the site is a static export with client-side Supabase, all interactive routes are
client components; the App Router win here is **layout composition and file organization**,
not server rendering — and that is enough to justify it.

## 2. Directory layout (feature-first)

```
src/
  app/
    (public)/                 # public chrome layout: header, footer, ⌘K, theme
      page.tsx                # home
      about/ projects/ showcase/ updates/ contact/
      blog/  blog/view/       # view resolves ?slug= client-side (static export)
      [...slug]/              # CMS dynamic pages
    admin/
      layout.tsx              # auth-guard + Personal OS shell (sidebar, topbar)
      (auth)/                 # login, signup, mfa — outside the shell
      page.tsx                # dashboard
      tasks/ finance/ habits/ learning/ calendar/ notes/
      content/ blog/ updates/ navigation/ assets/ inventory/
      settings/ security/
  components/
    ui/                       # design-system primitives (restyled shadcn/Radix)
    layout/                   # public header/footer, admin sidebar/topbar, command palette
  features/
    <domain>/                 # feature-owned components + hooks (tasks, finance, blog, …)
      components/
      hooks/
  store/                      # preserved: api/, slices/, hooks
  lib/                        # schemas, constants, themes, utils, fallback-data
  types/
  styles/
    tokens.css                # base scale + semantic tokens
    themes.css                # preset token layers (preserved capability)
```

Rules:

- `components/ui` never imports from `features/`; `features/` never import each other.
- Admin pages are thin route files; logic lives in the feature folder.
- RTK Query hooks are imported only from the API barrels (unchanged rule).

## 3. Design-system layers

1. **Tokens** (`tokens.css`): color (oklch), space, radius, type scale, motion durations —
   the only place raw values live.
2. **Primitives** (`components/ui`): Button, Input, Sheet, Dialog, Table, Card, Badge,
   Tabs, Command, Toast… — Radix-based, styled exclusively through tokens.
3. **Patterns** (`components/layout` + shared feature patterns): PageHeader, DataTable,
   EmptyState, StatCard, EntitySheet, ConfirmDialog, SectionRenderer.
4. **Features**: compose patterns; own nothing visual beyond composition.

Theme presets: each preset is a named token layer (CSS class scoping the same variable
names). The preset registry stays in `lib/constants.ts`; the contrast-regression test
carries over as the gate for every preset.

## 4. Performance budget

- Heavy dependencies load only where used, via `next/dynamic`: TipTap/Novel (blog editor),
  FullCalendar (calendar), Recharts (finance/dashboard), QR (MFA setup), confetti.
- Public routes target zero third-party UI libraries beyond Radix primitives actually used.
- Fonts self-hosted through `next/font` with `display: swap`.
- Images: `next/image` unoptimized (static export) + existing `browser-image-compression`
  on upload.

## 5. Migration mechanics

The rebuild happens on `redesign/v2` in phases (see `03-rebuild-plan.md`). Pages Router
files are deleted as each App Router route reaches functional parity; the store, lib,
types, and DB layer are ported (and trimmed) rather than rewritten. `npm run build` +
`npm run test` must pass at every phase boundary.
