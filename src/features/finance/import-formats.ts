/**
 * What a bank's CSV means.
 *
 * Neither CIBC nor RBC documents its export, so the formats here are
 * recognised by shape rather than trusted by name, and anything unrecognised
 * falls back to a column mapping the owner confirms. Every import also shows
 * a sign check before anything is written: a file read with its signs
 * backwards turns a year of groceries into a year of income, and that is the
 * mistake worth a screen of its own.
 *
 * - **RBC** has a header: "Account Type","Account Number","Transaction Date",
 *   "Cheque Number","Description 1","Description 2","CAD$","USD$". Dates are
 *   M/D/YYYY, amounts signed from the account's side, and one file can hold
 *   several accounts — hence the account number on every row.
 * - **CIBC** has no header. Bank accounts: date (YYYY-MM-DD), description,
 *   withdrawal, deposit. Credit cards add the masked card number as a fifth
 *   column; a purchase is in the first amount column, a payment in the second.
 */

export type DateOrder = "ymd" | "mdy" | "dmy";
export type FormatId = "rbc" | "cibc-bank" | "cibc-card" | "generic";

export interface ColumnMap {
  hasHeader: boolean;
  date: number;
  description: number;
  description2?: number;
  /** One signed amount column… */
  amount?: number;
  /** …or money out and money in as two columns. */
  debit?: number;
  credit?: number;
  /** RBC's second amount column, used when the first is empty. */
  usdAmount?: number;
  accountRef?: number;
  dateOrder: DateOrder;
}

export interface DetectedFormat {
  id: FormatId;
  label: string;
  columns: ColumnMap;
  /** The header row, when the file has one — for the mapping controls. */
  headers: string[] | null;
  /** How many columns the widest early row has. */
  width: number;
}

export interface StatementRow {
  /** 1-based line in the file, for messages. */
  line: number;
  date: string;
  description: string;
  /** RBC's "Description 2": the e-Transfer recipient, a reference. */
  detail: string;
  /** Signed from the account's side: negative is money leaving it. */
  amount: number;
  accountRef: string | null;
  currency: string | null;
}

export interface ReadResult {
  rows: StatementRow[];
  skipped: { line: number; reason: string }[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** YYYY-MM-DD, or null when it is not a date under `order`. */
export function parseDate(value: string, order: DateOrder): string | null {
  const text = value.trim();

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(text);
  if (iso) return valid(+iso[1], +iso[2], +iso[3]);

  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (numeric) {
    const a = +numeric[1];
    const b = +numeric[2];
    let y = +numeric[3];
    if (y < 100) y += 2000;
    return order === "dmy" ? valid(y, b, a) : valid(y, a, b);
  }

  // "Sep 15, 2023", "15 Sep 2023", "15-Sep-2023"
  const words =
    /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(text) ??
    null;
  if (words) {
    const m = MONTHS[words[1].toLowerCase()];
    return m ? valid(+words[3], m, +words[2]) : null;
  }
  const dayFirst = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*\.?[ -](\d{2,4})$/.exec(text);
  if (dayFirst) {
    const m = MONTHS[dayFirst[2].toLowerCase()];
    let y = +dayFirst[3];
    if (y < 100) y += 2000;
    return m ? valid(y, m, +dayFirst[1]) : null;
  }
  return null;
}

/**
 * Which way round a column of slash dates is. A first part over 12 settles
 * it as day-first, a second part over 12 as month-first; with neither, the
 * Canadian banks' own M/D/Y.
 */
export function guessDateOrder(values: string[]): DateOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const value of values) {
    const text = value.trim();
    if (/^\d{4}[-/.]/.test(text)) return "ymd";
    const match = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/.exec(text);
    if (!match) continue;
    if (+match[1] > 12) dayFirst = true;
    if (+match[2] > 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return "dmy";
  return "mdy";
}

/**
 * "$1,234.56", "-12.00", "(12.00)", "12.00-", "CAD 40" — or null when the
 * cell is empty or not a number.
 */
export function parseAmount(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/CA\$|US\$|CAD|USD|\$|\s/gi, "");
  if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  text = text.replace(/,/g, "");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return negative ? -value : value;
}

const norm = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();

const isDateLike = (value: string) =>
  parseDate(value, "mdy") !== null || parseDate(value, "dmy") !== null;

const isAmountLike = (value: string) =>
  value.trim() === "" || parseAmount(value) !== null;

const SYNONYMS: Record<"date" | "description" | "amount" | "debit" | "credit", string[]> = {
  date: ["transaction date", "date", "posted date", "posting date", "trans date", "date posted"],
  description: ["description", "description 1", "details", "memo", "payee", "merchant", "name", "transaction", "narrative"],
  amount: ["amount", "cad$", "cad", "transaction amount", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "paid out", "debits"],
  credit: ["credit", "deposit", "deposits", "money in", "paid in", "credits"],
};

function findColumn(headers: string[], names: string[]): number | undefined {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return index;
  }
  return undefined;
}

