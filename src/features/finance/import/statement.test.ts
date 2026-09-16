import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";
import {
  accountRefsIn,
  detectFormat,
  guessDateOrder,
  parseAmount,
  parseDate,
  readRows,
  refLast4,
  suggestFlip,
  toMinor,
  type StatementRow,
} from "./statement";

/**
 * The bank fixtures are v1's, because the formats they describe have not
 * changed. What is new is `toMinor`, and the coverage of edges v1 left
 * unasserted — chiefly that a file read with its signs backwards is caught
 * before anything is written.
 */

const RBC = [
  '"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"',
  'Chequing,06702-5012345,9/15/2023,,"PAYROLL DEPOSIT","ACME CORP",2500.00,',
  'Chequing,06702-5012345,9/16/2023,,"INTERAC E-TRF- 1234","JOHN DOE",-450.00,',
  'Chequing,06702-5012345,9/17/2023,,"IDP PURCHASE - 1234","LOBLAWS #1089",-82.14,',
  'MasterCard,5191230012341234,9/18/2023,,"AMAZON.CA AMAZON.CA ON",,-45.12,',
  "",
].join("\r\n");

const CIBC_BANK = [
  '2024-03-01,"Internet Banking INTERNET TRANSFER 000000123456",500.00,',
  '2024-03-02,"Point of Sale - Interac RETAIL PURCHASE 000001 TIM HORTONS #12",3.45,',
  '2024-03-05,"Electronic Funds Transfer PAY ACME CORP",,2500.00',
].join("\n");

const CIBC_CARD = [
  "2024-03-03,UBER EATS TORONTO ON,24.50,,4500********1234",
  "2024-03-10,PAYMENT THANK YOU/PAIEMENT MERCI,,600.00,4500********1234",
].join("\n");

const read = (text: string, flip = false) => {
  const rows = parseCsv(text);
  return readRows(rows, detectFormat(rows), { flip });
};

describe("dates", () => {
  it.each([
    ["2023-09-15", "mdy", "2023-09-15"],
    ["9/15/2023", "mdy", "2023-09-15"],
    ["15/9/2023", "dmy", "2023-09-15"],
    ["Sep 15, 2023", "mdy", "2023-09-15"],
    ["15-Sep-2023", "mdy", "2023-09-15"],
    ["2/30/2023", "mdy", null],
    ["not a date", "mdy", null],
  ] as const)("reads %s", (value, order, expected) => {
    expect(parseDate(value, order)).toBe(expected);
  });

  /** 30 February is rejected rather than rolled forward into March. */
  it("refuses a date that does not exist", () => {
    expect(parseDate("2023-02-30", "ymd")).toBeNull();
    expect(parseDate("2023-13-01", "ymd")).toBeNull();
  });

  it("works out which way round slash dates are", () => {
    expect(guessDateOrder(["1/15/2024", "2/3/2024"])).toBe("mdy");
    expect(guessDateOrder(["15/1/2024", "3/2/2024"])).toBe("dmy");
    expect(guessDateOrder(["2024-01-15"])).toBe("ymd");
    // Every date ambiguous: the Canadian banks' own order.
    expect(guessDateOrder(["1/2/2024", "3/4/2024"])).toBe("mdy");
  });
});

describe("amounts", () => {
  /** Accounting has three ways to write a negative, and banks use all of them. */
  it.each([
    ["$1,234.56", 1234.56],
    ["-12.00", -12],
    ["(12.00)", -12],
    ["12.00-", -12],
    ["CAD 40", 40],
    ["+5.00", 5],
    [".50", 0.5],
    ["", null],
    ["abc", null],
    ["1.2.3", null],
  ] as const)("reads %s", (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });
});

describe("toMinor", () => {
  const row = (amount: number): StatementRow => ({
    line: 1,
    date: "2024-03-01",
    description: "x",
    detail: "",
    amount,
    accountRef: null,
    currency: null,
  });

  it("converts through the string, in the account's currency", () => {
    expect(toMinor(row(1234.56), "CAD")).toEqual({
      minor: 123456,
      currency: "CAD",
    });
    expect(toMinor(row(-82.14), "CAD").minor).toBe(-8214);
  });

  it("respects a currency with no minor unit", () => {
    expect(toMinor(row(1234), "JPY")).toEqual({ minor: 1234, currency: "JPY" });
  });

  /** The classic float case, read from digits rather than from binary. */
  it("rounds the half-cent case away from zero", () => {
    expect(toMinor(row(1.005), "CAD").minor).toBe(101);
    expect(toMinor(row(-1.005), "CAD").minor).toBe(-101);
  });
});

