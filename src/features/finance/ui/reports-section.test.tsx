import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FinCategory, FinPosting, FinTransaction } from "@/types";
import { ReportsSection } from "./reports-section";

/**
 * The figures here come from the real `buildReport` over real postings — the
 * section is pure props and no hooks, so there is nothing to mock and nothing
 * standing between the fixtures and the arithmetic on screen.
 *
 * Fixtures sit in the current year so the default "All time" range always
 * contains them, rather than pinning a date that would rot.
 */

const YEAR = new Date().getFullYear();

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t",
    account_id: "a1",
    category_id: null,
    amount_minor: -4500,
    currency: "CAD",
    base_amount_minor: -4500,
    ...over,
  }) as FinPosting;

const txn = (over: Partial<FinTransaction>): FinTransaction =>
  ({
    id: "t",
    date: `${YEAR}-03-20`,
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: [posting({})],
    ...over,
  }) as FinTransaction;

const CATEGORIES: FinCategory[] = [
  {
    id: "c-salary",
    name: "Salary",
    bucket: "income",
    is_essential: false,
    sort_order: 0,
  },
  {
    id: "c-groceries",
    name: "Groceries",
    bucket: "need",
    is_essential: true,
    sort_order: 1,
  },
  {
    id: "c-invest",
    name: "Investments",
    bucket: "save",
    is_essential: false,
    sort_order: 2,
  },
];

const SALARY = txn({
  id: "t1",
  date: `${YEAR}-03-15`,
  description: "Salary",
  kind: "earn",
  fin_posting: [
    posting({
      amount_minor: 250_000,
      base_amount_minor: 250_000,
      category_id: "c-salary",
    }),
  ],
});

const GROCERIES = txn({
  id: "t2",
  date: `${YEAR}-03-20`,
  description: "Loblaws",
  merchant: "LOBLAWS",
  fin_posting: [
    posting({
      amount_minor: -8_214,
      base_amount_minor: -8_214,
      category_id: "c-groceries",
    }),
  ],
});

const INVESTED = txn({
  id: "t3",
  date: `${YEAR}-04-05`,
  description: "Wealthsimple",
  fin_posting: [
    posting({
      amount_minor: -100_000,
      base_amount_minor: -100_000,
      category_id: "c-invest",
    }),
  ],
});

/** A rupee spend on a day with no cached rate. */
const UNPRICED = txn({
  id: "t4",
  date: `${YEAR}-04-10`,
  description: "Rent at home",
  fin_posting: [
    posting({
      amount_minor: -6_024_000,
      currency: "INR",
      base_amount_minor: null,
      fx_rate: null,
      category_id: "c-groceries",
    }),
  ],
});

const ALL = [SALARY, GROCERIES, INVESTED];

const reports = (transactions = ALL, onImport?: () => void) =>
  render(
    <ReportsSection
      transactions={transactions}
      categories={CATEGORIES}
      base="CAD"
      onImport={onImport}
    />,
  );

describe("the three figures", () => {
  /**
   * Earned 2,500; spent 82.14; put aside 1,000. "Saved" is deliberately not
   * spending — money kept is not money gone — which is the distinction v1's
   * report conflated until it was split into three.
   */
  it("separates earned, spent and saved", () => {
    reports();

    expect(
      screen.getByText("Earned").parentElement?.parentElement,
    ).toHaveTextContent("$2,500");
    expect(
      screen.getByText("Spent").parentElement?.parentElement,
    ).toHaveTextContent("$82");
    expect(
      screen.getByText("Saved & invested").parentElement?.parentElement,
    ).toHaveTextContent("$1,000");
  });

  it("says what share of earnings was kept", () => {
    reports();
    // 2,500 earned less 82.14 spent is 2,417.86 — about 97%.
    expect(screen.getByText(/97% of what you earned/)).toBeInTheDocument();
  });

  it("says so plainly when there were no earnings to keep a share of", () => {
    reports([GROCERIES]);
    expect(screen.getByText("No earnings in this range")).toBeInTheDocument();
  });
});

