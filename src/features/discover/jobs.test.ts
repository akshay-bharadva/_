import { describe, it, expect } from "vitest";
import remoteok from "./__fixtures__/remoteok.json";
import type { Posting } from "./live";
import {
  byNewest,
  employmentTypes,
  filterJobs,
  JOB_SOURCES,
  mergePostings,
  parseRemoteOk,
  regionOf,
} from "./jobs";

const posting = (overrides: Partial<Posting> = {}): Posting => ({
  id: "p1",
  title: "Senior Engineer",
  company: "Acme",
  url: "https://example.com/p1",
  location: null,
  remote: false,
  tags: [],
  postedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

describe("parseRemoteOk", () => {
  /**
   * The fixture is the live response, trimmed but not tidied — element zero is
   * the licence notice Remote OK actually returns. A parser that maps straight
   * over the array turns that into a phantom posting with no title, and a
   * hand-written fixture would not have caught it, because nobody inventing a
   * jobs payload puts a legal notice in it.
   */
  it("skips the licence notice the API returns first", () => {
    expect((remoteok as unknown[])[0]).toHaveProperty("legal");

    const postings = parseRemoteOk(remoteok);

    expect(postings.length).toBe((remoteok as unknown[]).length - 1);
    expect(postings.every((entry) => entry.title.length > 0)).toBe(true);
  });

  it("reads the fields the live response actually uses", () => {
    const [first] = parseRemoteOk(remoteok);
    expect(first.title).toBeTruthy();
    expect(first.company).toBeTruthy();
    expect(first.url).toMatch(/^https?:/);
    expect(first.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /** The live data really does contain "York, " and "Goa, ". */
  it("tidies a half-written location", () => {
    const postings = parseRemoteOk(remoteok);
    expect(
      postings.every((entry) => !/[,\s]$/.test(entry.location ?? "")),
    ).toBe(true);
  });

  it("returns nothing for a shape it cannot read", () => {
    expect(parseRemoteOk(null)).toEqual([]);
    expect(parseRemoteOk({ data: [] })).toEqual([]);
    expect(parseRemoteOk([{ nonsense: true }])).toEqual([]);
  });

  /** Remote OK's terms require a named, followed credit beside the results. */
  it("carries the attribution its terms require", () => {
    expect(JOB_SOURCES.remoteok.credit.text).toMatch(/remote ok/i);
    expect(JOB_SOURCES.remoteok.credit.href).toMatch(/^https:\/\//);
  });
});

describe("employmentTypes", () => {
  it("reads the terms out of the title and tags", () => {
    expect(employmentTypes(posting({ title: "Part-time designer" }))).toContain(
      "part-time",
    );
    expect(employmentTypes(posting({ tags: ["freelance"] }))).toContain(
      "freelance",
    );
    expect(employmentTypes(posting({ title: "Contract SRE" }))).toContain(
      "contract",
    );
    expect(employmentTypes(posting({ title: "Werkstudent" }))).toContain(
      "internship",
    );
  });

  /**
   * A posting that says nothing returns nothing. Guessing "full-time" would
   * hide every freelance role from somebody filtering for freelance, which is
   * the opposite of what the filter is for.
   */
  it("guesses nothing when the posting says nothing", () => {
    expect(employmentTypes(posting())).toEqual([]);
  });

  it("allows more than one, because adverts do", () => {
    const found = employmentTypes(
      posting({ title: "Contract or full-time engineer" }),
    );
    expect(found).toContain("contract");
    expect(found).toContain("full-time");
  });
});

describe("regionOf", () => {
  it("places North America", () => {
    expect(regionOf(posting({ location: "Toronto, Canada" }))).toBe(
      "north-america",
    );
    expect(regionOf(posting({ location: "Austin, Texas" }))).toBe(
      "north-america",
    );
  });

  it("places Europe", () => {
    expect(regionOf(posting({ location: "Berlin, Germany" }))).toBe("europe");
  });

  it("treats a remote posting with no location as remote", () => {
    expect(regionOf(posting({ location: null, remote: true }))).toBe("remote");
  });

  /**
   * Anything unplaceable stays visible. Location strings on these boards are
   * free text and often half-written, and dropping what cannot be categorised
   * would make the filter lie about what the board holds.
   */
  it("keeps what it cannot place", () => {
    expect(regionOf(posting({ location: "Goa" }))).toBe("elsewhere");
  });
});

describe("filterJobs", () => {
  const list = [
    posting({ id: "a", title: "Freelance dev", location: "Toronto, Canada" }),
    posting({ id: "b", title: "Full-time dev", location: "Berlin, Germany" }),
    posting({ id: "c", title: "Contract dev", location: "Remote" }),
  ];

  it("filters by terms", () => {
    expect(
      filterJobs(list, { types: ["freelance"] }).map((entry) => entry.id),
    ).toEqual(["a"]);
  });

  it("filters by region", () => {
    expect(
      filterJobs(list, { regions: ["north-america"] }).map((entry) => entry.id),
    ).toEqual(["a"]);
  });

  it("combines both", () => {
    expect(
      filterJobs(list, { types: ["contract"], regions: ["europe"] }),
    ).toEqual([]);
  });

  /**
   * An empty selection means "no opinion", not "nothing". The other reading
   * empties the page the moment you clear a filter, which looks like a broken
   * fetch rather than an empty selection.
   */
  it("treats an empty selection as no filter", () => {
    expect(filterJobs(list, { types: [], regions: [] })).toHaveLength(3);
    expect(filterJobs(list)).toHaveLength(3);
  });
});

describe("mergePostings", () => {
  it("drops an advert cross-posted to both boards", () => {
    const merged = mergePostings(
      [posting({ id: "one", url: "https://jobs.example/x" })],
      [posting({ id: "two", url: "https://JOBS.example/X" })],
    );
    expect(merged).toHaveLength(1);
  });

  it("puts the newest first and undated last", () => {
    const merged = byNewest([
      posting({ id: "old", postedAt: "2026-01-01T00:00:00.000Z" }),
      posting({ id: "none", postedAt: null }),
      posting({ id: "new", postedAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(merged.map((entry) => entry.id)).toEqual(["new", "old", "none"]);
  });
});
