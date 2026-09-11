import { describe, it, expect } from "vitest";
import type { FinanceCategory, FinanceCategoryRule, Transaction } from "@/types";
import { parseCsv } from "./import-csv";
import {
  accountRefsIn,
  detectFormat,
  guessDateOrder,
  parseAmount,
  parseDate,
  readRows,
  refLast4,
  suggestFlip,
  type StatementRow,
} from "./import-formats";
import { classify, historyFrom, normaliseMerchant } from "./import-classify";
import { importHashes, rowStatuses, transferPartners } from "./import-match";

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
});

describe("dates and amounts", () => {
  it.each([
    ["2023-09-15", "mdy", "2023-09-15"],
    ["9/15/2023", "mdy", "2023-09-15"],
    ["15/9/2023", "dmy", "2023-09-15"],
    ["Sep 15, 2023", "mdy", "2023-09-15"],
    ["15-Sep-2023", "mdy", "2023-09-15"],
    ["2/30/2023", "mdy", null],
  ] as const)("reads %s", (value, order, expected) => {
    expect(parseDate(value, order)).toBe(expected);
  });

  it("works out which way round slash dates are", () => {
    expect(guessDateOrder(["1/15/2024", "2/3/2024"])).toBe("mdy");
    expect(guessDateOrder(["15/1/2024", "3/2/2024"])).toBe("dmy");
  });

  it.each([
    ["$1,234.56", 1234.56],
    ["-12.00", -12],
    ["(12.00)", -12],
    ["12.00-", -12],
    ["CAD 40", 40],
    ["", null],
    ["abc", null],
  ] as const)("reads %s", (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });
});

describe("formats", () => {
  it("recognises RBC by its header and reads every account in the file", () => {
    const rows = parseCsv(RBC);
    const format = detectFormat(rows);
    expect(format.id).toBe("rbc");
    const read = readRows(rows, format);
    expect(read.rows.map((r) => r.amount)).toEqual([2500, -450, -82.14, -45.12]);
    expect(read.rows[1]).toMatchObject({ date: "2023-09-16", detail: "JOHN DOE" });
    expect(accountRefsIn(read.rows).map((r) => refLast4(r.ref))).toEqual(["2345", "1234"]);
  });

  it("recognises a CIBC bank export: withdrawals out, deposits in", () => {
    const rows = parseCsv(CIBC_BANK);
    const format = detectFormat(rows);
    expect(format.id).toBe("cibc-bank");
    expect(readRows(rows, format).rows.map((r) => r.amount)).toEqual([-500, -3.45, 2500]);
  });

  it("recognises a CIBC card export by the masked card number", () => {
    const rows = parseCsv(CIBC_CARD);
    const format = detectFormat(rows);
    expect(format.id).toBe("cibc-card");
    const read = readRows(rows, format);
    expect(read.rows.map((r) => r.amount)).toEqual([-24.5, 600]);
    expect(refLast4(read.rows[0].accountRef)).toBe("1234");
  });

  it("maps an unknown bank by its header names", () => {
    const rows = parseCsv("Posted Date,Payee,Amount\n2024-01-02,Costco,-120.50");
    const format = detectFormat(rows);
    expect(format.id).toBe("generic");
    expect(readRows(rows, format).rows[0]).toMatchObject({
      description: "Costco",
      amount: -120.5,
    });
  });

  it("flips on request, and skips what has no date or amount", () => {
    const rows = parseCsv("Date,Description,Amount\n2024-01-02,A,10\nnot a date,B,5\n2024-01-03,C,");
    const read = readRows(rows, detectFormat(rows), { flip: true });
    expect(read.rows.map((r) => r.amount)).toEqual([-10]);
    expect(read.skipped).toHaveLength(2);
  });

  it("suspects backwards signs when card payments read as money out", () => {
    const rows = readRows(parseCsv(CIBC_CARD), detectFormat(parseCsv(CIBC_CARD)), { flip: true }).rows;
    expect(suggestFlip(rows, true).flip).toBe(true);
  });
});

const categories: FinanceCategory[] = [
  "Salary", "Groceries", "Dining out", "Transport", "Payments to people",
  "Money received", "Cash", "Bank fees", "Transfer", "Rent", "Shopping",
].map((name, index) => ({
  id: `c${index}`,
  name,
  bucket: name === "Salary" || name === "Money received" ? "income" : name === "Transfer" ? "transfer" : "want",
  is_essential: false,
  sort_order: index,
}));
const idOf = (name: string) => categories.find((c) => c.name === name)!.id;

const row = (description: string, amount: number, detail = ""): StatementRow => ({
  line: 1,
  date: "2024-03-01",
  description,
  detail,
  amount,
  accountRef: null,
  currency: null,
});

const context = (overrides: Partial<Parameters<typeof classify>[1]> = {}) => ({
  accountKind: "chequing" as const,
  categories,
  rules: [] as FinanceCategoryRule[],
  history: new Map<string, string>(),
  ...overrides,
});

