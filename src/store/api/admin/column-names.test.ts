import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";

/**
 * Every column an API slice filters on must exist **on the table it queries**.
 *
 * A `.eq("status", …)` against a table with no `status` column is not a type
 * error — Supabase's client types are structural and the string is just a
 * string. It fails at runtime, inside a batch, and the whole query returns
 * nothing.
 *
 * That is not theoretical. The dashboard's rebuild filtered
 * `contact_submissions.status` and `learning_topics.next_review_at`, neither
 * of which exists. One failing read blanked the entire page, and nothing in
 * tsc, eslint or the suite had an opinion.
 *
 * Per-table, not a global set of every column name. The first version of this
 * test pooled them and passed with the exact bug reinstated, because `status`
 * is a real column on three *other* tables. A check that cannot tell those
 * apart is not checking anything.
 */

const root = resolve(__dirname, "../../../..");
const schema = readFileSync(resolve(root, "db/schema.sql"), "utf-8");

/**
 * Enum-typed columns count too. The `_kind`/`_effect`/`_bucket` alternatives
 * are finance v2's enums: without them `fin_account.kind`, `fin_category.bucket`
 * and `fin_goal.kind` are not recognised as columns at all, so a future
 * `.eq("bucket", …)` would be skipped for the same reason the missing tables
 * were — the parser simply never saw them.
 */
const TYPES =
  "UUID|TEXT|INT|INT2|INT4|INT8|BIGINT|SMALLINT|BOOLEAN|NUMERIC|DATE|TIMESTAMPTZ|TIMESTAMP|JSONB|JSON|CHAR|VARCHAR|[a-z_]+_type|[a-z_]+_status|[a-z_]+_frequency|[a-z_]+_kind|[a-z_]+_effect|fin_bucket";

/** Column names per table, from CREATE TABLE bodies and later ADD COLUMNs. */
function columnsByTable(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  const add = (table: string, column: string) => {
    const existing = tables.get(table) ?? new Set<string>();
    existing.add(column);
    tables.set(table, existing);
  };

  // Each CREATE TABLE block, up to its closing `);`.
  const create = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g;
  let match: RegExpExecArray | null;
  while ((match = create.exec(schema)) !== null) {
    const [, table, body] = match;
    const column = new RegExp(`^\\s+(\\w+)\\s+(?:${TYPES})\\b`, "gim");
    let field: RegExpExecArray | null;
    while ((field = column.exec(body)) !== null) add(table, field[1]);
  }

  // `ALTER TABLE x ADD COLUMN [IF NOT EXISTS] y …`, including multi-column
  // statements where the table is named once.
  const alter = /ALTER TABLE (?:ONLY )?(\w+)([\s\S]*?);/g;
  while ((match = alter.exec(schema)) !== null) {
    const [, table, body] = match;
    const column = /ADD COLUMN (?:IF NOT EXISTS )?(\w+)/gi;
    let field: RegExpExecArray | null;
    while ((field = column.exec(body)) !== null) add(table, field[1]);
  }

  return tables;
}

/**
 * Table/column pairs a slice filters on.
 *
 * A Supabase chain names its table once and then filters, so the table is
 * carried forward until the next `.from(`.
 */
function filters(source: string): { table: string; column: string }[] {
  const found: { table: string; column: string }[] = [];
  const token =
    /\.from\(\s*"(\w+)"|\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*"([a-z_][a-z0-9_]*)"/g;

  let table: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source)) !== null) {
    if (match[1]) {
      table = match[1];
      continue;
    }
    if (table && match[2]) found.push({ table, column: match[2] });
  }

  return found;
}

/** Every table a slice queries, whether or not it then filters on anything. */
function tablesIn(source: string): string[] {
  const found: string[] = [];
  const pattern = /\.from\(\s*"(\w+)"/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (found.indexOf(match[1]) === -1) found.push(match[1]);
  }

  return found;
}

const TABLES = columnsByTable();

const slices = globSync("src/store/api/**/!(*.test).ts", {
  cwd: root,
  absolute: true,
});

describe("API filters name real columns", () => {
  it("parsed the schema per table", () => {
    // Guards the parser: an empty map would pass every case below.
    expect(TABLES.size).toBeGreaterThan(30);
    expect(TABLES.get("learning_topics")?.has("due_date")).toBe(true);
    expect(TABLES.get("contact_submissions")?.has("is_read")).toBe(true);

    // And it must be able to tell tables apart — `status` exists on several,
    // but not on this one. Pooling the names is what made the first version of
    // this test useless.
    expect(TABLES.get("tasks")?.has("status")).toBe(true);
    expect(TABLES.get("contact_submissions")?.has("status")).toBe(false);
  });

  it("found slices to check", () => {
    expect(slices.length).toBeGreaterThan(10);
  });

  it("filters only on columns the table declares", () => {
    const unknown: string[] = [];

    for (const slice of slices) {
      const source = readFileSync(slice, "utf-8");
      for (const { table, column } of filters(source)) {
        const columns = TABLES.get(table);
        // A table the schema does not declare at all is a different bug with a
        // different fix, and has its own test below.
        if (!columns) continue;
        if (columns.has(column)) continue;
        unknown.push(`${slice.slice(root.length + 1)} → ${table}.${column}`);
      }
    }

    expect(unknown).toEqual([]);
  });

  /**
   * And the table itself must exist.
   *
   * This is the hole the test above used to have. `if (!columns) continue` was
   * written to mean "an unparsed table is not evidence of a bad column", which
   * is true — but it also silently excused a table that is not in the schema at
   * *all*, and an unknown table skips every column check with it.
   *
   * Finance v2 is how that surfaced: migrations 025–030 created sixteen
   * `fin_*` tables and `financeV2Api.ts` queried seven of them, while
   * `db/schema.sql` — the file a fresh install actually runs — had never been
   * given any of them. An existing database that had run the migrations worked;
   * a new one would fail every finance read at runtime. The whole suite stayed
   * green, because the one test watching for schema drift could not see a table
   * that was missing rather than misspelled.
   *
   * No allowlist. A table an API queries has to be in the schema that creates
   * it; there is no legitimate reason for that to be untrue.
   */
  it("queries only tables the schema declares", () => {
    const missing: string[] = [];

    for (const slice of slices) {
      const source = readFileSync(slice, "utf-8");
      for (const table of tablesIn(source)) {
        if (TABLES.has(table)) continue;
        missing.push(`${slice.slice(root.length + 1)} → ${table}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
