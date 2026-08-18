// Centralized Zod schemas for form validation

import { z } from "zod";
import {
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_RECURRENCE,
  TASK_MINUTES_MAX,
  TASK_RECURRENCE_INTERVAL_MAX,
  TRANSACTION_TYPE,
  FREQUENCY,
  LEARNING_STATUS,
  DAY_OF_WEEK_MIN,
  DAY_OF_WEEK_MAX,
  DAY_OF_MONTH_MIN,
  DAY_OF_MONTH_MAX,
  HABIT_VALUE_MAX,
  HABIT_NOTE_MAX,
} from "./constants";
import { SITE_IDENTITY_DEFAULTS } from "./site-identity-defaults";

// =============================================================================
// LIMITS
//
// Postgres stores every text column here as unbounded TEXT, so these caps are
// not database constraints — they are the point past which a value stops being
// data and starts being a layout bug. Enforcing them here means one rule the
// forms, the tables, and the public renderers can all agree on.
// =============================================================================

export const LIMITS = {
  /** Single-line labels: titles, names, categories, link text. */
  TITLE: 200,
  /** Short free text: excerpts, subtitles, descriptions shown in a card. */
  SUMMARY: 2_000,
  /** Long-form bodies: markdown content, notes, journals. */
  BODY: 100_000,
  /** A single tag. */
  TAG: 50,
  /** How many tags one record may carry. */
  TAG_COUNT: 20,
  /** URLs — well past any real URL, short of a denial-of-layout. */
  URL: 2_048,
} as const;

/**
 * Money ceilings mirror the DB column widths exactly. NUMERIC(10,2) tops out at
 * 99,999,999.99 and NUMERIC(12,2) at 9,999,999,999.99; anything larger is a
 * Postgres `numeric field overflow`, which surfaces to the user as an opaque
 * failure after the form has already told them the value was fine.
 */
export const MONEY_MAX_10_2 = 99_999_999.99;
export const MONEY_MAX_12_2 = 9_999_999_999.99;

// =============================================================================
// REUSABLE SCHEMA FRAGMENTS
// =============================================================================

/** Optional string that can be null. */
export const optionalString = z.string().optional().nullable();

/**
 * Optional free text with an upper bound. Kept nullable because every one of
 * these maps to a nullable TEXT column.
 */
export const boundedOptionalString = (max: number, label = "This field") =>
  z
    .string()
    .max(max, `${label} must be ${max.toLocaleString()} characters or fewer`)
    .optional()
    .nullable();

/** Required single-line text with both a floor and a ceiling. */
export const boundedRequiredString = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max.toLocaleString()} characters or fewer`);

/** URL or empty string validation. */
export const urlOrEmpty = z
  .string()
  .max(LIMITS.URL, "URL is too long")
  .url("Must be a valid URL")
  .or(z.literal(""));

/** A `#rrggbb` colour. Stored as TEXT, so nothing else validates it. */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour such as #3b82f6");

/** URL-safe slug — matches the `^[a-z0-9-]+$` rule the blog editor enforces. */
export const slug = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(LIMITS.TITLE, "Slug is too long")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens",
  );

/** A bounded list of bounded tags. */
export const tagList = z
  .array(z.string().trim().max(LIMITS.TAG, "Tag is too long"))
  .max(LIMITS.TAG_COUNT, `At most ${LIMITS.TAG_COUNT} tags`)
  .optional()
  .nullable();

/**
 * An empty number input yields `""`, and `Number("")` is `0` — so a plain
 * `z.coerce.number().optional()` silently turns "I didn't fill this in" into a
 * real zero. For money and counts that is a data-integrity bug (an item of
 * unknown value becomes an item worth nothing), so blank is normalised to null
 * before coercion runs.
 */
const blankToNull = (value: unknown) =>
  value === "" || value === undefined ? null : value;

/**
 * Two decimal places, matching every NUMERIC(_, 2) column.
 *
 * Compares against the value rounded to 2dp rather than scaling by 100 —
 * `10.999 * 100` is `1099.9000000000001`, which rounds to the same integer as
 * a legitimate 2dp value and would let a third decimal through.
 */
const twoDecimals = (value: number) =>
  Number.isFinite(value) && Math.abs(value - Number(value.toFixed(2))) < 1e-9;

