# FolioKit v2 — Functional Spec: Admin "Personal OS" (extracted from v1)

Functional contract only; v1 layout/design intentionally omitted.

## 0. Architecture

- Single RTK Query slice `adminApi` (`fakeBaseQuery`, per-feature `injectEndpoints`, barrel import rule).
- Tag types: Notes, Tasks, Transactions, Recurring, Goals, Learning, PortfolioContent, Assets,
  Navigation, SiteSettings, AdminPosts, Calendar, Analytics, Dashboard, MFA, SiteContent,
  Habits, Inventory, LifeUpdates, System.
- Query helper factories: getAll/insert/update/save(insert-or-update)/delete + `NO_DB_ERROR` (Static Mode).
- Redux slices: `focusSlice` (Pomodoro), `learningSessionSlice` (study timer).
- Route protection: every admin page guarded — (1) no Supabase → toast + redirect `/`;
  (2) no session → `/admin/login`; (3) AAL ≠ aal2 → `/admin/login`; (4) SIGNED_OUT event → login.
  Read-only session hook for chrome (no duplicate guards).
- Shell requirements: collapsible sidebar (persisted `admin_sidebar_collapsed`), mobile drawer,
  breadcrumbs, active-learning-session pill (live elapsed, links to learning), user menu
  (email, back to portfolio, logout), global FocusTimer overlay, Quick Add (task/note/
  transaction/blog post), command palette (Cmd/Ctrl+K + custom `open-command-palette` event).
- Command palette: quick actions (new post `/admin/blog?create=true`, add task, jot note,
  start focus 25m), admin nav, public nav, theme light/dark/system (next-themes), copy URL, logout.

## 1. Dashboard (`/admin`)
`getDashboardData` batched: tasks, notes, blog_posts, transactions, recurring_transactions,
financial_goals + RPC `get_total_blog_views`.
Widgets: 4 stat cards (total blog views; month net; pending tasks = overdue + due today;
primary goal %); Action Center (overdue, due-today, pinned notes; "Inbox Zero" empty state);
Recent Activity (3 latest posts, draft/pub badge, public view link); 7-day expense trend
(bar, earnings vs expenses); 7-day outlook (upcoming tasks + projected recurring finance via
`projectRecurringOccurrences`); Quick Add. Also `getAnalyticsData` (RPC `get_analytics_overview`).

## 2. Tasks
`tasks` join `sub_tasks(*)`; optimistic updates; mutations invalidate Calendar.
Kanban (To Do / In Progress / Done) with drag-and-drop between columns, per-column add,
priority pill inline-editable, due date, subtask progress, card menu (Start Focus 25m w/ task
title, Edit, Delete). Mobile tree/table view w/ inline toggles. Title filter. Subtask
quick-add dialog. Task form in sheet. Schemas: taskSchema (title, status, priority,
due_date?), subTaskSchema (task_id, title, is_completed).

## 3. Finance
Batched: transactions (date desc), financial_goals, recurring_transactions.
Mutations: saveTransaction, deleteTransaction, saveRecurring, deleteRecurring, saveGoal,
deleteGoal, addFundsToGoal (goal update + auto "Savings & Goals" expense),
manageCategory (RPCs rename/merge/delete_transaction_category).
Tabs: Dashboard (range stat cards, recurring forecast `buildForecastData`, "confirm
recurring" logs projected txn + stamps last_processed_date); Transactions (date-range
picker + search, edit/delete); Recurring (rules CRUD); Goals (progress cards, Add Funds);
Analytics (year selector; monthly cash-flow bars → month detail sheet; cumulative balance
line with projection + zero reference; expense-by-category pie + category table with
rename/merge/delete). Schemas: transactionSchema (date, description, amount>0,
type earning|expense, category?), recurringTransactionSchema (+frequency
daily|weekly|bi-weekly|monthly|yearly, start_date, end_date?, occurrence_day?),
financialGoalSchema (name, target_amount>0, current_amount≥0, target_date?).

## 4. Habits
`habits` active + `habit_logs` (30-day lookback); toggleHabitLog (insert/delete, optimistic);
logFocusSession → `focus_logs`. 14-day grid toggling; streak + completion-rate stats;
perfect-day badge; XP gamification (logs×15, level √(xp/100)+1); per-habit heatmap modal;
habit sheet CRUD. habitSchema (title, color, target_per_week 1–7); HABIT_COLORS.

## 5. Learning
Batched: learning_subjects, learning_topics, learning_sessions (limit 100).
CRUD all three. Stat cards + 365-day study heatmap (min/day). Modules → topics; TopicEditor
full-screen: status pipeline (To Learn→Learning→Practicing→Mastered), TipTap core notes w/
2s autosave, typed resources (Article/Video/Course/Official/Roadmap/OpenSource, URL
validated), SessionTracker (start→addLearningSession + redux; live elapsed; stop→end_time +
duration_minutes + journal_notes; cancel→delete). Active session pill in shell header.
Schemas: learningSubjectSchema, learningTopicSchema (subject_id, title, status,
core_notes?, confidence_score 0–100?, resources[]).

## 6. Calendar
RPC `get_calendar_data({start,end})` + recurring_transactions; events CRUD (`events` table).
FullCalendar (dayGrid/timeGrid, dynamic import), mini-calendar + type filters
(event, task, transaction_summary, forecast, habit_summary), client-side recurring
projection, title search, day drawer, event details w/ navigate-to-source, drag-select
create, EventFormSheet. eventSchema (title, description?, start_time, end_time?, is_all_day?).

