// Centralized Zod schemas for form validation

import { z } from "zod";
import {
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_RECURRENCE,
  TASK_MINUTES_MAX,
  TASK_RECURRENCE_INTERVAL_MAX,
  LEARNING_STATUS,
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
 * The money ceiling mirrors its DB column width exactly. NUMERIC(10,2) tops out
 * at 99,999,999.99; anything larger is a Postgres `numeric field overflow`,
 * which surfaces to the user as an opaque failure after the form has already
 * told them the value was fine.
 *
 * There were three of these. `MONEY_MAX_12_2` and `MONEY_MAX_18_4` mirrored v1
 * finance columns and went with them — finance v2 stores integer minor units
 * and has its own ceiling, `FIN_MINOR_MAX`, set by what a JavaScript number can
 * hold exactly rather than by a NUMERIC width.
 */
export const MONEY_MAX_10_2 = 99_999_999.99;

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
// FINANCE TEXT BOUNDS
// =============================================================================

/** Bounds on the finance tables' own text columns, from their CHECKs. */
export const FINANCE_LIMITS = {
  /** `char_length(name) BETWEEN 1 AND 120` on finance_accounts. */
  ACCOUNT_NAME: 120,
  /** `char_length(institution) <= 120` */
  INSTITUTION: 120,
  /** `char_length(name) BETWEEN 1 AND 80` on finance_categories. */
  CATEGORY_NAME: 80,
  /** `char_length(icon) <= 40` */
  CATEGORY_ICON: 40,
  /** `char_length(name) BETWEEN 1 AND 120` on finance_scenarios. */
  SCENARIO_NAME: 120,
  /** `char_length(description) <= 2000` on finance_scenarios. */
  SCENARIO_DESCRIPTION: 2_000,
} as const;

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

export const LEARNING_MATERIAL_KINDS = ["reference", "recall", "quiz"] as const;

export const learningTopicSchema = z.object({
  subject_id: z.string().min(1, "Subject is required"),
  title: boundedRequiredString(LIMITS.TITLE, "Title"),
  /**
   * Defaulted, matching the column default, so every form and every existing
   * row that never mentions a kind keeps behaving exactly as it did. A
   * required enum here would have made the field mandatory in a form that has
   * no control for it — which is a save that fails for a reason the writer
   * cannot see.
   */
  kind: z.enum(LEARNING_MATERIAL_KINDS).default("recall"),
  /**
   * 2000 mirrors `learning_topics_prompt_len` / `_answer_len`. A bound the
   * form accepts and the column rejects surfaces as an opaque write failure.
   */
  prompt: boundedOptionalString(2000, "Prompt"),
  answer: boundedOptionalString(2000, "Answer"),
  choices: z.array(boundedRequiredString(500, "Choice")).max(8).optional(),
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

/**
 * Bounds taken from the `events` CHECK constraints, not chosen here.
 *
 * A value the form accepts and Postgres rejects surfaces as an opaque write
 * failure *after* the user has been told the input was fine — so these must
 * track `db/schema.sql`. The calendar rebuild added the columns below without
 * extending this schema, and the sheet was validating nothing but a non-empty
 * title, so a pasted address or a long meeting link failed at the database.
 */
export const EVENT_LIMITS = {
  /** `char_length(location) <= 300` */
  LOCATION: 300,
  /** `char_length(meeting_url) <= 2048` */
  MEETING_URL: 2_048,
  /** `char_length(rrule) <= 500` */
  RRULE: 500,
  /** `travel_minutes BETWEEN 0 AND 1440` — a day. */
  TRAVEL_MINUTES: 1_440,
  /** `reminder_minutes BETWEEN 0 AND 40320` — four weeks. */
  REMINDER_MINUTES: 40_320,
} as const;

export const eventSchema = z
  .object({
    title: boundedRequiredString(LIMITS.TITLE, "Title"),
    description: boundedOptionalString(LIMITS.SUMMARY, "Description"),
    start_time: z.string().min(1, "Start time is required"),
    end_time: optionalString,
    is_all_day: z.boolean().optional(),
    location: boundedOptionalString(EVENT_LIMITS.LOCATION, "Location"),
    meeting_url: boundedOptionalString(
      EVENT_LIMITS.MEETING_URL,
      "Meeting link",
    ),
    rrule: boundedOptionalString(EVENT_LIMITS.RRULE, "Repeat rule"),
    calendar_id: z.string().uuid("Pick a real calendar").optional().nullable(),
    // Mirrors the column's CHECK exactly; a token outside this set renders
    // with no colour at all rather than falling back.
    color_token: z
      .enum(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"])
      .optional()
      .nullable(),
    status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
    travel_minutes: optionalInt(0, EVENT_LIMITS.TRAVEL_MINUTES, "Travel time"),
    reminder_minutes: optionalInt(0, EVENT_LIMITS.REMINDER_MINUTES, "Reminder"),
    task_id: z.string().uuid().optional().nullable(),
  })
  // An event ending before it starts renders as a zero/negative-width block and
  // breaks the calendar's day grouping.
  .refine((v) => !v.end_time || v.end_time >= v.start_time, {
    message: "End time must be after the start time",
    path: ["end_time"],
  });

export type EventFormValues = z.infer<typeof eventSchema>;

/**
 * A calendar. `name` is bounded 1..80 by the column, and the sidebar checked
 * only that it was non-empty — so a long name failed at the database with
 * nothing to tell the user which field was at fault.
 */
export const CALENDAR_LIMITS = {
  /** `char_length(name) BETWEEN 1 AND 80` */
  NAME: 80,
  /** `char_length(home_timezone) <= 64` on calendar_settings. */
  TIMEZONE: 64,
} as const;

export const calendarSchema = z.object({
  name: boundedRequiredString(CALENDAR_LIMITS.NAME, "Calendar name"),
  color_token: z.enum(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]),
  is_visible: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type CalendarFormValues = z.infer<typeof calendarSchema>;

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
  show_title: z.boolean().default(true),
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
  /**
   * The item this one fed into, for the timeline layout.
   *
   * Nullable and unvalidated beyond being a string: the database holds the
   * foreign key and a trigger rejects loops, which is the right place for both
   * — the client can only prevent the cycles it thinks of.
   */
  merged_into_id: z.string().nullable().optional(),
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

/**
 * The one form an unauthenticated visitor can write to the database from.
 *
 * Every field had a floor and no ceiling, and the columns are TEXT, so a
 * visitor could insert a row of any size — and the INSERT policy is
 * `WITH CHECK (true)`. These bounds are mirrored by a CHECK constraint in
 * `db/schema.sql`; the database copy is the one that holds when the request
 * does not come from this form at all.
 */
export const CONTACT_LIMITS = {
  NAME: 200,
  /** RFC 5321 caps an address at 320 characters. */
  EMAIL: 320,
  SUBJECT: 200,
  MESSAGE: 5_000,
} as const;

export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(CONTACT_LIMITS.NAME, "Name is too long"),
  email: z
    .string()
    .trim()
    .max(CONTACT_LIMITS.EMAIL, "Email is too long")
    .email("Please enter a valid email address"),
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(CONTACT_LIMITS.SUBJECT, "Subject is too long"),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(
      CONTACT_LIMITS.MESSAGE,
      `Message must be ${CONTACT_LIMITS.MESSAGE.toLocaleString()} characters or fewer`,
    ),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

// =============================================================================
// SITE SETTINGS SCHEMAS
// =============================================================================

export const socialLinkSchema = z.object({
  // Doubles as the lookup key into SOCIAL_ICONS and as the React key, so a
  // blank id would collapse two rows onto one another in the editor.
  id: boundedRequiredString(LIMITS.TAG, "Link id"),
  label: boundedRequiredString(LIMITS.TITLE, "Label"),
  // `mailto:`/`tel:` are legitimate here (the "email" link is one), and z.url()
  // accepts them, but the public renderer runs every one through safeLinkUrl.
  url: urlOrEmpty,
  is_visible: z.boolean(),
});

export type SocialLinkFormValues = z.infer<typeof socialLinkSchema>;

/**
 * How many entries each open-ended list may hold.
 *
 * These used to be implicit and wrong in both directions: `bio` and
 * `currently_exploring.items` were capped at exactly two by the number of
 * inputs the form drew (`BIO_SLOTS`, `EXPLORING_SLOTS`), which is form layout
 * deciding content shape, while the arrays themselves had no ceiling at all in
 * the schema. Now the ceiling is in the contract and the form draws whatever
 * the contract allows.
 */
export const SITE_LIST_LIMITS = {
  BIO_PARAGRAPHS: 6,
  EXPLORING_ITEMS: 8,
  SOCIAL_LINKS: 12,
  /** The hero's results strip reads as a row; four is a row. */
  PROOF_POINTS: 4,
} as const;

/**
 * A list of short strings that drops blanks on the way through.
 *
 * The editor keeps an empty row while you are typing into it; persisting that
 * row would render an empty paragraph or an empty bullet on the public site.
 */
const trimmedList = (max: number, count: number, label: string) =>
  z
    .array(z.string().max(max, `${label} is too long`))
    .max(count, `At most ${count} ${label.toLowerCase()} entries`)
    .transform((items) => items.filter((item) => item.trim() !== ""));

export const siteSettingsSchema = z.object({
  portfolio_mode: z.enum(["multi-page", "single-page"]),
  profile_data: z.object({
    name: boundedRequiredString(LIMITS.TITLE, "Name"),
    title: boundedRequiredString(LIMITS.TITLE, "Title"),
    default_theme: boundedRequiredString(LIMITS.TAG, "Theme"),
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
    headline: z.string().max(LIMITS.TITLE, "Headline is too long").default(""),
    proof: z
      .array(
        z.object({
          value: z
            .string()
            .trim()
            .min(1, "Add the figure")
            .max(24, "Keep the figure to 24 characters"),
          label: z
            .string()
            .trim()
            .min(1, "Say what the figure measures")
            .max(LIMITS.TITLE, "Label is too long"),
        }),
      )
      .max(
        SITE_LIST_LIMITS.PROOF_POINTS,
        `At most ${SITE_LIST_LIMITS.PROOF_POINTS} results`,
      )
      .default([]),
    profile_picture_url: urlOrEmpty,
    show_profile_picture: z.boolean(),
    // Optional because a fresh install has neither, and a required field in one
    // group must not be what stops an unrelated group from saving.
    logo: z.object({
      main: z.string().max(LIMITS.TITLE, "Logo text is too long"),
      highlight: z.string().max(LIMITS.TITLE, "Logo highlight is too long"),
    }),
    bio: trimmedList(LIMITS.BODY, SITE_LIST_LIMITS.BIO_PARAGRAPHS, "Bio"),
    status_panel: z.object({
      show: z.boolean().default(true),
      design: z.enum(["minimal", "terminal", "bento"]).default("minimal"),
      title: z.string().max(LIMITS.TITLE, "Panel title is too long"),
      availability: z
        .string()
        .max(LIMITS.TITLE, "Availability text is too long"),
      currently_exploring: z.object({
        title: z.string().max(LIMITS.TITLE, "Heading is too long"),
        items: trimmedList(
          LIMITS.TITLE,
          SITE_LIST_LIMITS.EXPLORING_ITEMS,
          "Exploring",
        ),
      }),
      latestProject: z.object({
        name: z.string().max(LIMITS.TITLE, "Project name is too long"),
        linkText: z.string().max(LIMITS.TITLE, "Link text is too long"),
        // A path such as "/projects", not an absolute URL — safeLinkUrl allows
        // both and the renderer decides whether to open a new tab.
        href: z.string().max(LIMITS.URL, "Project URL is too long"),
      }),
    }),
    github_projects_config: z
      .object({
        username: z.string().max(LIMITS.TITLE, "Username is too long"),
        show: z.boolean(),
        sort_by: z.enum(["pushed", "created", "updated"]),
        exclude_forks: z.boolean(),
        exclude_archived: z.boolean(),
        exclude_profile_repo: z.boolean(),
        min_stars: z.coerce.number().int().min(0, "Cannot be negative."),
        projects_per_page: z.coerce
          .number()
          .int()
          .min(1, "Must be at least 1.")
          .max(100, "Max is 100."),
      })
      // Required only when the section is switched on. Demanding a username
      // from someone who has turned GitHub off is how one group's field ends
      // up blocking every other group's save.
      .superRefine((config, ctx) => {
        if (config.show && config.username.trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["username"],
            message: "GitHub username is required while the section is shown.",
          });
        }
      }),
    contact_page: z.object({
      show_contact_form: z.boolean().default(true),
      show_availability_badge: z.boolean().default(true),
      show_services: z.boolean().default(true),
    }),
    updates_layout: z.enum(["timeline", "scrapbook"]).default("scrapbook"),
    typography_preset: boundedRequiredString(LIMITS.TAG, "Typography preset"),
  }),
  social_links: z
    .array(socialLinkSchema)
    .max(
      SITE_LIST_LIMITS.SOCIAL_LINKS,
      `At most ${SITE_LIST_LIMITS.SOCIAL_LINKS} social links`,
    )
    .superRefine((links, ctx) => {
      const seen = new Set<string>();
      links.forEach((link, index) => {
        const key = link.id.trim().toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "id"],
            message: "Each link needs its own id.",
          });
        }
        seen.add(key);
      });
    }),
  footer_data: z.object({
    copyright_text: z
      .string()
      .max(LIMITS.SUMMARY, "Copyright text is too long"),
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

// =============================================================================
// DISCOVER SCHEMAS
// =============================================================================

/**
 * Bounds from the `discover_places` and `discover_topics` CHECK constraints.
 *
 * The coordinate ranges are the interesting ones: a typed longitude of 720 is
 * not a place, and without this it reaches Postgres as a constraint violation
 * the form cannot explain.
 */
export const DISCOVER_LIMITS = {
  /** `char_length(label) BETWEEN 1 AND 80` */
  PLACE_LABEL: 80,
  /** `char_length(term) BETWEEN 1 AND 80` */
  TOPIC_TERM: 80,
  /** `char_length(timezone) <= 64` */
  TIMEZONE: 64,
} as const;

export const discoverPlaceSchema = z.object({
  label: boundedRequiredString(DISCOVER_LIMITS.PLACE_LABEL, "Name"),
  latitude: z
    .number({ invalid_type_error: "Latitude must be a number" })
    .finite("Latitude must be a number")
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  longitude: z
    .number({ invalid_type_error: "Longitude must be a number" })
    .finite("Longitude must be a number")
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  timezone: boundedOptionalString(DISCOVER_LIMITS.TIMEZONE, "Timezone"),
  sort_order: z.number().int().optional(),
});

export const discoverTopicSchema = z.object({
  term: boundedRequiredString(DISCOVER_LIMITS.TOPIC_TERM, "Topic"),
  // Mirrors the column's CHECK exactly. A source the app cannot fetch would
  // render a panel that never fills.
  source: z.enum(["hackernews", "devto"]),
  sort_order: z.number().int().optional(),
});

export type DiscoverPlaceFormValues = z.infer<typeof discoverPlaceSchema>;
export type DiscoverTopicFormValues = z.infer<typeof discoverTopicSchema>;

// ─── Library ──────────────────────────────────────────────────────────────

export const LIBRARY_KINDS = [
  "book",
  "article",
  "video",
  "podcast",
  "other",
] as const;

export const LIBRARY_STATUSES = [
  "want",
  "in_progress",
  "done",
  "abandoned",
] as const;

/** Mirrors the CHECK constraints in db/migrations/018. */
export const LIBRARY_LIMITS = {
  TITLE: 200,
  CREATOR: 200,
  URL: 2_048,
  NOTES: 2_000,
  TEXT: 2_000,
  ATTRIBUTION: 200,
  LOCATION: 50,
} as const;

export const librarySourceSchema = z
  .object({
    kind: z.enum(LIBRARY_KINDS),
    title: boundedRequiredString(LIBRARY_LIMITS.TITLE, "Title"),
    creator: boundedOptionalString(LIBRARY_LIMITS.CREATOR, "Author"),
    /**
     * A web link only. It is rendered as a citation link on the public site,
     * so a `javascript:` value must never get as far as the database.
     */
    url: boundedOptionalString(LIBRARY_LIMITS.URL, "Link").refine(
      (value) => !value || /^https?:\/\/\S+$/i.test(value.trim()),
      "Use a full link starting with https://",
    ),
    status: z.enum(LIBRARY_STATUSES),
    rating: optionalInt(1, 5, "Rating"),
    notes: boundedOptionalString(LIBRARY_LIMITS.NOTES, "Notes"),
    started_on: optionalString,
    finished_on: optionalString,
  })
  .superRefine((value, ctx) => {
    // Mirrors `library_sources_dates_ordered`, so the form says it rather than
    // the database refusing it opaquely.
    if (
      value.started_on &&
      value.finished_on &&
      value.finished_on < value.started_on
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finished_on"],
        message: "Finished before it was started",
      });
    }
  });

export type LibrarySourceFormValues = z.infer<typeof librarySourceSchema>;

export const libraryHighlightSchema = z.object({
  source_id: z.string().nullable().optional(),
  text: boundedRequiredString(LIBRARY_LIMITS.TEXT, "The line"),
  attribution: boundedOptionalString(LIBRARY_LIMITS.ATTRIBUTION, "Attribution"),
  location: boundedOptionalString(LIBRARY_LIMITS.LOCATION, "Where"),
  note: boundedOptionalString(LIBRARY_LIMITS.NOTES, "Note"),
  is_public: z.boolean(),
  is_favorite: z.boolean(),
});

export type LibraryHighlightFormValues = z.infer<typeof libraryHighlightSchema>;

// ─── Finance v2 ──────────────────────────────────────────────────────────────

/**
 * Mirrors the CHECK constraints in db/migrations/025, 026 and 027, and the
 * matching FINANCE v2 section of db/schema.sql.
 *
 * `FINANCE_LIMITS` above is reused wherever v2 kept v1's width — account name
 * and institution at 120, category name at 80, its icon at 40, scenario name at
 * 120 and description at 2,000 — so those are deliberately absent here. What
 * follows is only the bounds v1 had no equivalent for.
 */
export const FIN_LIMITS = {
  COMMITMENT_NAME: 200,
  LENDER: 120,
  NOTES: 2_000,
  EVENT_NOTE: 300,
  TRANSACTION_DESCRIPTION: 200,
  RAW_DESCRIPTION: 500,
  MERCHANT: 200,
  GOAL_NAME: 200,
  GOAL_DESCRIPTION: 2_000,
  CONTRIBUTION_NOTE: 300,
  SKIP_REASON: 200,
  RULE_PATTERN_MIN: 2,
  RULE_PATTERN_MAX: 120,
  IMPORT_FILE_NAME: 255,
  IMPORT_FORMAT: 40,
  RATE_MAX: 100,
  TENURE_MIN: 1,
  TENURE_MAX: 600,
} as const;

/**
 * The ceiling on any single amount, in minor units.
 *
 * The column is BIGINT and would accept far more, but a minor amount is a
 * JavaScript number on its way through the client, so anything past 2^53−1
 * cannot round-trip: it would read back as a *different* number with nothing to
 * indicate it had changed. Rejecting it is strictly better than storing it.
 *
 * Restated here rather than imported from
 * `src/features/finance/money/minor-units.ts`. This file is shared
 * infrastructure that `publicApi` can reach, and the module's dependency
 * direction is `ui → domain → money` — never back out into `lib`.
 * `src/lib/schemas-fin.test.ts` asserts the two constants agree, which is the
 * same arrangement the currency table uses.
 */
export const FIN_MINOR_MAX = 9_007_199_254_740_991;

/**
 * A signed amount in whole minor units. 1234 is $12.34.
 *
 * Deliberately **not** `money()` above, which refines to two decimal places —
 * true of every v1 NUMERIC(_,2) column and wrong for a module that supports the
 * yen (no minor unit) and the Kuwaiti dinar (three). By the time a value reaches
 * here it has already been through `fromDecimal` in the money layer, which is
 * the only place that knows a currency's exponent, so what is left to check is
 * that the integer is one both the column and the client can hold exactly.
 */
export const finMinor = (label = "Amount") =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number of minor units`)
    .min(-FIN_MINOR_MAX, `${label} is too large`)
    .max(FIN_MINOR_MAX, `${label} is too large`);

/** Minor units that must be more than nothing, per the column's `> 0` CHECK. */
export const finMinorPositive = (label = "Amount") =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number of minor units`)
    .positive(`${label} must be more than zero`)
    .max(FIN_MINOR_MAX, `${label} is too large`);