/** Required money: positive, within the column width, at most 2 decimals. */
export const money = (max: number, label = "Amount") =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be positive`)
    .max(max, `${label} must be ${max.toLocaleString()} or less`)
    .refine(twoDecimals, `${label} can have at most 2 decimal places`);

/** Money that may be absent, and is allowed to be zero when present. */
export const optionalMoney = (max: number, label = "Amount") =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .min(0, `${label} cannot be negative`)
      .max(max, `${label} must be ${max.toLocaleString()} or less`)
      .refine(twoDecimals, `${label} can have at most 2 decimal places`)
      .nullable(),
  );

/** An optional whole number within a range; blank means "not set", not zero. */
export const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be between ${min} and ${max}`)
      .max(max, `${label} must be between ${min} and ${max}`)
      .nullable(),
  );

/** Date string in YYYY-MM-DD format */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format");

/** Required date string */
export const requiredDateString = z.string().min(1, "Date is required");

// =============================================================================
// TASK SCHEMAS
// =============================================================================

/**
 * Every bound here mirrors a CHECK constraint on `tasks` — see
 * `db/migrations/001-tasks-projects-dependencies.sql`. A value this schema
 * accepts and Postgres rejects surfaces as an opaque write failure.
 */
export const taskSchema = z
  .object({
    title: boundedRequiredString(LIMITS.TITLE, "Title"),
    description: boundedOptionalString(LIMITS.BODY, "Description"),
    project_id: z.string().uuid().optional().nullable(),
    status: z.enum([
      TASK_STATUS.TODO,
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.REVIEW,
      TASK_STATUS.DONE,
    ]),
    priority: z.enum([
      TASK_PRIORITY.LOW,
      TASK_PRIORITY.MEDIUM,
      TASK_PRIORITY.HIGH,
    ]),
    start_date: optionalString,
    due_date: optionalString,
    tags: tagList,
    estimate_minutes: optionalInt(0, TASK_MINUTES_MAX, "Estimate"),
    recurrence: z
      .enum([
        TASK_RECURRENCE.DAILY,
        TASK_RECURRENCE.WEEKLY,
        TASK_RECURRENCE.MONTHLY,
      ])
      .optional()
      .nullable(),
    recurrence_interval: optionalInt(
      1,
      TASK_RECURRENCE_INTERVAL_MAX,
      "Repeat interval",
    ),
  })
  // Mirrors tasks_dates_ordered. A task ending before it starts renders as a
  // zero- or negative-width bar on the timeline.
  .refine(
    (data) =>
      !data.start_date ||
      !data.due_date ||
      new Date(String(data.start_date)) <= new Date(String(data.due_date)),
    {
      message: "Due date must be on or after the start date",
      path: ["due_date"],
    },
  )
  // Mirrors tasks_recurrence_needs_due_date. Without a due date there is no
  // anchor to advance, so the next instance would have no date at all.
  .refine((data) => !data.recurrence || !!data.due_date, {
    message: "A repeating task needs a due date to repeat from",
    path: ["due_date"],
  });

export type TaskFormValues = z.infer<typeof taskSchema>;

export const taskProjectSchema = z.object({
  name: boundedRequiredString(120, "Project name"),
  color: hexColor.optional().nullable(),
});

export type TaskProjectFormValues = z.infer<typeof taskProjectSchema>;

export const subTaskSchema = z.object({
  task_id: z.string(),
  title: boundedRequiredString(LIMITS.TITLE, "Title"),
  is_completed: z.boolean().default(false),
});

export type SubTaskFormValues = z.infer<typeof subTaskSchema>;

// =============================================================================
// TRANSACTION SCHEMAS
// =============================================================================

export const transactionSchema = z.object({
  date: requiredDateString,
  description: boundedRequiredString(LIMITS.TITLE, "Description"),
  amount: money(MONEY_MAX_10_2),
  type: z.enum([TRANSACTION_TYPE.EARNING, TRANSACTION_TYPE.EXPENSE]),
  category: z
    .string()
    .trim()
    .max(LIMITS.TITLE, "Category is too long")
    .optional(),
});

export type TransactionFormValues = z.infer<typeof transactionSchema>;