## 7. Notes
`notes` pinned-first then updated desc; CRUD. Masonry grid, color tint, pin/unpin, tag
sidebar filter + search, sheet editor (title, TipTap markdown, NOTE_COLORS picker,
comma tags), markdown rendering on cards. noteSchema (title?, content?, tags[]?, color?,
is_pinned?).

## 8. Content CMS
`portfolio_sections` join items ordered by page_path + display_order; saveSection/
deleteSection; savePortfolioItem/deletePortfolioItem (invalidate Assets); RPC
`update_section_order` (optimistic reorder); RPC `update_asset_usage` rescan after saves.
Page paths sourced from nav links. Two-pane (sections grouped by page / detail). Section
types: markdown (auto-saving TipTap, 2s), list_items, gallery. Section + item editor
sheets. Schemas: portfolioSectionSchema, portfolioItemSchema.

## 9. Blog
getAdminBlogPosts (created desc, per-id tags); add/update/delete (delete also removes cover
from storage `blog_images/`). List: table/cards, status filter All/Published/Draft, search,
inline publish toggle (sets published_at), `?create=true` opens editor. Editor (dynamic):
title with auto-slug, TipTap body, settings sheet (slug regex ^[a-z0-9-]+$, excerpt, tags,
cover image, show_toc, published, internal notes), RPC update_asset_usage on save, image
upload hook (WebP ≤0.8MB/1600px → `blog_images/`). Requires title/slug/content.

## 10. Assets
`storage_assets` + Supabase Storage bucket (NEXT_PUBLIC_BUCKET_NAME, default "assets").
Virtual folders (`.placeholder` files), breadcrumbs, grid/list toggle, drag-drop + multi
file upload, bulk select → move/delete, rescan usage (RPC update_asset_usage), details
sheet (preview, download, editable alt text). moveAsset = storage .move + row update.

## 11. Inventory
`inventory_items` purchase_date desc; CRUD. Stat cards (net value, count, depreciation,
categories); search (name/serial/notes); category filter; sort date/value/name; table +
grid views; warranty badges (Active/Expiring Soon/Expired from warranty_expiry).
inventoryItemSchema (name, category, serial_number?, purchase_date?, warranty_expiry?,
purchase_price≥0, current_value?, image_url?, notes?).

## 12. Life Updates (public_notes)
CRUD; stats row; category filter (5 categories w/ emoji); search; board (polaroid)/list
toggle; pin + publish toggles; editor (title, content, category, image upload w/ WebP
compression → `life_updates/` or URL, tags, published switch). lifeUpdateSchema.

## 13. Navigation
navigation_links by display_order; saveNavLink/deleteNavLink; drag-and-drop reorder
(persists display_order); per-link visibility switch (optimistic); sheet editor (label, href).

## 14. Settings (site_identity row 1)
getSiteSettings (falls back to mock) / updateSiteSettings (optimistic patch of admin +
public caches). One RHF form + siteSettingsSchema; sticky unsaved-changes banner.
Sections: Brand (name, title, logo main/highlight, avatar URL + show, portfolio_mode);
Hero/About (description, bio[]); Theme (default_theme from ~30 THEME_PRESETS +
custom_theme_colors 6 hex); Typography (8 TYPOGRAPHY_PRESETS); Layout (updates_layout
timeline|scrapbook); StatusPanel (show, design minimal|terminal|bento, title, availability,
currently_exploring, latestProject); GitHub config; ContactPage toggles; SocialLinks array
(merged defaults github/linkedin/email); Footer copyright_text.

## 15. Security
MFA: listFactors, factor table, unenroll (recheck AAL), enable/add → setup-mfa.
Password change (min 6 + confirm). Lockdown levels (security_settings id=1): 0 Normal /
1 Maintenance (public hidden) / 2 Lockdown (read-only API) — confirm dialogs. Checklist.

## 16. Auth flow
Login: `check_admin_exists` RPC (cached 300s) → no admin → redirect signup. Authenticated
routing by AAL: aal2→/admin; aal1+next aal2→mfa-challenge; else setup-mfa.
signInWithPassword then same routing.
Signup: bootstrap-only (redirects to login if admin exists); signUp email/password (min 6);
verify-email screen; DB trigger blocks additional signups regardless.
Setup MFA: mfa.enroll TOTP (issuer from config) → QR + manual secret (grouped, copy,
show/hide) → 6-digit OTP verify (challenge + verify) → /admin. Cancel = sign out.
MFA challenge: first verified TOTP factor, 6-digit OTP, 30s countdown,
challengeAndVerify → /admin. Cancel and sign out.

## Special widgets
- Focus timer: Pomodoro work/break, start/pause/resume/stop/tick/setMode, 1s tick,
  fullscreen overlay + minimized card, logs completed work → focus_logs.
- Learning session: persistent active session, live elapsed in header.
- TipTap/Novel editor: StarterKit, Highlight, TaskList/Item, Underline, Table (resizable),
  Link, Image, Typography, CharacterCount, TextAlign, Placeholder, tiptap-markdown
  (markdown in/out). Toolbar + "/" slash menu, image paste/drag-drop upload, fullscreen.
  Used by blog, notes, CMS markdown sections, learning notes.
- Image compression: WebP ≤0.8MB ≤1600px q0.8.
- Charts: Recharts (dashboard trend, finance analytics); heatmaps are custom grids.
- Confirm dialog provider for all destructive actions.