/**
 * `CHAR(3) REFERENCES fin_currency(code)` — an ISO 4217 code, never a symbol.
 * CHAR(3) truncates rather than rejecting, so a longer value would be stored
 * silently mangled, which is worse than an error.
 */
export const finCurrency = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Currency must be a three-letter code, like CAD");

export const FIN_ACCOUNT_KINDS = [
  "chequing",
  "savings",
  "credit",
  "cash",
  "investment",
  "loan",
] as const;

export const FIN_BUCKETS = [
  "income",
  "need",
  "want",
  "save",
  "transfer",
] as const;

/**
 * An account, including its reconciliation anchor.
 *
 * Supersedes `accountReconcileSchema` for v2 — and that schema's existence is
 * worth a note, because v1's account form never used it: it validated the same
 * two fields by hand against `MONEY_MAX_18_4` and checked nothing else at all,
 * so a name past the column's 120 characters reached Postgres and came back as
 * an opaque failed save. Every field the form collects is bounded here.
 */
export const finAccountSchema = z.object({
  name: boundedRequiredString(FINANCE_LIMITS.ACCOUNT_NAME, "Name"),
  kind: z.enum(FIN_ACCOUNT_KINDS),
  currency: finCurrency,
  institution: boundedOptionalString(FINANCE_LIMITS.INSTITUTION, "Bank"),
  // Signed: a card or a loan is stored as what is owed, so the ledger
  // arithmetic stays uniform and net worth need not know which kind it holds.
  opening_balance_minor: finMinor("Balance"),
  opening_date: dateString,
  // The column is `credit_limit_minor > 0`, so zero is not "no limit" — null
  // is, and a blank field must become null rather than coercing to 0.
  credit_limit_minor: z.preprocess(
    blankToNull,
    finMinorPositive("Credit limit").nullable(),
  ),
  statement_day: optionalInt(1, 31, "Statement day"),
  payment_due_day: optionalInt(1, 31, "Payment day"),
  is_liquid: z.boolean(),
});

