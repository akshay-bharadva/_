import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

/**
 * The first two cases are v1's, carried over because this parser is carried
 * over. The rest are edges the implementation handles and v1 never asserted —
 * worth pinning now, because the failure mode is silent and expensive: a
 * parser wrong about quotes splits "LOBLAWS, TORONTO" into two columns and
 * every amount after it shifts by one.
 */

describe("parseCsv", () => {
  it("reads quotes, embedded commas, doubled quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n\r\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("picks the delimiter the first line uses", () => {
    expect(parseCsv("date;amount\n2024-01-01;5")).toEqual([
      ["date", "amount"],
      ["2024-01-01", "5"],
    ]);
  });

  it("reads a tab-separated export", () => {
    expect(parseCsv("date\tamount\n2024-01-01\t5")).toEqual([
      ["date", "amount"],
      ["2024-01-01", "5"],
    ]);
  });

  /**
   * A delimiter inside quotes must not be counted when choosing one, or a file
   * full of "Smith, John" would be read as semicolon-separated.
   */
  it("ignores delimiters inside quotes when choosing one", () => {
    expect(parseCsv('"Smith, John";40\n"Doe, Jane";50')).toEqual([
      ["Smith, John", "40"],
      ["Doe, Jane", "50"],
    ]);
  });

  it("keeps an empty trailing cell", () => {
    // RBC's CAD$/USD$ pair leaves one of them blank on every row.
    expect(parseCsv("2024-01-01,Payroll,2500.00,")).toEqual([
      ["2024-01-01", "Payroll", "2500.00", ""],
    ]);
  });

  it("drops a row with nothing in it, but not a row of empty cells with data", () => {
    expect(parseCsv("a,b\n\n,,\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("trims the cells", () => {
    expect(parseCsv(" a , b \n 1 , 2 ")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles LF, CRLF and a missing final newline alike", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  /** A newline inside a quoted cell is part of the cell, not a new row. */
  it("keeps a newline inside a quoted cell", () => {
    const rows = parseCsv('a,"line one\nline two",c');
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe("line one\nline two");
  });

  /** A file cut off mid-cell should still yield what it had. */
  it("does not lose the last row to an unterminated quote", () => {
    expect(parseCsv('a,b\n1,"unfinished')).toEqual([
      ["a", "b"],
      ["1", "unfinished"],
    ]);
  });

  it("is empty for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\r\n\r\n")).toEqual([]);
  });
});
