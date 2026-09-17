import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * `db/schema.sql` has to run top to bottom on an empty database.
 *
 * It is not only a description of the schema — it is the thing a fresh install
 * actually executes. The login screen says "Paste db/schema.sql into the
 * Supabase SQL editor and run it", and Postgres resolves a foreign key at the
 * moment the table is created: a `REFERENCES x` whose `x` appears later in the
 * file fails outright.
 *
 * That is not hypothetical. `finance_goal_contributions` was declared with
 * `account_id UUID REFERENCES finance_accounts(id)` about 1,100 lines *before*
 * `finance_accounts` existed, so a fresh install never created the table at
 * all — and the index, `ENABLE ROW LEVEL SECURITY` and policy that followed it
 * failed too, leaving the table absent rather than merely unprotected. Existing
 * databases were fine, because they were built up through `db/migrations/`
 * where the referenced table was already there. Nothing failed in CI, because
 * nothing ran the file.
 *
 * A real proof would execute the schema against Postgres, which CI has no
 * database for. This is the cheap version that catches the whole class: it
 * reads the file as text and checks the order.
 */

const schema = readFileSync(resolve(__dirname, "../../db/schema.sql"), "utf-8");

/** 1-indexed line number of a character offset, for a message worth reading. */
function lineOf(index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < schema.length; i += 1) {
    if (schema[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Where each table is first created.
 *
 * First, not last: a table created once and altered later is defined at the
 * point of the CREATE, and that is what a reference has to come after.
 */
function firstCreated(): Map<string, number> {
  const created = new Map<string, number>();
  const pattern = /CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(schema)) !== null) {
    if (!created.has(match[1])) created.set(match[1], match.index);
  }

  return created;
}

/**
 * Every foreign-key target and where it is referenced.
 *
 * `(\w+)\s*\(` deliberately does not match a schema-qualified name, so
 * `REFERENCES auth.users(id)` and `storage.buckets` are skipped — those are
 * Supabase-managed and exist before this file runs.
 */
function referenceSites(): { table: string; index: number }[] {
  const sites: { table: string; index: number }[] = [];
  const pattern = /REFERENCES\s+(\w+)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(schema)) !== null) {
    sites.push({ table: match[1], index: match.index });
  }

  return sites;
}

const CREATED = firstCreated();
const SITES = referenceSites();

describe("schema.sql runs in order", () => {
  it("parsed the file", () => {
    // Guards the parser: empty maps would pass every assertion below.
    expect(CREATED.size).toBeGreaterThan(40);
    expect(SITES.length).toBeGreaterThan(40);
    expect(CREATED.has("fin_account")).toBe(true);
    expect(CREATED.has("fin_posting")).toBe(true);
  });

  /**
   * A self-reference is fine: `fin_commitment.supersedes_id` points at
   * `fin_commitment`, and the CREATE begins before the REFERENCES inside it, so
   * the ordering check passes on its own terms rather than needing an exception.
   */
  it("never references a table before creating it", () => {
    const forward: string[] = [];

    for (const { table, index } of SITES) {
      const createdAt = CREATED.get(table);
      // Not created anywhere in this file: either Supabase-managed or a typo,
      // and the next test is the one that has an opinion about that.
      if (createdAt === undefined) continue;
      if (createdAt < index) continue;
      forward.push(
        `line ${lineOf(index)} references ${table}, created at line ${lineOf(createdAt)}`,
      );
    }

    expect(forward).toEqual([]);
  });

  /**
   * And a foreign key must point at something real. A `REFERENCES` naming a
   * table this file never creates is either a misspelling or a table the schema
   * forgot, and both fail at install time rather than at a user's write.
   *
   * The allowlist is for tables Supabase itself provides, which exist before
   * this file is ever run.
   */
  it("references only tables this file creates, or Supabase provides", () => {
    const PROVIDED_BY_SUPABASE = ["users", "buckets", "objects"];

    const missing = Array.from(
      new Set(
        SITES.filter(
          ({ table }) =>
            !CREATED.has(table) && PROVIDED_BY_SUPABASE.indexOf(table) === -1,
        ).map(({ table }) => table),
      ),
    );

    expect(missing).toEqual([]);
  });
});