export type FinAccountFormValues = z.infer<typeof finAccountSchema>;

/**
 * A v2 category. `bucket` classifies the category for 50/30/20; it is not a
 * direction, which comes from the sign of each posting.
 */
export const finCategorySchema = z.object({
  name: boundedRequiredString(FINANCE_LIMITS.CATEGORY_NAME, "Category name"),
  bucket: z.enum(FIN_BUCKETS),
  icon: boundedOptionalString(FINANCE_LIMITS.CATEGORY_ICON, "Icon"),
  color: z.preprocess(blankToNull, hexColor.nullable()),
  // Essential in the runway sense — still payable if income stopped tomorrow —
  // and deliberately distinct from the `need` bucket, which is about budgeting.
  is_essential: z.boolean().default(false),
});

export type FinCategoryFormValues = z.infer<typeof finCategorySchema>;

/**
 * Whether a string is a decimal figure at all.
 *
 * The grammar matches `fromDecimal`'s in the money layer — an optional sign,
 * digits with an optional fractional part, and separators (space, comma,
 * underscore) ignored — so a form built on this can neither reject something the
 * parser would have accepted nor accept something it would throw on.
 *
 * Deliberately silent about how many decimal places are allowed. That depends on
 * the currency: the yen has no minor unit and the Kuwaiti dinar has three. That
 * knowledge lives in `src/features/finance/money`, which converts and rounds on
 * submit, and restating it here would put a second rounding rule in a second
 * place — the class of defect this rewrite exists to remove.
 */
