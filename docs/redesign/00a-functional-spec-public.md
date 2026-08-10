# FolioKit v2 — Functional Spec: Public Site (extracted from v1)

This is the functional contract the rebuild must preserve. Design/layout details of v1 are
intentionally omitted — they are being replaced.

## 0. Data sources

Next.js 14, statically exported (`output: "export"`, `trailingSlash: true`,
`images.unoptimized`). Data via RTK Query (`src/store/api/publicApi.ts`) over
`fakeBaseQuery`: Supabase when configured, else mock data derived from
`portfolio.config.ts` via `src/lib/fallback-data.ts`. `isSupabaseConfigured`
(`src/lib/config.ts`) + nullable client (`src/supabase/client.ts`) drive the switch;
every endpoint has an `if (!supabase)` mock branch.

### Public RTK Query endpoints

| Hook                               | Supabase source                                                                  | Notes                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `useGetSiteIdentityQuery`          | `site_identity` single row                                                       | identity/theme/hero/footer/status/github/contact config  |
| `useGetNavLinksQuery`              | `navigation_links` visible, ordered + `portfolio_mode`                           | `single-page` mode trims nav to `/`, `/contact`, `/blog` |
| `useGetPublishedBlogPostsQuery`    | `blog_posts` published, desc; all cols **except `content`** (uses `word_count`)  |                                                          |
| `useGetBlogPostBySlugQuery(slug)`  | `blog_posts` by slug + published, `.single()`                                    | 404 on miss                                              |
| `useIncrementPostViewMutation(id)` | RPC `increment_blog_post_view(post_id_to_increment)`                             | fired 5s after view; prod + Supabase only                |
| `useGetPublishedLifeUpdatesQuery`  | `public_notes` published, pinned-first then newest                               |                                                          |
| `useGetSectionsByPathQuery(path)`  | `portfolio_sections` + nested `portfolio_items(*)`, visible, ordered both levels | core CMS fetch                                           |
| `useGetGitHubReposQuery`           | GitHub REST (not Supabase)                                                       | client-side filtering                                    |
| `useSubmitContactFormMutation`     | insert `contact_submissions` + Discord webhook                                   | webhook best-effort always                               |
| `useGetLockdownStatusQuery`        | `security_settings.lockdown_level`                                               | maintenance kill-switch                                  |

### Public tables (RLS)

- `site_identity` — id(=1), `profile_data` JSONB, `social_links` JSONB, `footer_data` JSONB, `portfolio_mode`. Public read.
- `navigation_links` — label, href, display_order, is_visible. Public read where visible.
- `portfolio_sections` — title, type CHECK(markdown|list_items|gallery), content, display_order, page_path (default `/`), layout_style (default `default`), is_visible. Public read where visible.
- `portfolio_items` — section_id FK, title, subtitle, date_from, date_to, description, image_url, link_url, tags[], internal_notes (never rendered publicly), display_order. Public read.
- `blog_posts` — title, slug UNIQUE, excerpt, content, cover_image_url, published, published_at, show_toc, tags[], views BIGINT, internal_notes, **word_count GENERATED**. Public read where published.
- `public_notes` — title, content, category CHECK(watching|activity|photo|thought|milestone) default thought, image_url, tags[], is_pinned, is_published. Public read where published.
- `contact_submissions` — name, email, subject, message. Public INSERT only; admin read/delete.
- `security_settings` — `lockdown_level` INT 0–3. Public read.

## 1. Pages

### `_app` / global shell requirements

- Redux Provider; next-themes ThemeProvider (`attribute="class"`, `enableSystem=false`, `storageKey="site-theme"`, themes=VALID_THEMES, default `theme-blueprint`).
- `MotionConfig reducedMotion="user"`; page transitions keyed on route.
- `useThemeSync(siteIdentity)` applies DB theme/typography/custom colors to `<html>`.
- Handwriting font (Tahu) → `--font-tahu` (scrapbook layout).
- GlobalCommandPalette, sonner Toaster, ConfirmDialogProvider, LearningSessionManager.
- Prism theme CSS for code highlighting.
- `<Html lang="en">`, smooth scroll, no analytics scripts.

