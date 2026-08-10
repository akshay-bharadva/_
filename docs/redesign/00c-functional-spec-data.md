# FolioKit v2 — Functional Spec: Data Layer, Auth & Infra (extracted from v1)

The DB schema, RLS model, RPCs, store layer, schemas, and CI are **preserved as-is** in the
rebuild. This doc records the contracts the new UI must consume.

## 1. Database (db/schema.sql — idempotent)

### Security functions

- `check_admin_exists()` → bool (SECURITY DEFINER; any auth.users row). Client UX only.
- `is_aal2()` → jwt aal = 'aal2'.
- `is_admin()` → uid != null AND aal2 AND uid = first-registered user (SECURITY DEFINER).
- `block_additional_signups()` BEFORE INSERT trigger on auth.users — the real single-admin
  enforcement.

### RLS tiers

- PUBLIC_READ: select using(true) — site_identity, portfolio_items, security_settings.
- Visibility-scoped public read: navigation_links (is_visible), portfolio_sections
  (is_visible), blog_posts (published), public_notes (is_published).
- ADMIN_ALL (`is_admin()` USING+CHECK): all shared/public content tables + storage writes.
- OWNER*AAL2 (`uid = user_id AND is_aal2()`): personal tables — tasks, sub_tasks, notes,
  events, transactions, recurring_transactions, financial_goals, learning*\*, habits,
  focus_logs, inventory_items, storage_assets.
- habit_logs: no user_id; policy via EXISTS on parent habit + is_aal2(), USING only.
- contact_submissions: public INSERT, admin SELECT/DELETE, no UPDATE policy.

### Tables (columns as in schema.sql; notable constraints)

- `site_identity` id=1 CHECK; profile_data/social_links/footer_data JSONB; portfolio_mode.
- `security_settings` id=1 CHECK; lockdown_level 0–3.
- `navigation_links` label, href, display_order, is_visible.
- `portfolio_sections` title, type CHECK(markdown|list_items|gallery), content,
  display_order, page_path def '/', layout_style def 'default', is_visible.
- `portfolio_items` section_id FK cascade, title, subtitle, date_from/to, description,
  image_url, link_url, tags[], internal_notes, display_order.
- `blog_posts` slug UNIQUE, published/published_at, show_toc, tags[], views BIGINT,
  **word_count GENERATED STORED** (never write it).
- `tasks` status task_status(todo|inprogress|done) def todo, priority(low|medium|high)
  def medium, due_date DATE. `sub_tasks` task_id cascade, is_completed.
- `notes` title/content/color/tags/is_pinned.
- `events` start_time req, end_time?, is_all_day.
- `transactions` date, description, amount NUMERIC(10,2), type(earning|expense), category,
  recurring_transaction_id FK SET NULL.
- `recurring_transactions` frequency(daily|weekly|bi-weekly|monthly|yearly), start/end_date,
  occurrence_day, last_processed_date.
- `financial_goals` name, target_amount (12,2), current_amount def 0, target_date.
- `learning_subjects` name UNIQUE. `learning_topics` subject_id cascade, status
  learning_status('To Learn'|'Learning'|'Practicing'|'Mastered'), core_notes, resources
  JSONB, confidence_score INT2 CHECK 1–5 (⚠ Zod says 0–100; DB is source of truth).
  `learning_sessions` topic_id cascade, start/end_time, duration_minutes, journal_notes.
- `habits` title, color def '#0ea5e9', target_per_week def 7, is_active.
  `habit_logs` UNIQUE(habit_id, completed_date).
- `focus_logs` task_id FK SET NULL, start_time, duration_minutes, completed, mode
  CHECK(work|break).
- `inventory_items` name, category, serial_number, purchase/warranty dates, prices,
  image_url, notes, transaction_id FK SET NULL.
- `storage_assets` file_name, file_path UNIQUE, mime_type, size_kb, alt_text, used_in JSONB.
- `public_notes` category CHECK(watching|activity|photo|thought|milestone) def thought.
- All content tables have updated_at triggers except sub_tasks, learning_sessions,
  habit_logs, focus_logs, storage_assets, contact_submissions, security_settings.

### RPCs

`ping()`; `increment_blog_post_view(uuid)` (SECURITY DEFINER, published only);
`update_section_order(uuid[])`; `get_total_blog_views()`;
`get_learning_heatmap_data(start,end)` → (day,total_minutes);
`get_calendar_data(start,end)` → (item_id,title,start_time,end_time,item_type,data) UNION of
events / tasks(due+9h) / habit_summary(+7h) / transaction_summary(+12h);
`get_analytics_overview()` → jsonb (task_status_distribution, tasks_completed_weekly,
productivity_heatmap, top_blog_posts, learning_time_by_subject);
`update_asset_usage()`; `rename/merge/delete_transaction_category` (SECURITY DEFINER).