export const recurringTransactionSchema = z
  .object({
    description: boundedRequiredString(LIMITS.TITLE, "Description"),
    amount: money(MONEY_MAX_10_2),
    type: z.enum([TRANSACTION_TYPE.EXPENSE, TRANSACTION_TYPE.EARNING]),
    category: z
      .string()
      .trim()
      .max(LIMITS.TITLE, "Category is too long")
      .optional(),
    frequency: z.enum([
      FREQUENCY.DAILY,
      FREQUENCY.WEEKLY,
      FREQUENCY.BI_WEEKLY,
      FREQUENCY.MONTHLY,
      FREQUENCY.YEARLY,
    ]),
    start_date: requiredDateString,
    end_date: optionalString,
    /**
     * Overloaded by frequency: day-of-week (0–6, Sunday first) for weekly and
     * bi-weekly rules, day-of-month (1–31) for monthly ones, unused otherwise.
     * The column is a plain INT with no CHECK, so this is the only place the
     * distinction is enforced — see the refinement below for the real bound.
     */
    occurrence_day: optionalInt(0, 31, "Occurrence day"),
  })
  // A rule that ends before it starts projects zero occurrences and silently
  // does nothing — better to reject it at the form than to save dead config.
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  })
  .refine(
    (v) => {
      if (v.occurrence_day == null) return true;
      if (
        v.frequency === FREQUENCY.WEEKLY ||
        v.frequency === FREQUENCY.BI_WEEKLY
      )
        return (
          v.occurrence_day >= DAY_OF_WEEK_MIN &&
          v.occurrence_day <= DAY_OF_WEEK_MAX
        );
      if (v.frequency === FREQUENCY.MONTHLY)
        return (
          v.occurrence_day >= DAY_OF_MONTH_MIN &&
          v.occurrence_day <= DAY_OF_MONTH_MAX
        );
      // Daily and yearly rules don't use the field at all.
      return true;
    },
    {
      message: "Occurrence day is outside the range for the chosen frequency",
      path: ["occurrence_day"],
    },
  );

export type RecurringTransactionFormValues = z.infer<
  typeof recurringTransactionSchema
>;

export const financialGoalSchema = z.object({
  name: boundedRequiredString(LIMITS.TITLE, "Goal name"),
  description: boundedOptionalString(LIMITS.SUMMARY, "Description"),
  target_amount: money(MONEY_MAX_12_2, "Target amount"),
  current_amount: z.coerce
    .number()
    .min(0, "Current amount cannot be negative")
    .max(MONEY_MAX_12_2, "Current amount is too large")
    .default(0),
  target_date: optionalString,
});

export type FinancialGoalFormValues = z.infer<typeof financialGoalSchema>;

// =============================================================================
// HABIT SCHEMAS
// =============================================================================

/**
 * Every bound mirrors a CHECK constraint on `habits` — see
 * `db/migrations/002-habits.sql`.
 */
export const habitSchema = z
  .object({
    title: boundedRequiredString(LIMITS.TITLE, "Title"),
    color: hexColor,
    kind: z.enum(["build", "quit"]).default("build"),
    schedule: z
      .enum(["daily", "weekdays", "weekends", "custom", "weekly_count"])
      .default("daily"),
    schedule_days: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .optional()
      .nullable(),
    target_per_week: z.coerce
      .number()
      .int("Weekly target must be a whole number")
      .min(1, "Weekly target must be between 1 and 7")
      .max(7, "Weekly target must be between 1 and 7")
      .default(7),
    target_value: z.coerce
      .number()
      .positive("Target must be greater than zero")
      .max(HABIT_VALUE_MAX, "Target is too large")
      .default(1),
    unit: boundedOptionalString(24, "Unit"),
    step: z.coerce
      .number()
      .positive("Step must be greater than zero")
      .max(HABIT_VALUE_MAX, "Step is too large")
      .default(1),
    time_of_day: z
      .enum(["anytime", "morning", "afternoon", "evening"])
      .default("anytime"),
    category: boundedOptionalString(LIMITS.TITLE, "Category"),
    notes: boundedOptionalString(LIMITS.SUMMARY, "Notes"),
  })
  // Mirrors habits_custom_needs_days. A custom schedule with no days is due
  // never, which makes the habit impossible to complete and its streak
  // undefined.
  .refine(
    (data) =>
      data.schedule !== "custom" || (data.schedule_days?.length ?? 0) >= 1,
    {
      message: "Pick at least one day",
      path: ["schedule_days"],
    },
  )
  // A step larger than the target means one tap overshoots every time.
  .refine((data) => data.step <= data.target_value, {
    message: "Step cannot be larger than the target",
    path: ["step"],
  });

