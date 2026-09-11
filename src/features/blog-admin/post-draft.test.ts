import { describe, it, expect, afterEach, vi } from "vitest";
import type { BlogPost } from "@/types";
import {
  countWords,
  draftFromPost,
  postProblems,
  recordFromDraft,
  sameDraft,
  slugify,
} from "./post-draft";

const post = (overrides: Partial<BlogPost> = {}): BlogPost => ({
  id: "p1",
  title: "A post",
  slug: "a-post",
  content: "Body",
  show_toc: true,
  published: false,
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe("slugify", () => {
  it("turns a title into an address", () => {
    expect(slugify("Hello, World! Café au lait")).toBe(
      "hello-world-cafe-au-lait",
    );
    expect(slugify("  --Already--slugged--  ")).toBe("already-slugged");
    expect(slugify("")).toBe("");
  });

  it("produces what the shared slug rule accepts", () => {
    const record = recordFromDraft(
      { ...draftFromPost(null), title: "Ünïcode & Symbols?!", slug: slugify("Ünïcode & Symbols?!") },
      false,
      null,
    );
    expect(postProblems(record, false).slug).toBeUndefined();
  });
});

describe("countWords", () => {
  it("counts words, not markup", () => {
    expect(countWords("# Title\n\nSome *bold* words here. ---")).toBe(5);
    expect(countWords("")).toBe(0);
  });
});

describe("recordFromDraft", () => {
  it("stamps the date when a post goes live", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:00:00Z"));
    const record = recordFromDraft(draftFromPost(post()), true, post());
    expect(record).toMatchObject({
      published: true,
      published_at: "2026-09-11T10:00:00.000Z",
    });
  });

  /** A typo fix must not move an old post to the top of the blog. */
  it("keeps the date when a live post is updated", () => {
    const live = post({ published: true, published_at: "2025-01-02T00:00:00Z" });
    expect(recordFromDraft(draftFromPost(live), true, live).published_at).toBe(
      "2025-01-02T00:00:00Z",
    );
  });

  it("clears the date when a post comes down", () => {
    const live = post({ published: true, published_at: "2025-01-02T00:00:00Z" });
    expect(recordFromDraft(draftFromPost(live), false, live)).toMatchObject({
      published: false,
      published_at: null,
    });
  });

  it("writes empty optional fields as null, and trims", () => {
    const record = recordFromDraft(
      { ...draftFromPost(null), title: "  Hi  ", slug: "hi", excerpt: "  " },
      false,
      null,
    );
    expect(record).toMatchObject({
      title: "Hi",
      excerpt: null,
      tags: null,
      cover_image_url: null,
      internal_notes: null,
    });
  });
});

describe("postProblems", () => {
  const draft = (overrides = {}) => ({ ...draftFromPost(post()), ...overrides });

  it("needs a title and a valid address", () => {
    const problems = postProblems(
      recordFromDraft(draft({ title: "", slug: "Bad Slug" }), false, null),
      false,
    );
    expect(problems.title).toBeTruthy();
    expect(problems.slug).toBeTruthy();
  });

  it("lets a draft have no body, but not a published post", () => {
    const empty = draft({ content: "  " });
    expect(postProblems(recordFromDraft(empty, false, null), false)).toEqual({});
    expect(postProblems(recordFromDraft(empty, true, null), true).content).toBe(
      "Write something before publishing.",
    );
  });
});

describe("sameDraft", () => {
  it("compares every field", () => {
    const a = draftFromPost(post());
    expect(sameDraft(a, { ...a })).toBe(true);
    expect(sameDraft(a, { ...a, tags: ["x"] })).toBe(false);
  });
});