### Home `/`

- Hero + CMS sections for path `/` + CTA. SEO title `{name} | {title}`, description from identity.
- **Visit notifier**: prod-only, `NEXT_PUBLIC_VISIT_NOTIFIER_URL`, sessionStorage-deduped Discord POST (referrer + UA).

### `/about`

- Avatar (if `show_profile_picture`), `bio[]` as ReactMarkdown paragraphs, then CMS sections for `/about`. Skeleton while loading.

### `/projects`

- CMS sections for `/projects`: section titled "Featured Projects" → case-study cards from its items; then GitHub repos grid (§4).

### `/showcase`

- Heading + CMS sections for `/showcase`.

### `/contact` (§5), `/updates` (§7), `/blog` + `/blog/view?slug=` (§6).

### `[...slug]` catch-all

- `getStaticPaths`: visible `navigation_links` hrefs → slugs, excluding `/` and reserved
  {admin, blog, projects, about, contact, showcase, experience, updates, 404, 500}; `fallback: false`.
- Page title = nav link label (fallback: capitalized slug). Renders CMS sections for the path.
- Net effect: any admin-created nav link to a non-reserved path becomes a CMS page.

### `404`

- Not-found screen, `noindex`.

### `/_offline`

- Static offline screen. NOTE: no service worker exists in v1 — placeholder only. v2 may drop or wire it.

## 2. Section-renderer

`DynamicPageContent({pagePath})` → query → `SectionRenderer` per section. Switches on
`layout_style` (not `type`); `default` branch: `list_items` → default list, `markdown` →
ReactMarkdown+gfm of `section.content`.

`layout_style` values (all must be preserved as capabilities):
`timeline`, `grid-2-col`, `grid-3-col`, `cards-with-image`, `compact-cards`, `stats-grid`,
`masonry`, `feature-alternating`, `github-grid` (renders GitHub repos), `case-study`,
`services`, `work-experience`, `testimonials`, `impact-numbers`, `open-source`,
`speaking`, `press-awards`, `client-logos`, `now-page`, `uses`, `default`.

Item field reinterpretation examples: stats-grid (title=stat, subtitle/description=label);
testimonials (title=quote, subtitle=author, description=role, image_url=avatar);
timeline/work-experience use date_from/date_to; feature-alternating/case-study use
image_url+link_url+markdown description.

## 3. `portfolio.config.ts` shape (fallback/static mode)

Identity: name, title, description, profilePicture, showProfilePicture, logo{main,highlight}, bio[].
Theme: defaultTheme, typographyPreset, portfolioMode (multi-page|single-page).
statusPanel: show, design (minimal|terminal|bento), title, availability,
currentlyExploring{title,items[]}, latestProject{name,linkText,href}.
socialLinks[]: {id,label,url} (id keys icon; mailto supported).
footerText (markdown). github: username, show, sortBy(pushed|created|updated),
excludeForks, excludeArchived, excludeProfileRepo, minStars, projectsPerPage.
contact: showContactForm, showAvailabilityBadge, showServices.
navLinks[]. Content arrays: experience[], techStack[], tools[], education[], showcase[],
projects[], services[], blogPosts[], updatesLayout (scrapbook|timeline), lifeUpdates[].

`fallback-data.ts` maps config → SiteContent/PortfolioSection/BlogPost/LifeUpdate shapes;
MOCK_SECTIONS distributes content arrays across page paths.

## 4. GitHub integration

`GET https://api.github.com/users/{username}/repos?sort={sort_by}&per_page=100&type=owner`
(unauthenticated). Client-side filter: forks/archived/profile-repo/private/min_stars.
Paged display: `projects_per_page` + "Load More" + "View All on GitHub". Hidden when
`show=false`. Config from `profile_data.github_projects_config`.