describe("the range", () => {
  /**
   * The most important thing on the screen. A report covering two months while
   * its label says three years is the one way this page can genuinely mislead.
   */
  it("warns when the ledger starts after the range does", () => {
    reports();
    // "All time" begins at the first transaction, so by construction there is
    // no gap to warn about — that is the default precisely because it cannot
    // mislead. The warning is for a range the reader chose that reaches back
    // further than their records do.
    expect(screen.queryByText(/Your ledger starts on/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Last 12 months" }));
    expect(screen.getByText(/Your ledger starts on/)).toBeInTheDocument();
  });

  it("offers the importer only when there is somewhere to send you", () => {
    // The offer lives in the gap notice, so the range has to reach back past
    // the ledger for either case to be visible at all.
    reports();
    fireEvent.click(screen.getByRole("tab", { name: "Last 12 months" }));
    expect(screen.queryByRole("button", { name: /Import/ })).toBeNull();

    reports(ALL, () => {});
    fireEvent.click(screen.getAllByRole("tab", { name: "Last 12 months" })[1]);
    expect(screen.getAllByRole("button", { name: /Import/ })).toHaveLength(1);
  });

  it("has nothing to report on an empty ledger", () => {
    reports([]);
    expect(
      // Regex, because the sentence ends in a full stop and `getByText`
      // compares the element's whole normalised text.
      screen.getByText(/Nothing recorded in this range yet/),
    ).toBeInTheDocument();
  });
});

describe("where it went", () => {
  it("ranks spending by category", () => {
    reports();
    const where = within(screen.getByLabelText("Where it went"));
    expect(where.getByText("Groceries")).toBeInTheDocument();
  });

  it("lists income separately from spending", () => {
    reports();
    const from = within(screen.getByLabelText("Where it came from"));
    expect(from.getByText("Salary")).toBeInTheDocument();
  });

  it("ranks the merchants", () => {
    reports();
    const merchants = within(screen.getByLabelText("Where you spent most"));
    expect(merchants.getByText("LOBLAWS")).toBeInTheDocument();
  });
});

describe("what it could not count", () => {
  it("says how many postings had no rate", () => {
    reports([SALARY, GROCERIES, UNPRICED]);
    expect(
      screen.getByText(/1 posting in another currency had no exchange rate/),
    ).toBeInTheDocument();
  });

  it("stays quiet when everything converted", () => {
    reports();
    expect(screen.queryByText(/had no exchange rate/)).toBeNull();
  });
});

describe("switching range", () => {
  it("recomputes when a different preset is chosen", () => {
    reports();
    // Last year contains none of the fixtures, which are all in this one.
    fireEvent.click(screen.getByRole("tab", { name: "Last year" }));
    expect(
      // Regex, because the sentence ends in a full stop and `getByText`
      // compares the element's whole normalised text.
      screen.getByText(/Nothing recorded in this range yet/),
    ).toBeInTheDocument();
  });

  it("offers explicit dates on the custom range", () => {
    reports();
    fireEvent.click(screen.getByRole("tab", { name: "Custom" }));
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });
});

/**
 * Reading the report without an exchange rate.
 *
 * The base view converts everything and needs a cached rate to do it; the rupee
 * spending below has none, so that view is genuinely short. Converting it at
 * today's rate would be worse than leaving it out — so the screen leaves it out,
 * says so, and offers the view that needs no rate at all.
 */
describe("irrespective of currency", () => {
  const RUPEES = txn({
    id: "t-inr",
    date: `${YEAR}-03-21`,
    description: "Rent, back home",
    fin_posting: [
      posting({
        id: "p-inr",
        category_id: "c-groceries",
        amount_minor: -6_000_000,
        currency: "INR",
        // No rate was cached for that day.
        base_amount_minor: null,
      }),
    ],
  });

  const MIXED = [...ALL, RUPEES];

  it("says nothing about currency when there is only one", () => {
    reports();
    expect(screen.queryByRole("tablist", { name: "Currency" })).toBeNull();
  });

  it("offers each currency the range actually contains", () => {
    reports(MIXED);
    const picker = within(screen.getByRole("tablist", { name: "Currency" }));

    expect(picker.getByRole("tab", { name: /CAD, converted/ })).toBeTruthy();
    expect(picker.getByRole("tab", { name: /INR only/ })).toBeTruthy();
  });

  /** The state the base view cannot describe: money with no rate to price it. */
  it("leaves the unpriced rupees out of the dollar view, and points a way out", () => {
    reports(MIXED);
    expect(screen.getByText(/had no exchange rate/)).toBeInTheDocument();
    expect(screen.getByText(/needs no rate/)).toBeInTheDocument();
  });

  it("reports the rupees in rupees, exactly, with no rate involved", () => {
    reports(MIXED);
    fireEvent.click(screen.getByRole("tab", { name: /INR only/ }));

    // ₹60,000 spent — the whole of it, though not one rupee could be converted.
    // Twice on screen: the headline total, and the category line behind it. Both
    // matter, because a native report has to break down like any other.
    expect(screen.getAllByText("₹60,000").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/had no exchange rate/)).toBeNull();
  });

  /** Narrower, not converted — and the screen must not let that be misread. */
  it("says the other currencies are absent rather than included", () => {
    reports(MIXED);
    fireEvent.click(screen.getByRole("tab", { name: /INR only/ }));

    expect(
      screen.getByText(/not shown here rather than converted/),
    ).toBeInTheDocument();
  });
});

describe("any stretch of years", () => {
  /**
   * The range used to offer a single hard-coded "Since {year − 3}" — the right
   * question asked of the wrong year, and nothing at all for someone whose
   * records start further back.
   */
  it("offers a start year for each year the ledger covers", () => {
    const older = txn({
      id: "t-old",
      date: `${YEAR - 2}-06-01`,
      fin_posting: [posting({ id: "p-old" })],
    });

    reports([...ALL, older]);
    expect(
      screen.getByRole("button", { name: String(YEAR - 1) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: String(YEAR - 2) }),
    ).toBeInTheDocument();
  });

  it("offers no start year older than the ledger itself", () => {
    reports();
    expect(screen.queryByRole("button", { name: String(YEAR - 5) })).toBeNull();
  });

  it("reports from the year chosen", () => {
    const older = txn({
      id: "t-old",
      date: `${YEAR - 2}-06-01`,
      description: "Older thing",
      fin_posting: [
        posting({
          id: "p-old",
          amount_minor: -111_11,
          base_amount_minor: -111_11,
        }),
      ],
    });

    reports([...ALL, older]);
    fireEvent.click(screen.getByRole("button", { name: String(YEAR - 1) }));

    // The older row is before the chosen start, so it drops out of the total.
    expect(screen.queryByText("$193.25")).toBeNull();
  });
});
