import { describe, it, expect } from "vitest";
import {
  taskSchema,
  urlOrEmpty,
  dateString,
  hexColor,
  slug,
  tagList,
  habitSchema,
  learningTopicSchema,
  inventoryItemSchema,
  eventSchema,
  blogPostSchema,
  portfolioSectionSchema,
  navLinkSchema,
  siteSettingsDefaultValues,
  LIMITS,
} from "./schemas";
import { DEFAULT_THEME, VALID_THEMES } from "./themes";

describe("taskSchema", () => {
  it("accepts a valid task", () => {
    const result = taskSchema.safeParse({
      title: "Write tests",
      status: "todo",
      priority: "medium",
      due_date: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = taskSchema.safeParse({
      title: "",
      status: "todo",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status", () => {
    const result = taskSchema.safeParse({
      title: "x",
      status: "blocked",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });
});

describe("shared fragments", () => {
  it("urlOrEmpty accepts valid URLs and empty strings only", () => {
    expect(urlOrEmpty.safeParse("https://example.com").success).toBe(true);
    expect(urlOrEmpty.safeParse("").success).toBe(true);
    expect(urlOrEmpty.safeParse("not a url").success).toBe(false);
  });

  it("dateString enforces YYYY-MM-DD", () => {
    expect(dateString.safeParse("2026-07-10").success).toBe(true);
    expect(dateString.safeParse("10/07/2026").success).toBe(false);
  });

  it("hexColor accepts #rrggbb and nothing else", () => {
    expect(hexColor.safeParse("#3b82f6").success).toBe(true);
    expect(hexColor.safeParse("#3B82F6").success).toBe(true);
    expect(hexColor.safeParse("#fff").success).toBe(false);
    expect(hexColor.safeParse("blue").success).toBe(false);
    expect(hexColor.safeParse("3b82f6").success).toBe(false);
  });

  it("slug rejects shapes that would break the public URL", () => {
    expect(slug.safeParse("my-first-post").success).toBe(true);
    expect(slug.safeParse("Hello World").success).toBe(false);
    expect(slug.safeParse("trailing-").success).toBe(false);
    expect(slug.safeParse("double--hyphen").success).toBe(false);
    expect(slug.safeParse("").success).toBe(false);
  });

  it("tagList bounds both tag length and tag count", () => {
    expect(tagList.safeParse(["a", "b"]).success).toBe(true);
    expect(tagList.safeParse(null).success).toBe(true);
    expect(
      tagList.safeParse(Array.from({ length: LIMITS.TAG_COUNT + 1 }, () => "x"))
        .success,
    ).toBe(false);
    expect(tagList.safeParse(["x".repeat(LIMITS.TAG + 1)]).success).toBe(false);
  });
});

describe("blank optional numbers stay blank", () => {
  const base = {
    name: "Laptop",
    category: "Tech",
    purchase_price: 100,
  };

  it("does not turn an empty current_value into a real zero", () => {
    const result = inventoryItemSchema.safeParse({
      ...base,
      current_value: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.current_value).toBeNull();
  });

  it("still accepts a deliberate zero", () => {
    const result = inventoryItemSchema.safeParse({
      ...base,
      current_value: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.current_value).toBe(0);
  });
});

describe("learningTopicSchema confidence_score", () => {
  const base = {
    subject_id: "s1",
    title: "Closures",
    status: "Learning" as const,
  };

  it("matches the DB CHECK of 1..5", () => {
    expect(
      learningTopicSchema.safeParse({ ...base, confidence_score: 3 }).success,
    ).toBe(true);
    // Previously allowed: passed the form, then failed the CHECK constraint.
    expect(
      learningTopicSchema.safeParse({ ...base, confidence_score: 50 }).success,
    ).toBe(false);
    expect(
      learningTopicSchema.safeParse({ ...base, confidence_score: 0 }).success,
    ).toBe(false);
  });

  it("treats a blank score as unset", () => {
    const result = learningTopicSchema.safeParse({
      ...base,
      confidence_score: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confidence_score).toBeNull();
  });
});

describe("habitSchema", () => {
  it("requires a real hex colour", () => {
    const base = { title: "Read", target_per_week: 5 };
    expect(habitSchema.safeParse({ ...base, color: "#3b82f6" }).success).toBe(
      true,
    );
    expect(habitSchema.safeParse({ ...base, color: "blue" }).success).toBe(
      false,
    );
  });

  it("keeps target_per_week a whole number within 1..7", () => {
    const base = { title: "Read", color: "#3b82f6" };
    expect(habitSchema.safeParse({ ...base, target_per_week: 7 }).success).toBe(
      true,
    );
    expect(habitSchema.safeParse({ ...base, target_per_week: 8 }).success).toBe(
      false,
    );
    expect(
      habitSchema.safeParse({ ...base, target_per_week: 3.5 }).success,
    ).toBe(false);
  });
});

describe("date-range refinements", () => {
  it("rejects an event that ends before it starts", () => {
    const base = { title: "Standup", start_time: "2026-06-01T10:00:00Z" };
    expect(
      eventSchema.safeParse({ ...base, end_time: "2026-06-01T09:00:00Z" })
        .success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({ ...base, end_time: "2026-06-01T11:00:00Z" })
        .success,
    ).toBe(true);
  });
});

describe("length ceilings keep oversized input out of the layout", () => {
  it("caps a task title", () => {
    const over = {
      title: "x".repeat(LIMITS.TITLE + 1),
      status: "todo",
      priority: "medium",
    };
    expect(taskSchema.safeParse(over).success).toBe(false);
  });

  it("caps a blog excerpt but still allows a long body", () => {
    const base = { title: "Post", slug: "post" };
    expect(
      blogPostSchema.safeParse({
        ...base,
        excerpt: "x".repeat(LIMITS.SUMMARY + 1),
      }).success,
    ).toBe(false);
    expect(
      blogPostSchema.safeParse({ ...base, content: "x".repeat(50_000) })
        .success,
    ).toBe(true);
  });
});

describe("portfolioSectionSchema page_path", () => {
  it("requires a root-relative path so the catch-all can route to it", () => {
    const base = { title: "Work", type: "list_items" as const };
    expect(
      portfolioSectionSchema.safeParse({ ...base, page_path: "/about" })
        .success,
    ).toBe(true);
    expect(
      portfolioSectionSchema.safeParse({ ...base, page_path: "about" }).success,
    ).toBe(false);
  });
});

describe("navLinkSchema href", () => {
  const base = { label: "About" };

  it("accepts a site path", () => {
    expect(navLinkSchema.safeParse({ ...base, href: "/about" }).success).toBe(
      true,
    );
    expect(
      navLinkSchema.safeParse({ ...base, href: "/work/case-study" }).success,
    ).toBe(true);
  });

  it("rejects an absolute URL", () => {
    // generateStaticParams strips the leading slash, so an absolute URL used
    // to emit a broken prerendered route rather than failing the build.
    expect(
      navLinkSchema.safeParse({ ...base, href: "https://example.com" }).success,
    ).toBe(false);
  });

  it("rejects a path without a leading slash", () => {
    expect(navLinkSchema.safeParse({ ...base, href: "about" }).success).toBe(
      false,
    );
  });

  it("rejects whitespace inside the path", () => {
    expect(navLinkSchema.safeParse({ ...base, href: "/my page" }).success).toBe(
      false,
    );
  });
});

describe("siteSettingsDefaultValues", () => {
  it("starts from the app's real default theme", () => {
    expect(siteSettingsDefaultValues.profile_data.default_theme).toBe(
      DEFAULT_THEME,
    );
    expect(VALID_THEMES).toContain(
      siteSettingsDefaultValues.profile_data.default_theme,
    );
  });
});
