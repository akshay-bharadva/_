import { describe, it, expect } from "vitest";
import trending from "./__fixtures__/trending-links.json";
import board from "./__fixtures__/jobs-board.json";
import {
  filterPostings,
  parsePostings,
  parseTrending,
  postedLabel,
  skillDemand,
} from "./live";

/**
 * Fixtures are real captured responses.
 *
 * That matters more here than usual, because the source these replaced looked
 * correct and was not: Remotive's `search` parameter is silently ignored, so
 * "react" and "data engineer" returned the identical seventeen jobs. Hand-made
 * fixtures would never have shown that — only calling the real thing did.
 */

describe("parseTrending", () => {
  it("reads a real Mastodon trends response", () => {
    const links = parseTrending(trending);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.title.length).toBeGreaterThan(0);
      expect(link.url).toMatch(/^https?:\/\//);
    }
  });

  it("carries the publisher through", () => {
    const links = parseTrending(trending);
    expect(links.some((link) => link.publisher)).toBe(true);
  });

  /** The ranking is the whole point of a trending list. */
  it("sorts by shares, most first", () => {
    const shares = parseTrending(trending).map((link) => link.shares ?? 0);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
  });

  it("totals shares across the reported days", () => {
    const [link] = parseTrending([
      {
        title: "A",
        url: "https://x.com",
        history: [{ uses: "3" }, { uses: "4" }],
      },
    ]);
    expect(link.shares).toBe(7);
  });

  /** No history is unknown, not zero — and the two should not render alike. */
  it("reports absent history as null rather than zero", () => {
    const [link] = parseTrending([{ title: "A", url: "https://x.com" }]);
    expect(link.shares).toBeNull();
  });

  it("drops a row with no title or url", () => {
    expect(parseTrending([{ title: "A" }, { url: "https://x.com" }])).toEqual(
      [],
    );
  });

  it.each([
    ["null", null],
    ["an object", {}],
    ["a string", "no"],
  ])("returns an empty list for %s", (_label, body) => {
    expect(parseTrending(body)).toEqual([]);
  });
});