export function detectFormat(rows: string[][]): DetectedFormat {
  const early = rows.slice(0, 25);
  const width = early.reduce((max, row) => Math.max(max, row.length), 0);
  const first = rows[0] ?? [];
  const header = first.map(norm);

  // RBC: recognised by its header.
  if (header.includes("transaction date") && header.includes("description 1")) {
    const at = (name: string) => header.indexOf(name);
    const dates = rows.slice(1, 40).map((row) => row[at("transaction date")] ?? "");
    return {
      id: "rbc",
      label: "RBC Royal Bank",
      headers: first,
      width,
      columns: {
        hasHeader: true,
        date: at("transaction date"),
        description: at("description 1"),
        description2: at("description 2") === -1 ? undefined : at("description 2"),
        amount: at("cad$") === -1 ? undefined : at("cad$"),
        usdAmount: at("usd$") === -1 ? undefined : at("usd$"),
        accountRef: at("account number") === -1 ? undefined : at("account number"),
        dateOrder: guessDateOrder(dates),
      },
    };
  }

  // CIBC: no header, an ISO date first, then text, then two amount columns.
  const headerless = first.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(first[0]);
  if (
    headerless &&
    width >= 4 &&
    width <= 5 &&
    early.every((row) => isAmountLike(row[2] ?? "") && isAmountLike(row[3] ?? ""))
  ) {
    const card = early.some((row) => /\d{4}\*+\d{2,4}|\*{4}\d{4}/.test(row[4] ?? ""));
    return {
      id: card ? "cibc-card" : "cibc-bank",
      label: card ? "CIBC credit card" : "CIBC bank account",
      headers: null,
      width,
      columns: {
        hasHeader: false,
        date: 0,
        description: 1,
        debit: 2,
        credit: 3,
        accountRef: card ? 4 : undefined,
        dateOrder: "ymd",
      },
    };
  }

  // Anything else: map by header names when there is a header, by shape when
  // there is not. Either way the owner sees and can change the mapping.
  const hasHeader = first.length > 0 && !first.some(isDateLike);
  const body = hasHeader ? rows.slice(1, 40) : early;

  if (hasHeader) {
    const date = findColumn(header, SYNONYMS.date) ?? 0;
    const amount = findColumn(header, SYNONYMS.amount);
    const debit = findColumn(header, SYNONYMS.debit);
    const credit = findColumn(header, SYNONYMS.credit);
    return {
      id: "generic",
      label: "Other bank",
      headers: first,
      width,
      columns: {
        hasHeader: true,
        date,
        description: findColumn(header, SYNONYMS.description) ?? 1,
        amount: debit !== undefined && credit !== undefined ? undefined : amount ?? 2,
        debit: debit !== undefined && credit !== undefined ? debit : undefined,
        credit: debit !== undefined && credit !== undefined ? credit : undefined,
        dateOrder: guessDateOrder(body.map((row) => row[date] ?? "")),
      },
    };
  }

  const date = Math.max(first.findIndex(isDateLike), 0);
  let description = 1;
  let longest = -1;
  const numeric: number[] = [];
  for (let col = 0; col < width; col += 1) {
    if (col === date) continue;
    const cells = body.map((row) => row[col] ?? "");
    if (cells.every(isAmountLike)) numeric.push(col);
    else {
      const length = cells.reduce((sum, cell) => sum + cell.length, 0);
      if (length > longest) {
        longest = length;
        description = col;
      }
    }
  }
  return {
    id: "generic",
    label: "Other bank",
    headers: null,
    width,
    columns: {
      hasHeader: false,
      date,
      description,
      ...(numeric.length >= 2
        ? { debit: numeric[0], credit: numeric[1] }
        : { amount: numeric[0] ?? 2 }),
      dateOrder: guessDateOrder(body.map((row) => row[date] ?? "")),
    },
  };
}