const looksLikeDecimal = (value: string) =>
  /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value.replace(/[\s,_]/g, ""));

/** A decimal figure as typed, required. */
export const decimalText = (label = "Amount") =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine(looksLikeDecimal, `${label} must be a number`);

/** The same, where blank means "not set" rather than zero. */
export const optionalDecimalText = (label = "Amount") =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || looksLikeDecimal(value),
      `${label} must be a number`,
    );

/**
 * An amount that is a magnitude, not a direction.
 *
 * `looksLikeDecimal` accepts a leading sign, which is right for a balance — a
 * credit card's is negative and typing it that way is how you say so. It is
 * wrong for every field that means "how much moved": direction there comes from
 * which accounts the movement names, never from a minus sign.
 *
 * Left unguarded, "-100" in a transfer's amount produced two postings on the
 * *same* side, and the database rejected the whole write with "a transfer needs
 * money leaving one account and arriving in another" — a P0001 that reached the
 * screen as raw JSON. The constraint was right; the form should never have been
 * able to ask that question.
 */
export const positiveDecimalText = (label = "Amount") =>
  decimalText(label).refine(
    (value) => Number(value.replace(/[\s,_]/g, "")) > 0,
    `${label} must be more than zero`,
  );

/** The optional form of the same rule. */
export const optionalPositiveDecimalText = (label = "Amount") =>
  optionalDecimalText(label).refine(
    (value) => value === "" || Number(value.replace(/[\s,_]/g, "")) > 0,
    `${label} must be more than zero`,
  );

