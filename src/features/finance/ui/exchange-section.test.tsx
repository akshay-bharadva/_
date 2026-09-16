import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FinPosting, FinRate, FinTransaction } from "@/types";
import { ExchangeSection } from "./exchange-section";

/**
 * `fx/remittances.test.ts` covers the margin arithmetic and `money/rates.test.ts`
 * the percentile. What is left for the screen is the honesty: that it does not
 * reach the network to open, that it says how old the cached quote is, and that
 * an unmeasurable cost reads as unknown rather than as nothing.
 */

const mocks = vi.hoisted(() => ({
  cacheRates: vi.fn(),
  saveSettings: vi.fn(),
  fetchLatest: vi.fn(),
  fetchHistory: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetFinCurrenciesQuery: () => ({
    data: [
      { code: "CAD", name: "Canadian dollar", exponent: 2 },
      { code: "INR", name: "Indian rupee", exponent: 2 },
      { code: "JPY", name: "Japanese yen", exponent: 0 },
    ],
  }),
  useCacheFinRatesMutation: () => [mocks.cacheRates, { isLoading: false }],
  useSaveFinSettingsMutation: () => [mocks.saveSettings, { isLoading: false }],
}));

vi.mock("../fx/source", async (importOriginal) => {
  // The pure helpers stay real — only the two that touch the network are
  // replaced, so `isRateAvailable` still answers from the actual ECB list.
  const actual = await importOriginal<typeof import("../fx/source")>();
  return {
    ...actual,
    fetchLatestRates: mocks.fetchLatest,
    fetchRateHistory: mocks.fetchHistory,
  };
});

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

const TODAY = "2026-09-16";

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t",
    account_id: "a1",
    amount_minor: 0,
    currency: "CAD",
    fee_minor: 0,
    fx_rate: null,
    base_amount_minor: null,
    category_id: null,
    ...over,
  }) as FinPosting;

const sendHome = (
  id: string,
  date: string,
  out: number,
  into: number,
): FinTransaction =>
  ({
    id,
    date,
    description: "To the family account",
    kind: "transfer",
    fin_posting: [
      posting({ id: `${id}-a`, amount_minor: -out }),
      posting({
        id: `${id}-b`,
        account_id: "a2",
        amount_minor: into,
        currency: "INR",
      }),
    ],
  }) as FinTransaction;

/** Enough days that the percentile will answer. */
const history: FinRate[] = Array.from({ length: 20 }, (_, index) => ({
  base: "CAD",
  quote: "INR",
  as_of: `2026-08-${String(index + 20).padStart(2, "0")}`,
  rate: 58 + index * 0.1,
}));

const section = (over: Partial<Parameters<typeof ExchangeSection>[0]> = {}) =>
  render(
    <ExchangeSection
      rateRows={[{ base: "CAD", quote: "INR", as_of: "2026-09-15", rate: 61 }]}
      base="CAD"
      home="INR"
      transactions={[]}
      {...over}
    />,
  );

/**
 * Radix's Select calls pointer-capture APIs jsdom does not implement, and
 * `scrollIntoView` on the highlighted option. Without these the trigger throws
 * instead of opening.
 */
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    scrollIntoView: () => {},
  });
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Pinned, so "46 days old" stays true tomorrow. `shouldAdvanceTime` keeps
  // `waitFor`'s own timers running under the fake clock.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  mocks.cacheRates.mockReturnValue({ unwrap: () => Promise.resolve(31) });
  mocks.saveSettings.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  mocks.fetchLatest.mockResolvedValue({
    base: "CAD",
    asOf: TODAY,
    rates: { INR: 61.2 },
  });
  mocks.fetchHistory.mockResolvedValue([
    { date: "2026-09-01", rate: 60.1 },
    { date: "2026-09-02", rate: 60.4 },
  ]);
});

describe("opening the screen", () => {
  /**
   * The rule the whole section is built on. A screen that fetches to render is a
   * screen that fails to render on a bad connection — and rates are an
   * enhancement to a ledger that has to keep working without them.
   */
  it("does not touch the network to open", () => {
    section();
    expect(mocks.fetchLatest).not.toHaveBeenCalled();
    expect(mocks.fetchHistory).not.toHaveBeenCalled();
  });

  it("shows the cached rate and the day it was quoted", () => {
    section();
    expect(screen.getByText("61.0000")).toBeInTheDocument();
    expect(screen.getByText("15 Sep 2026")).toBeInTheDocument();
  });

  /**
   * Stated, not implied: this quote prices every converted figure on every other
   * screen, so its age is a fact about the whole module.
   */
  it("says when the cached quote is getting old", () => {
    section({
      rateRows: [{ base: "CAD", quote: "INR", as_of: "2026-08-01", rate: 60 }],
    });
    expect(screen.getByText(/46 days old/)).toBeInTheDocument();
  });

  it("says plainly when nothing is cached at all", () => {
    section({ rateRows: [] });
    expect(screen.getByText("No rate cached yet")).toBeInTheDocument();
  });
});

