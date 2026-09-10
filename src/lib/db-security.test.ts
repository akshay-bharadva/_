import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Database-level security properties that nothing else can check.
 *
 * These are not expressible in TypeScript and never fail a build — they fail
 * as a quiet hole in production. The audit that prompted this found four
 * functions predating the v3 rebuild that had both problems below.
 */

const schema = readFileSync(resolve(__dirname, "../../db/schema.sql"), "utf-8");

/**
 * Every function in the schema, as (name, full text).
 *
 * Split on the *next* CREATE rather than on a `$$` terminator: the schema uses
 * `AS $$ ... $$;`, `AS $$ ... $$ LANGUAGE plpgsql;` and plain SQL bodies, and a
 * parser keyed on one of those silently returns a two-character body for the
 * others — which then matches nothing and passes every check for the wrong
 * reason. This test earned that comment the hard way.
 */
function parseFunctions(source: string): { name: string; text: string }[] {
  const pattern = /CREATE (?:OR REPLACE )?FUNCTION\s+([\w.]+)/g;
  const starts: { name: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    starts.push({ name: match[1], index: match.index });
  }

  return starts.map((entry, i) => ({
    name: entry.name,
    text: source.slice(
      entry.index,
      i + 1 < starts.length ? starts[i + 1].index : source.length,
    ),
  }));
}

const functions = parseFunctions(schema);
const definers = functions.filter((fn) => /SECURITY DEFINER/i.test(fn.text));

describe("SECURITY DEFINER functions", () => {
  it("parsed the schema", () => {
    // Guards the parser itself. Every assertion below is a filter over this
    // list, so a parser that stops matching turns the whole suite green.
    expect(functions.length).toBeGreaterThan(25);
    expect(definers.length).toBeGreaterThan(10);
    // A body that came out empty means the split broke.
    for (const fn of definers) expect(fn.text.length).toBeGreaterThan(50);
  });

  /**
   * A definer function runs as its owner but resolves unqualified names
   * through the *caller's* search_path. Anyone able to create an object in a
   * schema that resolves earlier can have theirs used instead, inside a
   * privileged context. Supabase's advisor calls this "Function Search Path
   * Mutable".
   */
  it.each(definers.map((fn) => fn.name))("%s pins its search_path", (name) => {
    const fn = definers.find((entry) => entry.name === name)!;
    expect(/SET\s+search_path/i.test(fn.text)).toBe(true);
  });

  /**
   * The more serious property. SECURITY DEFINER bypasses RLS, so a function
   * that reads or writes an AAL2-protected table without checking AAL2 itself
   * is a route around the mandatory second factor — the policies never run.
   *
   * The allowlist is the substance. Several definer functions genuinely must
   * not require AAL2: triggers that fire inside a write already authorised,
   * and the few things a signed-out visitor is meant to reach. Each is listed
   * with its reason, so a new function is a decision rather than an omission.
   */
  const NO_AAL2_REQUIRED: Record<string, string> = {
    "public.is_admin": "the primitive the others are built from",
    "public.is_aal2": "the primitive the others are built from",
    check_admin_exists:
      "signup UX only — tells the login page whether an admin exists",
    "public.block_additional_signups":
      "trigger on auth.users; runs before any session exists",
    "public.limit_contact_submissions": "trigger on the public contact form",
    "public.notify_contact_submission": "trigger on the public contact form",
    "public.enrich_site_visit": "trigger on a public visit insert",
    "public.limit_site_visits": "trigger on a public visit insert",
    "public.notify_site_visit": "trigger on a public visit insert",
    "public.fill_transaction_money":
      "trigger inside a transaction write RLS has already authorised",
    increment_blog_post_view: "public view counter on a published post",
    "public.get_random_public_highlight":
      "the public quote widget; returns only rows marked is_public",
    update_asset_usage:
      "maintenance sweep over storage paths; touches no user rows",
  };

  const touchingData = definers.filter((fn) =>
    /(FROM|UPDATE|INSERT INTO|DELETE FROM)\s+\w/i.test(fn.text),
  );

  it("found definer functions that touch user data", () => {
    expect(touchingData.length).toBeGreaterThan(5);
  });

  it("every one of them checks AAL2 or admin", () => {
    const unguarded = touchingData
      .filter((fn) => !/is_aal2\(\)|is_admin\(\)/.test(fn.text))
      .map((fn) => fn.name)
      .filter((name) => !(name in NO_AAL2_REQUIRED));

    expect(unguarded).toEqual([]);
  });

  /** An allowlist entry left behind after a function was guarded is noise. */
  it("has no stale allowlist entries", () => {
    const names = functions.map((fn) => fn.name);
    expect(
      Object.keys(NO_AAL2_REQUIRED).filter(
        (name) => names.indexOf(name) === -1,
      ),
    ).toEqual([]);
  });
});

/** Collect a capture group across a global regex, deduplicated. */
function allMatches(source: string, pattern: RegExp): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  const scan = new RegExp(pattern.source, pattern.flags);
  while ((match = scan.exec(source)) !== null) {
    if (found.indexOf(match[1]) === -1) found.push(match[1]);
  }
  return found;
}

describe("row level security", () => {
  it("is enabled on every table", () => {
    const tables = allMatches(schema, /CREATE TABLE IF NOT EXISTS (\w+)/g);
    const enabled = allMatches(
      schema,
      /ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/g,
    );

    expect(tables.length).toBeGreaterThan(30);
    expect(tables.filter((table) => enabled.indexOf(table) === -1)).toEqual([]);
  });

  /**
   * A table with RLS on and no policy denies everything, which is a valid and
   * deliberate design — `analytics_secret` uses it so the daily hashing salt
   * is reachable only from definer functions. Anything else in that state is
   * far more likely to be an oversight.
   */
  it("has a policy on every table except the deliberately sealed one", () => {
    const tables = allMatches(schema, /CREATE TABLE IF NOT EXISTS (\w+)/g);
    const policied = allMatches(schema, /CREATE POLICY "[^"]+" ON (\w+)/g);

    expect(tables.filter((table) => policied.indexOf(table) === -1)).toEqual([
      "analytics_secret",
    ]);
  });
});