/**
 * What the account form collects, before the money layer converts it.
 *
 * `finAccountSchema` above is the *column* contract and speaks in minor units;
 * this is the form's own shape, with the two money fields as typed text. Both
 * live here rather than one being declared inside the component, so there is a
 * single place to look for what an account is allowed to be.
 *
 * On submit the component converts `balance` and `credit_limit` with
 * `fromDecimal` and validates the assembled row against `finAccountSchema`, so
 * the column's bounds are enforced at the write and not merely at the keyboard.
 */
export const finAccountFormSchema = z.object({
  name: boundedRequiredString(FINANCE_LIMITS.ACCOUNT_NAME, "Name"),
  kind: z.enum(FIN_ACCOUNT_KINDS),
  currency: finCurrency,
  institution: boundedOptionalString(FINANCE_LIMITS.INSTITUTION, "Bank"),
  /**
   * Entered as a positive figure for a card or a loan — "1,200" means you owe
   * 1,200 — and the component applies the sign, so the ledger stays uniform.
   */
  balance: decimalText("Balance"),
  opening_date: dateString,
  credit_limit: optionalDecimalText("Credit limit"),
  statement_day: optionalInt(1, 31, "Statement day"),
  payment_due_day: optionalInt(1, 31, "Payment day"),
  is_liquid: z.boolean(),
});

