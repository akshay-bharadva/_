export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Layout spacing constants
export const LAYOUT = {
  SIDEBAR_WIDTH: 256,
  SIDEBAR_COLLAPSED_WIDTH: 64,
  HEADER_HEIGHT: 64,
  PAGE_PADDING: {
    mobile: 16,
    desktop: 24,
  },
  CONTENT_MAX_WIDTH: 1400,
} as const;

// Public page layout constants
export const PUBLIC_LAYOUT = {
  PAGE_PADDING_Y: {
    mobile: "py-12",
    tablet: "md:py-16",
    desktop: "lg:py-20",
  },
  SECTION_SPACING: {
    tight: "space-y-8",
    default: "space-y-12",
    loose: "space-y-16",
  },
  MAX_WIDTH: {
    narrow: "max-w-3xl", // About, single-column content
    default: "max-w-5xl", // Most pages
    wide: "max-w-6xl", // Projects, galleries
    full: "max-w-7xl", // Homepage, wide layouts
  },
} as const;

// Admin manager layout constants
export const ADMIN_MANAGER = {
  HEADER_SPACING: "space-y-4",
  CONTENT_SPACING: "space-y-6",
  CARD_PADDING: {
    mobile: "p-4",
    desktop: "md:p-6",
  },
  MOBILE_BOTTOM_PADDING: "pb-20 md:pb-0", // Account for mobile nav
} as const;

// Component spacing constants
export const COMPONENT_SPACING = {
  HERO_SECTION: "py-16 lg:py-32",
  SECTION_GAP: "gap-12 lg:gap-16",
  CARD_GAP: "gap-4 md:gap-6",
} as const;

// Breakpoints (align with Tailwind)
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;
export const HABIT_WINDOW_DAYS = 14;
export const HABIT_LOGS_LOOKBACK_DAYS = 30;
export const LEARNING_SESSIONS_LIMIT = 100;
export const STREAK_ALIVE_THRESHOLD_DAYS = 1;
export const DAY_OF_WEEK_MIN = 0;
export const DAY_OF_WEEK_MAX = 6;
export const DAY_OF_MONTH_MIN = 1;
export const DAY_OF_MONTH_MAX = 31;

export const BUCKET_NAME = process.env.NEXT_PUBLIC_BUCKET_NAME || "assets";

export const NOTE_COLORS = [
  "#f87171", // red
  "#fb923c", // orange
  "#facc15", // yellow
  "#4ade80", // green
  "#22d3ee", // cyan
  "#60a5fa", // blue
  "#c084fc", // purple
  "#818cf8", // indigo
] as const;

export const HABIT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
] as const;

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--accent))",
] as const;

export const DEFAULT_HABIT_COLOR = "#3b82f6";

export const TASK_STATUS = {
  TODO: "todo",
  IN_PROGRESS: "inprogress",
  DONE: "done",
} as const;

export type TaskStatusValue = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_STATUS_OPTIONS = [
  { value: TASK_STATUS.TODO, label: "To Do" },
  { value: TASK_STATUS.IN_PROGRESS, label: "In Progress" },
  { value: TASK_STATUS.DONE, label: "Done" },
] as const;

export const TASK_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type TaskPriorityValue =
  (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];

export const TASK_PRIORITY_OPTIONS = [
  { value: TASK_PRIORITY.LOW, label: "Low" },
  { value: TASK_PRIORITY.MEDIUM, label: "Medium" },
  { value: TASK_PRIORITY.HIGH, label: "High" },
] as const;

export const TRANSACTION_TYPE = {
  EARNING: "earning",
  EXPENSE: "expense",
} as const;

export type TransactionTypeValue =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const FREQUENCY = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BI_WEEKLY: "bi-weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

export type FrequencyValue = (typeof FREQUENCY)[keyof typeof FREQUENCY];