### Storage

Public bucket `assets`; public read, admin (is_admin) insert/update/delete on storage.objects.

## 2. Store layer (preserved)

- `publicApi` (fakeBaseQuery): 10 endpoints (see 00a). Tags: SiteContent, Posts, Post,
  Portfolio, Navigation, SiteSettings, LifeUpdates. All fall back to `fallback-data` mocks
  when `supabase === null` (getGitHubRepos always live-fetches).
- `adminApi` base + feature slices under `src/store/api/admin/` (see 00b), barrel import
  rule; query-helper factories (getAll/insert/update/save/delete + NO_DB_ERROR).
- Optimistic patterns: tasks/subtasks, habit toggles, site settings (patches publicApi
  cache too). Calendar tag invalidated by task/event/finance mutations.
- Slices: focus (Pomodoro: isActive/isPaused/mode/timeLeft/duration/taskTitle/taskId;
  work=25/break=5), learningSession (activeSession/elapsedTime/isLoading; tick computes
  from start_time). LearningSessionManager mounted globally.

## 3. Zod schemas (src/lib/schemas.ts — preserved)

taskSchema, subTaskSchema, transactionSchema, recurringTransactionSchema,
financialGoalSchema, habitSchema (target_per_week 1–7), learningSubjectSchema,
learningTopicSchema, noteSchema, lifeUpdateSchema, eventSchema, inventoryItemSchema,
portfolioSectionSchema, portfolioItemSchema, navLinkSchema, blogPostSchema,
contactFormSchema, socialLinkSchema, siteSettingsSchema (+siteSettingsDefaultValues).
Fragments: optionalString, urlOrEmpty, dateString, requiredDateString.

## 4. Hooks (preserved/adapted)

- use-auth-guard: useSupabaseSession (read-only) + useAuthGuard (static-mode redirect /,
  no session → login, AAL≠aal2 → login, SIGNED_OUT listener). v2: becomes the admin
  route-group layout guard instead of a per-page HOC.
- use-theme-sync (applyTheme from identity), use-crud-handlers (confirm+toast delete),
  use-search-filter, use-loading-state, use-responsive-days (14/10/7/5 by breakpoint),
  use-mobile.

## 5. lib (preserved)

constants.ts (SESSION_MAX_AGE_MS 24h, BUCKET_NAME, HABIT_WINDOW_DAYS 14,
HABIT_LOGS_LOOKBACK_DAYS 30, LEARNING_SESSIONS_LIMIT 100, NOTE_COLORS, HABIT_COLORS,
CHART_COLORS, enum OPTIONS, TYPOGRAPHY_PRESETS ×8, THEME_PRESETS ×30);
themes.ts (VALID_THEMES, DEFAULT_THEME, applyTheme, applyCustomThemeColors, hexToHsl map);
config.ts (mfa issuer/appName, site, supabase, isSupabaseConfigured);
fallback-data.ts (mocks from portfolio.config.ts); finance-utils
(projectRecurringOccurrences, buildForecastData); habit-utils (calculateHabitStats);
color/date/storage utils; utils (cn, getErrorMessage).

## 6. Build / CI (preserved)

- next.config: output export, trailingSlash, images unoptimized (+ github avatars domain).
- Deploy workflow: Node 18, vitest gate, next build w/ env from secrets, deploy-pages.
- Heartbeat workflow: daily `ping` RPC (skips in static mode), Discord broadcast.
- vitest: jsdom, globals, src/test/setup.ts (matchMedia/RO/IO/localStorage polyfills),
  include src/\*_/_.test.{ts,tsx}. 11 existing test files (schemas, finance-utils, themes,
  theme-contrast, utils, query-helpers, adminApi, SectionRenderer, LoadingSpinner,
  blog post-list, post-settings-sheet).
- Env: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/BUCKET_NAME/SITE_URL (+ optional
  VISIT_NOTIFIER_URL, CONTACT_WEBHOOK_URL, APP_NAME, MFA_ISSUER).

## 7. Rebuild gotchas

1. Two RLS tiers (is_admin vs owner+aal2); habit_logs special-cased.
2. word_count generated — blog list must select explicit columns.
3. Single-row tables updated with .eq('id',1).
4. Static mode is first-class: null supabase everywhere.
5. Tailwind content globs must include lib/hooks (runtime theme classes) or presets get
   tree-shaken (regression already fixed once in v1 — keep the contrast test).