export type FinAccountFormInput = z.infer<typeof finAccountFormSchema>;

/**
 * One transaction, as the form collects it.
 *
 * `direction` replaces v1's `type` of earning-or-expense, and it is a *form*
 * field rather than a stored one: v2 reads direction from the sign of a posting,
 * so this decides which way the amount is written and then stops existing. The
 * `kind` column that does get stored is for display and the calendar only, and
 * no arithmetic reads it.
 */
export const finTransactionFormSchema = z.object({
  direction: z.enum(["out", "in"]),
  description: boundedRequiredString(
    FIN_LIMITS.TRANSACTION_DESCRIPTION,
    "Description",
  ),
  amount: decimalText("Amount"),
  date: dateString,
  /**
   * Nullable, and that is a real state rather than an oversight: a posting with
   * no account still shows in the ledger but moves no balance, which is what an
   * import row looks like before it is assigned.
   */
  account_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  /**
   * The posting's own currency — usually the account's, and different only for a
   * foreign purchase on a card issued elsewhere. Stated explicitly because v1
   * left it null and had a database trigger infer it, which meant two places had
   * an opinion about the same value.
   */
  currency: finCurrency,
  notes: boundedOptionalString(FIN_LIMITS.NOTES, "Note"),
  is_pending: z.boolean(),
});

export type FinTransactionFormInput = z.infer<typeof finTransactionFormSchema>;

/**
 * A transfer between the owner's own accounts, as the form collects it.
 *
 * Note what is **not** enforced here: whether `amount_in` is required. That
 * depends on whether the two accounts share a currency — derived when they do,
 * observed when they do not — and a field schema cannot see the accounts.
 * `buildTransfer` in `features/finance/ledger/transfer.ts` owns that rule, and
 * restating it here would put one rule in two places that can disagree.
 */