export const FREQUENCY_OPTIONS = [
  { value: FREQUENCY.DAILY, label: "Daily" },
  { value: FREQUENCY.WEEKLY, label: "Weekly" },
  { value: FREQUENCY.BI_WEEKLY, label: "Bi-weekly (Every 2 Weeks)" },
  { value: FREQUENCY.MONTHLY, label: "Monthly" },
  { value: FREQUENCY.YEARLY, label: "Yearly" },
] as const;

export const LEARNING_STATUS = {
  TO_LEARN: "To Learn",
  LEARNING: "Learning",
  PRACTICING: "Practicing",
  MASTERED: "Mastered",
} as const;

export type LearningStatusValue =
  (typeof LEARNING_STATUS)[keyof typeof LEARNING_STATUS];

export const LEARNING_STATUS_OPTIONS = [
  { value: LEARNING_STATUS.TO_LEARN, label: "To Learn" },
  { value: LEARNING_STATUS.LEARNING, label: "Learning" },
  { value: LEARNING_STATUS.PRACTICING, label: "Practicing" },
  { value: LEARNING_STATUS.MASTERED, label: "Mastered" },
] as const;

export const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export const LIFE_UPDATE_CATEGORY = {
  WATCHING: "watching",
  ACTIVITY: "activity",
  PHOTO: "photo",
  THOUGHT: "thought",
  MILESTONE: "milestone",
} as const;

export type LifeUpdateCategoryValue =
  (typeof LIFE_UPDATE_CATEGORY)[keyof typeof LIFE_UPDATE_CATEGORY];

export const LIFE_UPDATE_CATEGORY_OPTIONS = [
  { value: LIFE_UPDATE_CATEGORY.WATCHING, label: "Watching", emoji: "📺" },
  { value: LIFE_UPDATE_CATEGORY.ACTIVITY, label: "Activity", emoji: "🏄" },
  { value: LIFE_UPDATE_CATEGORY.PHOTO, label: "Photo", emoji: "📸" },
  { value: LIFE_UPDATE_CATEGORY.THOUGHT, label: "Thought", emoji: "💭" },
  { value: LIFE_UPDATE_CATEGORY.MILESTONE, label: "Milestone", emoji: "🏆" },
] as const;