describe("is it a good rate", () => {
  /** Two data points do not make a percentile, and a number from noise is worse
   * than admitting there is nothing to compare against. */
  it("refuses to score one rate against almost no history", () => {
    section();
    expect(screen.getByText("Not enough history")).toBeInTheDocument();
    expect(screen.getByText(/needs about ten days/)).toBeInTheDocument();
  });

  it("gives a verdict once there is history", () => {
    // Today's 61 is above every one of the 20 cached days (58.0–59.9).
    section({
      rateRows: [
        ...history,
        { base: "CAD", quote: "INR", as_of: "2026-09-15", rate: 61 },
      ],
    });
    expect(screen.getByText("Better than usual")).toBeInTheDocument();
  });
});

describe("fetching", () => {
  it("caches what came back", async () => {
    section();
    fireEvent.click(screen.getByRole("button", { name: /Update rates/ }));

    await waitFor(() =>
      expect(mocks.cacheRates).toHaveBeenCalledWith([
        expect.objectContaining({
          base: "CAD",
          quote: "INR",
          as_of: TODAY,
          rate: 61.2,
        }),
      ]),
    );
  });

  /** An unreachable feed is a degraded module, not a broken one. */
  it("says the feed was unreachable and caches nothing", async () => {
    mocks.fetchLatest.mockResolvedValue(null);
    section();
    fireEvent.click(screen.getByRole("button", { name: /Update rates/ }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.cacheRates).not.toHaveBeenCalled();
    // The rate already cached is still on screen.
    expect(screen.getByText("61.0000")).toBeInTheDocument();
  });

  it("stores the history it loads as dated rows", async () => {
    section();
    fireEvent.click(screen.getByRole("button", { name: /Load 90 days/ }));

    await waitFor(() =>
      expect(mocks.cacheRates).toHaveBeenCalledWith([
        expect.objectContaining({ as_of: "2026-09-01", rate: 60.1 }),
        expect.objectContaining({ as_of: "2026-09-02", rate: 60.4 }),
      ]),
    );
  });
});

describe("what you have sent home", () => {
  it("shows what was quoted beside the market rate that day", () => {
    section({
      rateRows: [{ base: "CAD", quote: "INR", as_of: "2026-09-01", rate: 60 }],
      transactions: [sendHome("t1", "2026-09-02", 100_000, 5_900_000)],
    });

    const table = within(screen.getByRole("table"));
    expect(table.getByText("59.00")).toBeInTheDocument();
    expect(table.getByText("60.00")).toBeInTheDocument();
  });

  /**
   * The distinction that matters: a cost nobody can measure must not be reported
   * as no cost, or the provider with no cached rates looks like the cheapest.
   */
  it("reads an unmeasurable cut as unknown, not as zero", () => {
    section({
      rateRows: [],
      transactions: [sendHome("t1", "2026-05-02", 100_000, 5_900_000)],
    });

    expect(
      within(screen.getByRole("table")).getByText("unknown"),
    ).toBeInTheDocument();
    expect(screen.getByText("Not measurable")).toBeInTheDocument();
  });

  it("invites the first transfer rather than showing an empty table", () => {
    section();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });
});

describe("which currencies", () => {
  /**
   * Not covered here: actually choosing a currency, which is the path that calls
   * `saveFinSettings`. Radix's Select does not open under jsdom even with the
   * pointer-capture shims above, and a test that clicks a trigger which never
   * opens asserts nothing. The gap is real and worth stating rather than
   * papering over with a test that passes for the wrong reason.
   */
  it("offers the corridor as something to set when there is none", () => {
    section({ home: null });

    expect(screen.getByText("No corridor set")).toBeInTheDocument();
    // No rate card and no table: both are questions about a pair, and there is
    // no pair yet.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Today's rate")).toBeNull();
  });

  /** A currency the free feed does not quote will never convert, however many
   * times the button is pressed. Saying so beats leaving it a mystery. */
  it("says when the base currency has no rate source", () => {
    section({ base: "AED", home: "INR" });
    expect(
      screen.getByText(/free feed does not quote AED/),
    ).toBeInTheDocument();
  });
});