export const habitLogSchema = z.object({
  value: z.coerce.number().min(0).max(HABIT_VALUE_MAX),
  note: boundedOptionalString(HABIT_NOTE_MAX, "Note"),
});

export type HabitFormValues = z.infer<typeof habitSchema>;

// =============================================================================
// LEARNING SCHEMAS
// =============================================================================

export const learningSubjectSchema = z.object({
  name: boundedRequiredString(LIMITS.TITLE, "Name"),
  description: boundedOptionalString(LIMITS.SUMMARY, "Description"),
});

export type LearningSubjectFormValues = z.infer<typeof learningSubjectSchema>;

export const learningTopicSchema = z.object({
  subject_id: z.string().min(1, "Subject is required"),
  title: boundedRequiredString(LIMITS.TITLE, "Title"),
  status: z.enum([
    LEARNING_STATUS.TO_LEARN,
    LEARNING_STATUS.LEARNING,
    LEARNING_STATUS.PRACTICING,
    LEARNING_STATUS.MASTERED,
  ]),
  core_notes: boundedOptionalString(LIMITS.BODY, "Notes"),
  /**
   * 1–5, matching `CHECK (confidence_score BETWEEN 1 AND 5)` on
   * `learning_topics`. This previously allowed 0–100, so any value the DB
   * would reject still passed client validation and failed on write with a
   * raw Postgres constraint error.
   */
  confidence_score: optionalInt(1, 5, "Confidence"),
  resources: z
    .array(
      z.object({
        name: boundedRequiredString(LIMITS.TITLE, "Resource name"),
        url: urlOrEmpty,
      }),
    )
    .max(50, "At most 50 resources")
    .optional()
    .nullable(),
});

export type LearningTopicFormValues = z.infer<typeof learningTopicSchema>;

// =============================================================================
// NOTE SCHEMAS
// =============================================================================

export const noteSchema = z.object({
  title: boundedOptionalString(LIMITS.TITLE, "Title"),
  content: boundedOptionalString(LIMITS.BODY, "Content"),
  tags: tagList,
  color: hexColor.optional().nullable(),
  is_pinned: z.boolean().optional(),
});

export type NoteFormValues = z.infer<typeof noteSchema>;

/**
 * Only the fields the user edits are validated. The Excalidraw scene itself
 * (`elements`/`app_state`/`files`) is the library's own output and is stored
 * verbatim — re-validating its shape here would break on every upstream
 * element-format change without protecting anything.
 */
export const whiteboardSchema = z.object({
  title: boundedOptionalString(LIMITS.TITLE, "Title"),
  tags: tagList,
  is_pinned: z.boolean().optional(),
});

export type WhiteboardFormValues = z.infer<typeof whiteboardSchema>;

// =============================================================================
// LIFE UPDATE SCHEMAS
// =============================================================================

export const lifeUpdateSchema = z.object({
  title: boundedOptionalString(LIMITS.TITLE, "Title"),
  content: boundedOptionalString(LIMITS.BODY, "Content"),
  category: z
    .enum(["watching", "activity", "photo", "thought", "milestone"])
    .default("thought"),
  image_url: boundedOptionalString(LIMITS.URL, "Image URL"),
  tags: tagList,
  is_pinned: z.boolean().optional(),
  is_published: z.boolean().default(false),
});

export type LifeUpdateFormValues = z.infer<typeof lifeUpdateSchema>;

// =============================================================================
// EVENT SCHEMAS
// =============================================================================

export const eventSchema = z
  .object({
    title: boundedRequiredString(LIMITS.TITLE, "Title"),
    description: boundedOptionalString(LIMITS.SUMMARY, "Description"),
    start_time: z.string().min(1, "Start time is required"),
    end_time: optionalString,
    is_all_day: z.boolean().optional(),
  })
  // An event ending before it starts renders as a zero/negative-width block and
  // breaks the calendar's day grouping.
  .refine((v) => !v.end_time || v.end_time >= v.start_time, {
    message: "End time must be after the start time",
    path: ["end_time"],
  });

export type EventFormValues = z.infer<typeof eventSchema>;

// =============================================================================
// INVENTORY SCHEMAS
// =============================================================================

/**
 * Bounds mirror the CHECK constraints in
 * `db/migrations/005-inventory.sql`.
 */