describe("parsePostings", () => {
  it("reads a real job board response", () => {
    const postings = parsePostings(board);
    expect(postings.length).toBeGreaterThan(10);
    for (const posting of postings) {
      expect(posting.title.length).toBeGreaterThan(0);
      expect(posting.url).toMatch(/^https?:\/\//);
      expect(Array.isArray(posting.tags)).toBe(true);
    }
  });

  /** This board sends unix seconds, unlike every other date in the app. */
  it("converts a unix timestamp to an ISO string", () => {
    const [posting] = parsePostings({
      data: [
        {
          slug: "a",
          title: "Dev",
          url: "https://x.com",
          created_at: 1755000000,
        },
      ],
    });
    expect(posting.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("names an unknown company rather than rendering undefined", () => {
    const [posting] = parsePostings({
      data: [{ slug: "a", title: "Dev", url: "https://x.com" }],
    });
    expect(posting.company).toBe("Unknown");
  });

  it("drops a row with no title or url", () => {
    expect(parsePostings({ data: [{ slug: "a", title: "Dev" }] })).toEqual([]);
  });

  it.each([
    ["null", null],
    ["no data key", {}],
    ["data that is not an array", { data: 5 }],
  ])("returns an empty list for %s", (_label, body) => {
    expect(parsePostings(body)).toEqual([]);
  });
});

describe("filterPostings", () => {
  const postings = parsePostings(board);

  it("returns everything for an empty term", () => {
    expect(filterPostings(postings, "")).toHaveLength(postings.length);
    expect(filterPostings(postings, "   ")).toHaveLength(postings.length);
  });

  /**
   * The failure this replaced: an upstream search that returned the same
   * results whatever was asked. A filter must actually narrow.
   */
  it("narrows the list", () => {
    const engineers = filterPostings(postings, "engineer");
    expect(engineers.length).toBeLessThan(postings.length);
    for (const posting of engineers) {
      const haystack = [posting.title, posting.company, ...posting.tags]
        .join(" ")
        .toLowerCase();
      expect(haystack).toContain("engineer");
    }
  });

  it("is case-insensitive", () => {
    expect(filterPostings(postings, "ENGINEER")).toEqual(
      filterPostings(postings, "engineer"),
    );
  });

  /** "senior react" must not match everything that merely says "senior". */
  it("requires every word to appear", () => {
    const both = filterPostings(postings, "senior engineer");
    for (const posting of both) {
      const haystack = [posting.title, posting.company, ...posting.tags]
        .join(" ")
        .toLowerCase();
      expect(haystack).toContain("senior");
      expect(haystack).toContain("engineer");
    }
  });

  it("matches on tags, not only the title", () => {
    const tagged = filterPostings(
      [
        {
          id: "1",
          title: "Builder",
          company: "X",
          url: "https://x.com",
          location: null,
          remote: false,
          tags: ["Kubernetes"],
          postedAt: null,
        },
      ],
      "kubernetes",
    );
    expect(tagged).toHaveLength(1);
  });

  it("returns nothing for a term nobody uses", () => {
    expect(filterPostings(postings, "zzzznotathing")).toEqual([]);
  });
});

describe("skillDemand", () => {
  const postings = parsePostings(board);

  it("ranks skills across a real board", () => {
    const { skills, sampled } = skillDemand(postings);
    expect(sampled).toBe(postings.length);
    expect(skills.length).toBeGreaterThan(0);
    // Descending, so the first is the most asked for.
    const counts = skills.map((skill) => skill.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  /** One advert repeating a tag must not outvote several that mention it once. */
  it("counts each posting once per skill", () => {
    const { skills } = skillDemand([
      {
        id: "1",
        title: "A",
        company: "X",
        url: "https://x.com",
        location: null,
        remote: false,
        tags: ["react", "React", "REACT"],
        postedAt: null,
      },
    ]);
    expect(skills[0]).toEqual({ tag: "react", count: 1 });
  });

  /** A count without its sample is not a fact. */
  it("reports the sample it was built from", () => {
    expect(skillDemand([]).sampled).toBe(0);
    expect(skillDemand([]).skills).toEqual([]);
  });

  it("is stable across equal counts", () => {
    const make = (tags: string[]) => ({
      id: "1",
      title: "A",
      company: "X",
      url: "https://x.com",
      location: null,
      remote: false,
      tags,
      postedAt: null,
    });
    expect(skillDemand([make(["zeta", "alpha"])]).skills).toEqual(
      skillDemand([make(["alpha", "zeta"])]).skills,
    );
  });

  it("ignores empty tags", () => {
    const { skills } = skillDemand([
      {
        id: "1",
        title: "A",
        company: "X",
        url: "https://x.com",
        location: null,
        remote: false,
        tags: ["  ", "go"],
        postedAt: null,
      },
    ]);
    expect(skills).toEqual([{ tag: "go", count: 1 }]);
  });
});

describe("postedLabel", () => {
  const now = new Date(2026, 7, 19);

  it.each([
    ["2026-08-19T09:00:00", "today"],
    ["2026-08-18T09:00:00", "yesterday"],
    ["2026-08-14T09:00:00", "5 days ago"],
    ["2026-07-05T09:00:00", "a month ago"],
  ])("%s reads as %s", (iso, expected) => {
    expect(postedLabel(iso, now)).toBe(expected);
  });

  /**
   * Calendar days, not elapsed hours: a posting from yesterday at 23:00 read
   * at 01:00 is "yesterday", though only two hours have passed.
   */
  it("counts calendar days", () => {
    expect(
      postedLabel("2026-08-18T23:00:00", new Date(2026, 7, 19, 1, 0)),
    ).toBe("yesterday");
  });

  it("says nothing for an unparseable date", () => {
    expect(postedLabel("not a date", now)).toBe("");
  });
});