## 5. Contact

- Toggles: show_contact_form, show_availability_badge, show_services.
- Form: RHF + zod `contactFormSchema` (name ≥2, email, subject ≥3, message ≥10), inline errors.
- Submit: insert `contact_submissions` (if Supabase) + Discord webhook (`NEXT_PUBLIC_CONTACT_WEBHOOK_URL`, best-effort). Success/error status reverts after 5s.
- Availability badge; direct-contact links from social_links (email id + others with icons).
- Services: CMS section titled "Services" on `/contact` (title, subtitle, tags-as-checklist).

## 6. Blog

Listing: published posts w/o content; read time from `word_count` (fallback: 225 wpm calc,
min 1); client-side search over title/excerpt/tags; cards show ≤3 tags, date, read time,
views (if numeric), optional cover. No pagination. Links to `/blog/view?slug=`.

Post view: query-param slug routing (static-export friendly); 404 component on miss.
View count: mutation after 5s, prod+Supabase only.
Markdown pipeline order (deliberate, must preserve): remark-gfm → rehype-raw →
rehype-sanitize (defaultSchema + `input[type,checked,disabled]` for task lists) →
rehype-prism → rehype-slug. External links `target=_blank rel=noopener noreferrer`.
TOC when `show_toc`: h2/h3 from rendered DOM, IntersectionObserver active heading,
smooth-scroll w/ offset; desktop sidebar, mobile sheet.
Meta: breadcrumb, author from identity, date, read time; footer tags link `/blog?tag=`;
share to X/LinkedIn. Article OG tags + published_time; OG image = cover || default.

## 7. Updates (`public_notes`)

Layout from `profile_data.updates_layout`: `timeline` | `scrapbook` (default scrapbook).
Categories: watching 📺, activity 🏄, photo 📸, thought 💭, milestone 🏆.
Client-side search (title/content/tags) + category filter pills (only if >1 category).
Scrapbook: masonry, deterministic per-id rotation/tape, polaroid (image) vs note cards,
handwriting font, pin badge, relative dates. Timeline: grouped by month, category accents,
inline images. Pinned sort first in both.

## 8. Theming

- 30 presets (`theme-*`) + `theme-custom` = VALID_THEMES; 8 typography presets (`typo-*`).
- `useThemeSync` applies `default_theme`, `typography_preset`, `custom_theme_colors`
  (6 colors → full var set via hexToHsl) from identity; persists `localStorage["site-theme"]`.
- Dark/light is a property of each theme class; no OS-follow, no visitor toggle in v1.
  (v2 decision: keep owner-controlled presets; ADD visitor light/dark toggle as an
  improvement only if it doesn't break preset capability.)

## 9. Misc

- No PWA/SW, no RSS, no sitemap (robots.txt allows all). v2 may add sitemap/RSS as improvements.
- Maintenance kill-switch: `lockdown_level>=1` and visitor not admin → maintenance screen, noindex.
- Header: logo main+highlight, nav from query, "Admin" link only with session.
- Footer: markdown copyright, social icons, 5-click Easter egg → `/admin`.
- Hero: kinetic name, rotating title on `|`, markdown description, socials, status panel
  in 3 designs (minimal/terminal/bento) with live clock.
- Skip link, `theme-color` meta, per-page SEO component (canonical, OG, Twitter).

Env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL,
NEXT_PUBLIC_SITE_TITLE, NEXT_PUBLIC_SITE_DESCRIPTION, NEXT_PUBLIC_BUCKET_NAME,
NEXT_PUBLIC_VISIT_NOTIFIER_URL, NEXT_PUBLIC_CONTACT_WEBHOOK_URL, NEXT_PUBLIC_APP_NAME,
NEXT_PUBLIC_MFA_ISSUER.