export const finTransferFormSchema = z
  .object({
    from_account_id: z.string().uuid("Choose the account the money leaves"),
    to_account_id: z.string().uuid("Choose the account it arrives in"),
    /** In the sending account's currency. */
    amount_out: positiveDecimalText("Amount sent"),
    /** What actually arrived, from the confirmation. Blank when same-currency. */
    amount_in: optionalPositiveDecimalText("Amount received"),
    /** Charged by the provider, in the sending currency. Blank means none. */
    fee: optionalPositiveDecimalText("Fee"),
    date: dateString,
    description: boundedOptionalString(
      FIN_LIMITS.TRANSACTION_DESCRIPTION,
      "Note",
    ),
  })
  .superRefine((value, ctx) => {
    // Mirrors `fin_commitment_distinct_accounts` and the transfer trigger's
    // "two different accounts" check, so the form says it rather than the
    // database refusing the write opaquely.
    if (value.from_account_id === value.to_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to_account_id"],
        message: "A transfer needs two different accounts",
      });
    }
  });

export type FinTransferFormInput = z.infer<typeof finTransferFormSchema>;

export const FIN_FREQUENCIES = [
  "daily",
  "weekly",
  "bi-weekly",
  "monthly",
  "yearly",
] as const;

export const FIN_COMMITMENT_KINDS = ["fixed", "amortising"] as const;

/** A percentage rate, `NUMERIC(6,3)` bounded 0–100 by the column. */
const finRate = z.preprocess(
  blankToNull,
  z.coerce
    .number({ invalid_type_error: "Rate must be a number" })
    .min(0, "Rate cannot be negative")
    .max(FIN_LIMITS.RATE_MAX, "Rate must be 100% or less")
    .nullable(),
);

/**
 * Something that repeats — a subscription, a salary, a mortgage.
 *
 * One schema for what v1 split across a recurring rule and a loan, because the
 * database now has one table for them. Every refinement below mirrors a CHECK in
 * migration 026 rather than approximating it: a form looser than its column
 * produces an opaque failed save, and one stricter refuses rows the database
 * would have accepted.
 *
 * Money is typed text here and converted by `fromDecimal` on submit, as in the
 * account and transaction forms — the money layer owns exponents.
 */
export const finCommitmentFormSchema = z
  .object({
    name: boundedRequiredString(FIN_LIMITS.COMMITMENT_NAME, "Name"),
    kind: z.enum(FIN_COMMITMENT_KINDS),
    currency: finCurrency,

    /**
     * Direction, read from the accounts rather than a type column. Both set is
     * a transfer between the owner's own accounts — the case v1 could not
     * express, so its forecast watched money leave and never arrive.
     */
    from_account_id: z.string().uuid().nullable(),
    to_account_id: z.string().uuid().nullable(),
    category_id: z.string().uuid().nullable(),

    /** Fixed commitments only. */
    amount: optionalDecimalText("Amount"),

    /** Amortising commitments only. */
    principal: optionalDecimalText("Principal"),
    annual_rate: finRate,
    tenure_months: optionalInt(
      FIN_LIMITS.TENURE_MIN,
      FIN_LIMITS.TENURE_MAX,
      "Tenure",
    ),
    rate_type: z.enum(["fixed", "floating"]).nullable(),
    on_rate_change: z.enum(["tenure", "emi"]).nullable(),
    lender: boundedOptionalString(FIN_LIMITS.LENDER, "Lender"),

    frequency: z.enum(FIN_FREQUENCIES),
    start_date: dateString,
    end_date: z.preprocess(blankToNull, dateString.nullable()),
    /**
     * Overloaded by frequency: day-of-week for weekly and bi-weekly,
     * day-of-month for monthly, unused otherwise. Nullable rather than
     * optional, because Sunday is `0` and an undefined makes the field
     * uncontrolled.
     */
    occurrence_day: optionalInt(0, 31, "Occurrence day"),

    auto_post: z.boolean(),
    is_estimate: z.boolean(),

    /** "The mortgage replaced the tenancy", recorded rather than remembered. */
    supersedes_id: z.string().uuid().nullable(),
    notes: boundedOptionalString(FIN_LIMITS.NOTES, "Notes"),
  })
  .superRefine((value, ctx) => {
    // `fin_commitment_has_an_account`: money has to move somewhere.
    if (!value.from_account_id && !value.to_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from_account_id"],
        message: "Choose where the money comes from, goes to, or both",
      });
    }

    // `fin_commitment_distinct_accounts`.
    if (
      value.from_account_id &&
      value.to_account_id &&
      value.from_account_id === value.to_account_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to_account_id"],
        message: "A transfer needs two different accounts",
      });
    }

    // `fin_commitment_shape`: each kind carries its own fields and not the
    // other's. A fixed commitment with a principal would be rejected by the
    // column, and the reader would see only that the save failed.
    if (value.kind === "fixed") {
      if (!value.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "How much is it each time?",
        });
      }
    } else {
      if (!value.principal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["principal"],
          message: "How much was borrowed?",
        });
      }
      if (value.annual_rate === null || value.annual_rate === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["annual_rate"],
          message: "What rate is it at?",
        });
      }
      if (value.tenure_months === null || value.tenure_months === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenure_months"],
          message: "Over how many months?",
        });
      }
    }

    // `fin_commitment_occurrence_day_fits_frequency`. v1 left this to Zod alone
    // and said so in a comment; the column enforces it now, so the form has to
    // agree with it exactly.
    const day = value.occurrence_day;
    if (day !== null && day !== undefined) {
      if (value.frequency === "daily" || value.frequency === "yearly") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["occurrence_day"],
          message: "A daily or yearly commitment has no particular day",
        });
      }
      if (
        (value.frequency === "weekly" || value.frequency === "bi-weekly") &&
        day > 6
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["occurrence_day"],
          message: "Pick a day of the week",
        });
      }
      if (value.frequency === "monthly" && day < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["occurrence_day"],
          message: "Pick a day of the month, from 1 to 31",
        });
      }
    }

    // `fin_commitment_ends_after_it_starts`. A rule that ends before it begins
    // projects nothing and silently does nothing, which is worse than refused.
    if (value.end_date && value.end_date < value.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_date"],
        message: "It cannot end before it starts",
      });
    }
  });