describe("classify", () => {
  it("strips a bank line down to the merchant", () => {
    expect(normaliseMerchant("IDP PURCHASE - 1234 LOBLAWS #1089 TORONTO ON").key).toBe("LOBLAWS");
    expect(normaliseMerchant("TIM HORTONS #1234 MISSISSAUGA ON").display).toBe("Tim Hortons");
  });

  it.each([
    ["PAYROLL DEPOSIT ACME CORP", 2500, "chequing", "income", "Salary", false],
    ["Electronic Funds Transfer PAY ACME CORP", 2500, "chequing", "income", "Salary", false],
    ["INTERAC E-TRF- 1234 JOHN DOE", -450, "chequing", "etransfer_out", "Payments to people", false],
    ["INTERAC E-TRANSFER RECEIVED JANE ROE", 60, "chequing", "etransfer_in", "Money received", false],
    ["Internet Banking INTERNET TRANSFER 000000123456", -500, "chequing", "own_transfer", "Transfer", true],
    ["PAYMENT - CIBC VISA", -600, "chequing", "card_payment", "Transfer", true],
    ["PAYMENT THANK YOU/PAIEMENT MERCI", 600, "credit", "card_payment", "Transfer", true],
    ["ATM WITHDRAWAL 1234 MAIN ST", -100, "chequing", "cash", "Cash", false],
    ["MONTHLY FEE", -16.95, "chequing", "fee", "Bank fees", false],
    ["LOBLAWS #1089 TORONTO ON", -82.14, "chequing", "purchase", "Groceries", false],
    ["UBER EATS TORONTO", -24.5, "credit", "purchase", "Dining out", false],
    ["UBER TRIP HELP.UBER.COM", -18, "credit", "purchase", "Transport", false],
    ["AMAZON.CA MKTPLACE", 30, "credit", "refund", "Shopping", false],
  ] as const)("%s → %s", (description, amount, accountKind, kind, category, isTransfer) => {
    const result = classify(row(description, amount), context({ accountKind }));
    expect(result.kind).toBe(kind);
    expect(result.categoryName).toBe(category);
    expect(result.categoryId).toBe(idOf(category));
    expect(result.isTransfer).toBe(isTransfer);
  });

  it("reads the e-Transfer recipient from RBC's second description", () => {
    const result = classify(row("INTERAC E-TRF- 1234", -450, "JOHN DOE"), context());
    expect(result.counterparty).toBe("JOHN DOE");
    expect(result.merchantKey).toBe("ETRANSFER JOHN DOE");
  });

  it("lets your rule win over everything else", () => {
    const rules: FinanceCategoryRule[] = [
      { id: "r", pattern: "ETRANSFER JOHN DOE", category_id: idOf("Rent"), kind: "expense" },
    ];
    const result = classify(row("INTERAC E-TRF- 1234", -1800, "JOHN DOE"), context({ rules }));
    expect(result).toMatchObject({ categoryName: "Rent", source: "rule", kind: "etransfer_out" });
  });

  it("remembers what you called a merchant before", () => {
    const history = historyFrom([
      { description: "CORNER STORE 22", category_id: idOf("Groceries"), date: "2024-01-01" },
    ]);
    const result = classify(row("CORNER STORE 22 TORONTO ON", -9), context({ history }));
    expect(result).toMatchObject({ categoryName: "Groceries", source: "history" });
  });

  it("leaves what it cannot recognise for you", () => {
    const result = classify(row("XYZZY 42", -10), context());
    expect(result).toMatchObject({ categoryId: null, source: "none" });
  });
});

describe("matching", () => {
  const rows = [row("TIM HORTONS", -2.5), row("TIM HORTONS", -2.5), row("LOBLAWS", -40)];

  it("gives identical lines in one file different fingerprints", () => {
    const hashes = importHashes(rows);
    expect(new Set(hashes).size).toBe(3);
    expect(importHashes(rows)).toEqual(hashes);
  });

  it("recognises rows already imported, and flags a hand-entered twin", () => {
    const hashes = importHashes(rows);
    const existing: Transaction[] = [
      { id: "t1", account_id: "a1", date: "2024-03-01", description: "x", amount: 2.5, type: "expense", import_hash: hashes[0] },
      { id: "t2", account_id: "a1", date: "2024-03-02", description: "Groceries", amount: 40, type: "expense" },
    ];
    expect(rowStatuses(rows, hashes, existing, "a1")).toEqual([
      "already-imported",
      "new",
      "possible-duplicate",
    ]);
  });

  it("pairs a transfer with its other leg in another account", () => {
    const out = [row("Internet Banking INTERNET TRANSFER 0001", -500)];
    const classes = out.map((r) => classify(r, context()));
    const existing: Transaction[] = [
      { id: "far", account_id: "a2", date: "2024-03-09", description: "Transfer", amount: 500, type: "earning" },
      { id: "leg", account_id: "a2", date: "2024-03-02", description: "Online transfer", amount: 500, type: "earning" },
      { id: "paired", account_id: "a2", date: "2024-03-01", description: "Transfer", amount: 500, type: "earning", transfer_group: "g" },
    ];
    const partners = transferPartners(out, classes, existing, {
      accountId: "a1",
      currency: "CAD",
      accountCurrency: new Map([["a2", "CAD"]]),
    });
    expect(partners[0]?.id).toBe("leg");
  });

  it("does not pair across currencies or with a purchase", () => {
    const out = [row("LOBLAWS", -500), row("ONLINE BANKING TRANSFER", -500)];
    const classes = out.map((r) => classify(r, context()));
    const existing: Transaction[] = [
      { id: "inr", account_id: "a2", date: "2024-03-01", description: "x", amount: 500, type: "earning", currency: "INR" },
    ];
    const partners = transferPartners(out, classes, existing, {
      accountId: "a1",
      currency: "CAD",
      accountCurrency: new Map([["a2", "INR"]]),
    });
    expect(partners).toEqual([null, null]);
  });
});