/** The last four digits of an account or card number, as the file gives it. */
export function refLast4(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(-4) : null;
}

export function readRows(
  rows: string[][],
  format: DetectedFormat,
  { flip = false }: { flip?: boolean } = {},
): ReadResult {
  const { columns } = format;
  const out: StatementRow[] = [];
  const skipped: ReadResult["skipped"] = [];
  const start = columns.hasHeader ? 1 : 0;

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    const line = i + 1;
    const cell = (index: number | undefined) =>
      index === undefined ? "" : (row[index] ?? "");

    const date = parseDate(cell(columns.date), columns.dateOrder);
    if (!date) {
      skipped.push({ line, reason: `No date in “${cell(columns.date) || "(empty)"}”` });
      continue;
    }

    let amount: number | null = null;
    let currency: string | null = null;
    if (columns.debit !== undefined || columns.credit !== undefined) {
      const out = parseAmount(cell(columns.debit));
      const inn = parseAmount(cell(columns.credit));
      if (out !== null || inn !== null) {
        amount = (inn ?? 0) - Math.abs(out ?? 0);
        if (inn !== null && inn < 0) amount = inn - Math.abs(out ?? 0);
      }
    } else {
      amount = parseAmount(cell(columns.amount));
      if (amount === null && columns.usdAmount !== undefined) {
        amount = parseAmount(cell(columns.usdAmount));
        if (amount !== null) currency = "USD";
      }
    }

    if (amount === null) {
      skipped.push({ line, reason: "No amount" });
      continue;
    }
    if (amount === 0) {
      skipped.push({ line, reason: "A zero amount" });
      continue;
    }

    const description = cell(columns.description).replace(/\s+/g, " ").trim();
    const detail = cell(columns.description2).replace(/\s+/g, " ").trim();
    out.push({
      line,
      date,
      description: description || detail || "(no description)",
      detail: description ? detail : "",
      amount: Math.round((flip ? -amount : amount) * 100) / 100,
      accountRef: columns.accountRef === undefined ? null : cell(columns.accountRef) || null,
      currency,
    });
  }

  return { rows: out, skipped };
}

/** The distinct account numbers in a multi-account file, with row counts. */
export function accountRefsIn(rows: StatementRow[]): { ref: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.accountRef) counts.set(row.accountRef, (counts.get(row.accountRef) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([ref, count]) => ({ ref, count }))
    .sort((a, b) => b.count - a.count);
}

const CARD_PAYMENT_IN = /PAYMENT THANK YOU|PAIEMENT MERCI|PAYMENT - THANK YOU|PAYMENT RECEIVED/i;
const PAYROLL = /PAYROLL|PAY ?DEP|DIRECT DEP|DIR DEP|SALARY|\bPAY\b/i;

/**
 * Whether the signs look backwards, and why. Only a suggestion — the sign
 * check shows the rows and the owner decides — but it catches the common
 * case before it is imported: a card whose payments read as money out, or a
 * chequing account whose salary does.
 */
export function suggestFlip(
  rows: StatementRow[],
  isCard: boolean,
): { flip: boolean; reason: string | null } {
  if (rows.length === 0) return { flip: false, reason: null };
  const payments = rows.filter((row) => CARD_PAYMENT_IN.test(row.description));
  if (isCard && payments.length > 0) {
    const backwards = payments.filter((row) => row.amount < 0).length;
    if (backwards > payments.length / 2) {
      return {
        flip: true,
        reason: "Card payments read as money out, so the signs look backwards.",
      };
    }
    return { flip: false, reason: null };
  }
  const pay = rows.filter((row) => PAYROLL.test(row.description));
  if (!isCard && pay.length > 0) {
    const backwards = pay.filter((row) => row.amount < 0).length;
    if (backwards > pay.length / 2) {
      return { flip: true, reason: "Pay reads as money out, so the signs look backwards." };
    }
    return { flip: false, reason: null };
  }
  // With nothing to anchor on, most rows on any account are spending.
  const positive = rows.filter((row) => row.amount > 0).length;
  if (rows.length >= 10 && positive / rows.length > 0.8) {
    return {
      flip: true,
      reason: "Almost everything reads as money in, which is unusual for a statement.",
    };
  }
  return { flip: false, reason: null };
}