export const inventoryItemSchema = z
  .object({
    name: boundedRequiredString(LIMITS.TITLE, "Name"),
    category: boundedRequiredString(LIMITS.TITLE, "Category"),
    location: boundedOptionalString(120, "Location"),
    quantity: z.coerce
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(100000, "Quantity is too large")
      .default(1),
    serial_number: boundedOptionalString(LIMITS.TITLE, "Serial number"),
    tags: tagList,
    purchase_date: optionalString,
    warranty_expiry: optionalString,
    purchase_price: z.coerce
      .number()
      .min(0, "Price must be non-negative")
      .max(MONEY_MAX_10_2, "Price is too large"),
    // Left blank means "not appraised" — distinct from a value of zero.
    current_value: optionalMoney(MONEY_MAX_10_2, "Current value"),
    image_url: boundedOptionalString(LIMITS.URL, "Image URL"),
    notes: boundedOptionalString(LIMITS.BODY, "Notes"),
  })
  // Mirrors inventory_warranty_after_purchase. A warranty that ends before the
  // thing was bought is a typo, and the database rejects it either way.
  .refine(
    (data) =>
      !data.purchase_date ||
      !data.warranty_expiry ||
      new Date(String(data.warranty_expiry)) >=
        new Date(String(data.purchase_date)),
    {
      message: "Warranty cannot end before the purchase date",
      path: ["warranty_expiry"],
    },
  );

export type InventoryItemFormValues = z.infer<typeof inventoryItemSchema>;

// =============================================================================
// PORTFOLIO & CONTENT SCHEMAS
// =============================================================================