describe("recognising a bank", () => {
  it("recognises RBC by its header and reads every account in the file", () => {
    const rows = parseCsv(RBC);
    const format = detectFormat(rows);
    expect(format.id).toBe("rbc");

    const result = readRows(rows, format);
    expect(result.rows.map((row) => row.amount)).toEqual([
      2500, -450, -82.14, -45.12,
    ]);
    expect(result.rows[1]).toMatchObject({
      date: "2023-09-16",
      detail: "JOHN DOE",
    });
    expect(
      accountRefsIn(result.rows).map((entry) => refLast4(entry.ref)),
    ).toEqual(["2345", "1234"]);
  });

  it("recognises a CIBC bank export: withdrawals out, deposits in", () => {
    const result = read(CIBC_BANK);
    expect(detectFormat(parseCsv(CIBC_BANK)).id).toBe("cibc-bank");
    expect(result.rows.map((row) => row.amount)).toEqual([-500, -3.45, 2500]);
  });

  it("recognises a CIBC card export by the masked card number", () => {
    const rows = parseCsv(CIBC_CARD);
    expect(detectFormat(rows).id).toBe("cibc-card");

    const result = readRows(rows, detectFormat(rows));
    expect(result.rows.map((row) => row.amount)).toEqual([-24.5, 600]);
    expect(refLast4(result.rows[0].accountRef)).toBe("1234");
  });

  it("maps an unknown bank by its header names", () => {
    const result = read("Posted Date,Payee,Amount\n2024-01-02,Costco,-120.50");
    expect(result.rows[0]).toMatchObject({
      description: "Costco",
      amount: -120.5,
    });
  });

  it("maps a headerless file by shape", () => {
    const format = detectFormat(
      parseCsv("2024-01-02,A small shop in town,-120.50"),
    );
    expect(format.columns.hasHeader).toBe(false);
    expect(format.columns.date).toBe(0);
    expect(format.columns.description).toBe(1);
  });

  it("falls back to RBC's US column when the Canadian one is empty", () => {
    const usd = [
      '"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"',
      'Chequing,123,9/15/2023,,"AMAZON.COM",,,-20.00',
    ].join("\r\n");
    const result = read(usd);
    expect(result.rows[0]).toMatchObject({ amount: -20, currency: "USD" });
  });
});

describe("rows it will not read", () => {
  it("says which line had no date and which had no amount", () => {
    const result = read(
      "Date,Description,Amount\n2024-01-02,A,10\nnot a date,B,5\n2024-01-03,C,",
    );
    expect(result.rows.map((row) => row.amount)).toEqual([10]);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0].reason).toMatch(/No date/);
    expect(result.skipped[1].reason).toBe("No amount");
  });

  /** A row that moves nothing describes nothing, and v2 rejects the posting. */
  it("skips a zero amount, and says so", () => {
    const result = read("Date,Description,Amount\n2024-01-02,A,0.00");
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toBe("A zero amount");
  });

  it("falls back to the detail, then to a placeholder, for a description", () => {
    const noDescription = [
      '"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"',
      'Chequing,123,9/15/2023,,,"ONLY THE DETAIL",-20.00,',
    ].join("\r\n");
    expect(read(noDescription).rows[0].description).toBe("ONLY THE DETAIL");
  });
});

describe("flipping the signs", () => {
  it("flips every amount on request", () => {
    const result = read("Date,Description,Amount\n2024-01-02,A,10", true);
    expect(result.rows[0].amount).toBe(-10);
  });

  /**
   * The mistake worth a screen of its own: a file read backwards turns a year
   * of groceries into a year of income, and every figure downstream inherits
   * it.
   */
  it("suspects backwards signs when card payments read as money out", () => {
    const flipped = read(CIBC_CARD, true).rows;
    const verdict = suggestFlip(flipped, true);
    expect(verdict.flip).toBe(true);
    expect(verdict.reason).toMatch(/Card payments/);
  });

  it("is content when card payments read as money in", () => {
    expect(suggestFlip(read(CIBC_CARD).rows, true).flip).toBe(false);
  });

  it("suspects backwards signs when pay reads as money out", () => {
    const flipped = read(RBC, true).rows;
    const verdict = suggestFlip(flipped, false);
    expect(verdict.flip).toBe(true);
    expect(verdict.reason).toMatch(/Pay reads as money out/);
  });

  it("is content with a normal chequing export", () => {
    expect(suggestFlip(read(RBC).rows, false).flip).toBe(false);
  });

  /** With nothing to anchor on, most rows on any account are spending. */
  it("suspects a file where almost everything is money in", () => {
    const rows: StatementRow[] = Array.from({ length: 12 }, (_, index) => ({
      line: index + 1,
      date: "2024-03-01",
      description: "SOMETHING UNRECOGNISED",
      detail: "",
      amount: 10,
      accountRef: null,
      currency: null,
    }));
    expect(suggestFlip(rows, false).flip).toBe(true);
  });

  it("says nothing about an empty file", () => {
    expect(suggestFlip([], false)).toEqual({ flip: false, reason: null });
  });

  /** Too few rows to draw a conclusion from. */
  it("does not guess from a handful of rows", () => {
    const rows: StatementRow[] = [
      {
        line: 1,
        date: "2024-03-01",
        description: "UNRECOGNISED",
        detail: "",
        amount: 10,
        accountRef: null,
        currency: null,
      },
    ];
    expect(suggestFlip(rows, false).flip).toBe(false);
  });
});

describe("accountRefsIn", () => {
  it("counts the accounts in a multi-account file, busiest first", () => {
    expect(accountRefsIn(read(RBC).rows)).toEqual([
      { ref: "06702-5012345", count: 3 },
      { ref: "5191230012341234", count: 1 },
    ]);
  });

  it("is empty when the file names no accounts", () => {
    expect(accountRefsIn(read(CIBC_BANK).rows)).toEqual([]);
  });

  it("takes the last four digits, however the file writes them", () => {
    expect(refLast4("4500********1234")).toBe("1234");
    expect(refLast4("06702-5012345")).toBe("2345");
    expect(refLast4(null)).toBeNull();
    expect(refLast4("x")).toBeNull();
  });
});
