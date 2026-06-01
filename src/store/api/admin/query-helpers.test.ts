import { describe, it, expect } from "vitest";
import {
  NO_DB_ERROR,
  getAllQueryFn,
  insertQueryFn,
  updateQueryFn,
  saveQueryFn,
  deleteQueryFn,
} from "./query-helpers";

// In the test environment Supabase env vars are absent, so the client is
// null (static mode). Every helper must degrade to the standard error result
// instead of throwing — this is the contract the dual-mode data layer
// depends on.

interface Row {
  id?: string;
  name?: string;
}

describe("query-helpers without a configured Supabase client", () => {
  it("getAllQueryFn resolves to NO_DB_ERROR", async () => {
    await expect(getAllQueryFn<Row>("any_table")()).resolves.toEqual({
      error: NO_DB_ERROR,
    });
  });

  it("insertQueryFn resolves to NO_DB_ERROR", async () => {
    await expect(
      insertQueryFn<Row>("any_table")({ name: "x" }),
    ).resolves.toEqual({ error: NO_DB_ERROR });
  });

  it("updateQueryFn resolves to NO_DB_ERROR", async () => {
    await expect(
      updateQueryFn<Row>("any_table")({ id: "1", name: "x" }),
    ).resolves.toEqual({ error: NO_DB_ERROR });
  });

  it("saveQueryFn resolves to NO_DB_ERROR for insert and update shapes", async () => {
    const save = saveQueryFn<Row>("any_table");
    await expect(save({ name: "new" })).resolves.toEqual({
      error: NO_DB_ERROR,
    });
    await expect(save({ id: "1", name: "existing" })).resolves.toEqual({
      error: NO_DB_ERROR,
    });
  });

  it("deleteQueryFn resolves to NO_DB_ERROR", async () => {
    await expect(deleteQueryFn("any_table")("1")).resolves.toEqual({
      error: NO_DB_ERROR,
    });
  });
});