export const TYPOGRAPHY_PRESETS = [
  /* ── Sans systems ──────────────────────────────────────────────────────── */
  {
    value: "typo-default",
    label: "Developer Default",
    heading: "Space Grotesk",
    body: "Inter",
    code: "JetBrains Mono",
    weight: 700,
    serif: false,
    mood: "Sans",
    description: "Clean and versatile — the standard developer choice",
    pairing:
      "Space Grotesk's quirky geometric caps give headings a signature; Inter stays out of the way underneath.",
    families: ["Space Grotesk", "Inter", "JetBrains Mono"],
  },
  {
    value: "typo-modern-tech",
    label: "Product UI",
    heading: "Geist",
    body: "Geist",
    code: "Geist Mono",
    weight: 700,
    serif: false,
    mood: "Sans",
    description: "One family, weight-driven hierarchy — Vercel/Linear approach",
    pairing:
      "A single-family system. Hierarchy comes from weight and size rather than a second typeface, which is how most modern product interfaces are actually built.",
    families: ["Geist", "Geist Mono"],
  },
  {
    value: "typo-geometric",
    label: "Quiet Geometric",
    heading: "Onest",
    body: "Onest",
    code: "JetBrains Mono",
    weight: 700,
    serif: false,
    mood: "Sans",
    description: "Calm geometric sans with nothing to prove",
    pairing:
      "Also single-family. Onest has even, unfussy proportions that hold from a 12px label to a 48px headline.",
    families: ["Onest", "JetBrains Mono"],
  },
  {
    value: "typo-bold-quirky",
    label: "Bold & Expressive",
    heading: "Bricolage Grotesque",
    body: "Inter",
    code: "JetBrains Mono",
    weight: 800,
    serif: false,
    mood: "Expressive",
    description: "Chunky variable display with a neutral body — creative portfolio",
    pairing:
      "Bricolage is loud and deliberately imperfect. It needs a body face with no opinions, which is exactly Inter's job.",
    families: ["Bricolage Grotesque", "Inter", "JetBrains Mono"],
  },
  {
    value: "typo-futuristic",
    label: "Futuristic",
    heading: "Unbounded",
    body: "Sora",
    code: "Fira Code",
    weight: 700,
    serif: false,
    mood: "Expressive",
    description: "Wide rounded display — cyberpunk and gaming aesthetic",
    pairing:
      "Unbounded is extremely wide, so it needs a body face with room in it. Sora's open apertures keep the pair from feeling cramped.",
    families: ["Unbounded", "Sora", "Fira Code"],
  },

  /* ── Serif display over sans body ──────────────────────────────────────── */
  {
    value: "typo-editorial",
    label: "Editorial Serif",
    heading: "Playfair Display",
    body: "DM Sans",
    code: "Fira Code",
    weight: 700,
    serif: true,
    mood: "Editorial",
    description: "Dramatic serif headlines with smooth body text — magazine-style",
    pairing:
      "The reference high-contrast pairing. Playfair's hairlines carry the drama; DM Sans's low contrast keeps the body calm.",
    families: ["Playfair Display", "DM Sans", "Fira Code"],
  },
  {
    value: "typo-elegant",
    label: "Elegant Minimal",
    heading: "Instrument Serif",
    body: "Manrope",
    code: "IBM Plex Mono",
    weight: 400,
    serif: true,
    mood: "Editorial",
    description: "Refined serif with airy body — Apple-inspired editorial",
    pairing:
      "Instrument Serif ships one weight and needs no other; setting it at 400 across large sizes is the whole effect.",
    families: ["Instrument Serif", "Manrope", "IBM Plex Mono"],
  },
  {
    value: "typo-classic-pro",
    label: "Classic Professional",
    heading: "Libre Baskerville",
    body: "Plus Jakarta Sans",
    code: "IBM Plex Mono",
    weight: 700,
    serif: true,
    mood: "Editorial",
    description: "Traditional serif authority with a modern body",
    pairing:
      "Libre Baskerville reads as institutional without being stuffy; Plus Jakarta Sans keeps the interface feeling current.",
    families: ["Libre Baskerville", "Plus Jakarta Sans", "IBM Plex Mono"],
  },

  /* ── Serif body — for reading, not for landing pages ───────────────────── */
  {
    value: "typo-longform",
    label: "Long-form Reading",
    heading: "Instrument Sans",
    body: "Lora",
    code: "IBM Plex Mono",
    weight: 600,
    serif: true,
    mood: "Reading",
    description: "Serif body tuned for screens — the one to pick for a blog",
    pairing:
      "The only preset with a serif *body*. Lora is drawn for screen reading at 16–18px; Instrument Sans keeps headings from turning the page into a novel.",
    families: ["Instrument Sans", "Lora", "IBM Plex Mono"],
  },
  {
    value: "typo-authority",
    label: "Data & Authority",
    heading: "Fraunces",
    body: "Chivo",
    code: "IBM Plex Mono",
    weight: 700,
    serif: true,
    mood: "Reading",
    description: "Old-style serif headings over a grotesque built for figures",
    pairing:
      "Fraunces carries institutional weight without a didone's fragility. Chivo handles dense numeric tables without looking out of place beneath it.",
    families: ["Fraunces", "Chivo", "IBM Plex Mono"],
  },

  /* ── Monospace and system ──────────────────────────────────────────────── */
  {
    value: "typo-terminal",
    label: "Terminal",
    heading: "JetBrains Mono",
    body: "Inter",
    code: "JetBrains Mono",
    weight: 700,
    serif: false,
    mono: true,
    mood: "Mono",
    description: "Monospace headings — pairs with the CRT and terminal themes",
    pairing:
      "Mono headings over a proportional body. Note this is the one preset with positive heading tracking: monospace caps are already tight on a fixed advance width.",
    families: ["JetBrains Mono", "Inter"],
  },
  {
    value: "typo-system",
    label: "System",
    heading: "system-ui",
    body: "system-ui",
    code: "ui-monospace",
    weight: 700,
    serif: false,
    mood: "System",
    description: "No webfont — instant render, zero layout shift, native on every OS",
    pairing:
      "Downloads nothing. On a slow connection this is the only preset that paints text immediately, and it always looks native.",
    families: [],
  },
] as const;