export const portfolioSectionSchema = z.object({
  title: boundedRequiredString(LIMITS.TITLE, "Title"),
  type: z.enum(["markdown", "list_items", "gallery"]),
  content: boundedOptionalString(LIMITS.BODY, "Content"),
  page_path: z
    .string()
    .trim()
    .min(1, "Page path is required")
    .max(LIMITS.TITLE, "Page path is too long")
    // The catch-all route builds its static params from these, so a path that
    // isn't root-relative produces a page that can never be reached.
    .regex(/^\//, "Page path must start with /"),
  layout_style: z.string().default("default"),
  is_visible: z.boolean().default(true),
});

export type PortfolioSectionFormValues = z.infer<typeof portfolioSectionSchema>;

export const portfolioItemSchema = z.object({
  section_id: z.string().min(1, "Section is required"),
  title: boundedRequiredString(LIMITS.TITLE, "Title"),
  subtitle: boundedOptionalString(LIMITS.TITLE, "Subtitle"),
  date_from: optionalString,
  date_to: optionalString,
  description: boundedOptionalString(LIMITS.BODY, "Description"),
  image_url: boundedOptionalString(LIMITS.URL, "Image URL"),
  link_url: boundedOptionalString(LIMITS.URL, "Link URL"),
  tags: tagList,
  internal_notes: boundedOptionalString(LIMITS.SUMMARY, "Internal notes"),
});

export type PortfolioItemFormValues = z.infer<typeof portfolioItemSchema>;

export const navLinkSchema = z.object({
  label: boundedRequiredString(LIMITS.TITLE, "Label"),
  /**
   * Internal paths only. `[...slug]/generateStaticParams` turns every nav href
   * into a prerendered route by stripping the leading slash, so an absolute URL
   * such as `https://example.com` produced the static path
   * `https:/​/example.com` — a broken page that the build still emitted.
   */
  href: z
    .string()
    .trim()
    .min(1, "Path is required")
    .max(LIMITS.URL, "Path is too long")
    .regex(/^\/[^\s]*$/, "Must be a site path starting with / (e.g. /about)"),
  display_order: z.coerce
    .number()
    .int("Display order must be a whole number")
    .default(0),
  is_visible: z.boolean().default(true),
});

export type NavLinkFormValues = z.infer<typeof navLinkSchema>;

// =============================================================================
// BLOG SCHEMAS
// =============================================================================

export const blogPostSchema = z.object({
  title: boundedRequiredString(LIMITS.TITLE, "Title"),
  // The slug is the public URL and is UNIQUE in the database; the editor
  // already enforced this shape locally, so it belongs in the shared contract.
  slug,
  excerpt: boundedOptionalString(LIMITS.SUMMARY, "Excerpt"),
  content: boundedOptionalString(LIMITS.BODY, "Content"),
  cover_image_url: boundedOptionalString(LIMITS.URL, "Cover image URL"),
  published: z.boolean().default(false),
  published_at: optionalString,
  show_toc: z.boolean().default(true),
  tags: tagList,
  internal_notes: boundedOptionalString(LIMITS.SUMMARY, "Internal notes"),
});

export type BlogPostFormValues = z.infer<typeof blogPostSchema>;

// =============================================================================
// CONTACT FORM SCHEMA
// =============================================================================

export const contactFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

// =============================================================================
// SITE SETTINGS SCHEMAS
// =============================================================================

export const socialLinkSchema = z.object({
  id: z.string(),
  label: z.string().max(LIMITS.TITLE, "Label is too long"),
  // `mailto:`/`tel:` are legitimate here (the "email" link is one), and z.url()
  // accepts them, but the public renderer runs every one through safeLinkUrl.
  url: urlOrEmpty,
  is_visible: z.boolean(),
});

export type SocialLinkFormValues = z.infer<typeof socialLinkSchema>;

export const siteSettingsSchema = z.object({
  portfolio_mode: z.enum(["multi-page", "single-page"]),
  profile_data: z.object({
    name: boundedRequiredString(LIMITS.TITLE, "Name"),
    title: boundedRequiredString(LIMITS.TITLE, "Title"),
    default_theme: z.string(),
    // Fed to hexToHsl() and written straight into CSS custom properties, so a
    // malformed value here silently blanks out the whole custom theme.
    custom_theme_colors: z
      .object({
        background: hexColor.default("#0f172a"),
        foreground: hexColor.default("#e2e8f0"),
        primary: hexColor.default("#0ea5e9"),
        secondary: hexColor.default("#1e293b"),
        accent: hexColor.default("#38bdf8"),
        card: hexColor.default("#1e293b"),
      })
      .optional(),
    description: boundedRequiredString(LIMITS.SUMMARY, "Hero description"),
    profile_picture_url: z
      .string()
      .url("Must be a valid URL")
      .or(z.literal("")),
    show_profile_picture: z.boolean(),
    logo: z.object({
      main: z.string().min(1, "Main logo text is required"),
      highlight: z.string().min(1, "Highlight logo text is required"),
    }),
    bio: z
      .array(z.string().max(LIMITS.BODY, "Bio paragraph is too long"))
      .min(1, "At least one bio paragraph is required"),
    status_panel: z.object({
      show: z.boolean().default(true),
      design: z.enum(["minimal", "terminal", "bento"]).default("minimal"),
      title: z.string(),
      availability: z.string().min(1, "Availability text is required"),
      currently_exploring: z.object({
        title: z.string(),
        items: z
          .array(z.string())
          .transform((items) => items.filter((item) => item.trim() !== "")),
      }),
      latestProject: z.object({
        name: z.string().min(1, "Project name is required"),
        linkText: z.string().min(1, "Link text is required"),
        href: z.string().min(1, "Project URL path is required"),
      }),
    }),
    github_projects_config: z.object({
      username: z.string().min(1, "GitHub username is required."),
      show: z.boolean(),
      sort_by: z.enum(["pushed", "created", "updated"]),
      exclude_forks: z.boolean(),
      exclude_archived: z.boolean(),
      exclude_profile_repo: z.boolean(),
      min_stars: z.coerce.number().min(0, "Cannot be negative."),
      projects_per_page: z.coerce
        .number()
        .min(1, "Must be at least 1.")
        .max(100, "Max is 100."),
    }),
    contact_page: z.object({
      show_contact_form: z.boolean().default(true),
      show_availability_badge: z.boolean().default(true),
      show_services: z.boolean().default(true),
    }),
    updates_layout: z.enum(["timeline", "scrapbook"]).default("scrapbook"),
    typography_preset: z.string().default("typo-default"),
  }),
  social_links: z.array(socialLinkSchema),
  footer_data: z.object({
    copyright_text: boundedRequiredString(LIMITS.SUMMARY, "Copyright text"),
  }),
});

export type SiteSettingsFormValues = z.infer<typeof siteSettingsSchema>;

/** Default values for site settings form */
/**
 * Default values for site settings.
 *
 * The literal lives in `site-identity-defaults.ts` so the public data layer can
 * reuse it without pulling Zod into every route's first load. Annotating it
 * here still type-checks it against the schema.
 */
export const siteSettingsDefaultValues: SiteSettingsFormValues =
  SITE_IDENTITY_DEFAULTS as unknown as SiteSettingsFormValues;