export type FinCommitmentFormInput = z.infer<typeof finCommitmentFormSchema>;

/**
 * A monthly cap on one category.
 *
 * `period` is the first of a month, mirroring
 * `fin_budget_period_is_a_month CHECK (date_trunc('month', period) = period)`.
 * The form never lets anyone type it — it comes from the month being viewed —
 * but a schema that accepts the 14th would let a bad caller write a row that
 * `buildBudgetPeriod` then silently never matches, because the lookup is by
 * exact key.
 *
 * The amount may be zero. `amount_minor >= 0` on the column, and "budget nothing
 * for this" is a real intention — distinct from having no budget at all, which
 * is the absence of the row.
 */
export const finBudgetFormSchema = z.object({
  category_id: z.string().uuid("Pick a category"),
  period: z.string().regex(/^\d{4}-\d{2}-01$/, "A budget covers a whole month"),
  amount: decimalText("Budget"),
  currency: finCurrency,
  rollover: z.boolean(),
});

export type FinBudgetFormInput = z.infer<typeof finBudgetFormSchema>;

export const FIN_GOAL_KINDS = ["save", "payoff", "buffer"] as const;

/**
 * Something you are saving towards.
 *
 * The target is **strictly positive**, matching `target_minor > 0`. v1 had no
 * such check, and a zero target produced "NaN%" on screen and a goal that
 * claimed to be complete while holding nothing. The amount arrives as decimal
 * text and is converted by the money layer, so the positivity is asserted on the
 * text here and again on the minor units at the call site.
 */
export const finGoalFormSchema = z
  .object({
    name: boundedRequiredString(FIN_LIMITS.GOAL_NAME, "Name"),
    description: boundedOptionalString(
      FIN_LIMITS.GOAL_DESCRIPTION,
      "Description",
    ),
    target: decimalText("Target"),
    currency: finCurrency,
    // Same shape the commitment form uses for an optional date: an empty input
    // is `null`, not the string "", which the DATE column would reject.
    target_date: z.preprocess(blankToNull, dateString.nullable()),
    account_id: z.string().uuid().nullable(),
    kind: z.enum(FIN_GOAL_KINDS).nullable(),
  })
  .superRefine((value, ctx) => {
    if (Number(value.target) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: "A goal of nothing is not a goal",
      });
    }
  });

export type FinGoalFormInput = z.infer<typeof finGoalFormSchema>;

/**
 * Money set aside, or taken back out.
 *
 * Signed, and **never zero** — `amount_minor <> 0` on the column. A zero
 * contribution is a row that records nothing having happened, which is noise in
 * a history whose whole purpose is to explain a balance.
 *
 * Whether a withdrawal is *allowed* is not decided here: it depends on the
 * goal's balance, which a form-level schema cannot see. `canWithdraw` answers it
 * before the write and the constraint trigger from migration 027 is the
 * authority.
 */
export const finContributionFormSchema = z.object({
  amount: decimalText("Amount"),
  occurred_on: dateString,
  account_id: z.string().uuid().nullable(),
  note: boundedOptionalString(FIN_LIMITS.CONTRIBUTION_NOTE, "Note"),
});

export type FinContributionFormInput = z.infer<
  typeof finContributionFormSchema
>;