export type TypographyPresetValue =
  (typeof TYPOGRAPHY_PRESETS)[number]["value"];

export const THEME_PRESETS = [
  { value: "theme-ink-light", label: "Ink" },
  { value: "theme-ink-dark", label: "Ink Noir" },
  { value: "theme-blueprint", label: "Blueprint" },
  { value: "theme-dracula", label: "Dracula" },
  { value: "theme-nord", label: "Nord" },
  { value: "theme-tokyo-night", label: "Tokyo Night" },
  { value: "theme-catppuccin-mocha", label: "Catppuccin Mocha" },
  { value: "theme-github-dark", label: "GitHub Dark" },
  { value: "theme-onedark-pro", label: "One Dark Pro" },
  { value: "theme-rose-pine", label: "Rosé Pine" },
  { value: "theme-monokai", label: "Monokai" },
  { value: "theme-ayu-dark", label: "Ayu Dark" },
  { value: "theme-solarized-light", label: "Solarized Light" },
  { value: "theme-catppuccin-latte", label: "Catppuccin Latte" },
  { value: "theme-github-light", label: "GitHub Light" },
  { value: "theme-arctic", label: "Arctic Frost" },
  { value: "theme-paper", label: "Paper White" },
  { value: "theme-cyberpunk", label: "Cyberpunk" },
  { value: "theme-ocean", label: "Ocean Deep" },
  { value: "theme-matrix", label: "Matrix" },
  { value: "theme-hc-dark", label: "High Contrast Dark" },
  { value: "theme-hc-light", label: "High Contrast Light" },
  { value: "theme-neobrutalism-light", label: "Neo-Brutalism Light" },
  { value: "theme-neobrutalism-dark", label: "Neo-Brutalism Dark" },
  { value: "theme-neobrutalism-punk", label: "Neo-Brutalism Punk" },
  { value: "theme-glass-dark", label: "Liquid Glass Dark" },
  { value: "theme-glass-frost", label: "Liquid Glass Frost" },
  { value: "theme-glass-aurora", label: "Glass Aurora" },
  { value: "theme-glass-ocean", label: "Glass Ocean" },
  { value: "theme-synthwave", label: "Synthwave" },
  { value: "theme-retrowave", label: "Retrowave" },
  { value: "theme-terminal", label: "Terminal" },
  { value: "theme-solarized-dark", label: "Solarized Dark" },
  { value: "theme-gruvbox-dark", label: "Gruvbox Dark" },
  { value: "theme-gruvbox-light", label: "Gruvbox Light" },
  { value: "theme-tokyo-night-day", label: "Tokyo Night Day" },
  { value: "theme-everforest-dark", label: "Everforest" },
  { value: "theme-kanagawa", label: "Kanagawa" },
  { value: "theme-sepia", label: "Sepia" },
  { value: "theme-linear-dark", label: "Linear" },
  { value: "theme-mono-dark", label: "Mono Dark" },
  { value: "theme-mono-light", label: "Mono Light" },
  { value: "theme-stripe-light", label: "Stripe" },
  { value: "theme-aaa-light", label: "Accessible Light" },
  { value: "theme-aaa-dark", label: "Accessible Dark" },
] as const;
