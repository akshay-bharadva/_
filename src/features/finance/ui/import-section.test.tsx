import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  FinAccount,
  FinCategory,
  FinPosting,
  FinTransaction,
} from "@/types";
import { parseCsv } from "../import/csv";
import { detectFormat, readRows } from "../import/statement";
import { importHashes } from "../import/match";
import { ImportSection } from "./import-section";

/**
 * The parsing, classifying and matching each have their own tests under
 * `import/`. What this covers is the part only the screen can get wrong: that
 * the rows the ledger already holds are **not written again**, that a reversed
 * file is a question rather than an assumption, and that what is written carries
 * the hash that makes the next import a no-op.
 */

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  saveRule: vi.fn(),
  deleteRule: vi.fn(),
  createBatch: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  rules: [] as unknown[],
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetFinCategoryRulesQuery: () => ({ data: mocks.rules }),
  useRecordFinTransactionMutation: () => [mocks.record, { isLoading: false }],
  useSaveFinCategoryRuleMutation: () => [mocks.saveRule, { isLoading: false }],
  useDeleteFinCategoryRuleMutation: () => [
    mocks.deleteRule,
    { isLoading: false },
  ],
  useCreateFinImportBatchMutation: () => [
    mocks.createBatch,
    { isLoading: false },
  ],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

const ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";

/**
 * One account on purpose. With exactly one the screen picks it, which is both
 * the sensible behaviour and the only way to reach the file input in jsdom —
 * Radix's Select does not open here, as the exchange section's tests found.
 */
const accounts: FinAccount[] = [
  {
    id: ACCOUNT_ID,
    name: "Everyday chequing",
    kind: "chequing",
    currency: "CAD",
    is_liquid: true,
  },
] as FinAccount[];

const categories: FinCategory[] = [
  {
    id: "88888888-8888-4888-8888-888888888888",
    name: "Groceries",
    bucket: "need",
  },
] as FinCategory[];

/** A plain RBC-shaped chequing export. */
const CSV = [
  "Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$",
  "Chequing,00001-1234567,9/2/2026,,LOBLAWS #123,,-42.10,",
  "Chequing,00001-1234567,9/4/2026,,TIM HORTONS,,-6.25,",
].join("\n");

const file = (text = CSV) =>
  new File([text], "statement.csv", { type: "text/csv" });

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p1",
    transaction_id: "t1",
    account_id: ACCOUNT_ID,
    amount_minor: 0,
    currency: "CAD",
    fee_minor: 0,
    fx_rate: 1,
    base_amount_minor: 0,
    category_id: null,
    ...over,
  }) as FinPosting;

const section = (over: Partial<Parameters<typeof ImportSection>[0]> = {}) =>
  render(
    <ImportSection
      accounts={accounts}
      categories={categories}
      transactions={[]}
      rates={{}}
      base="CAD"
      {...over}
    />,
  );

/** Picks the account and loads a file, which is every test's starting point. */
const load = async (text = CSV) => {
  fireEvent.change(screen.getByLabelText(/The CSV your bank exports/), {
    target: { files: [file(text)] },
  });
  await screen.findByText(/rows read from statement.csv/);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rules = [];
  mocks.record.mockReturnValue({ unwrap: () => Promise.resolve("new-id") });
  mocks.saveRule.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  mocks.deleteRule.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.createBatch.mockReturnValue({
    unwrap: () => Promise.resolve("batch-1"),
  });
  mocks.confirm.mockResolvedValue(true);
});

describe("before a file is chosen", () => {
  it("asks for an account to import into when there are none", () => {
    section({ accounts: [] });
    expect(screen.getByText("No accounts to import into")).toBeInTheDocument();
  });

  /** The file never leaves the browser, and saying so is the point. */
  it("says the file is not uploaded anywhere", () => {
    section();
    expect(
      screen.getByText(/Nothing is uploaded anywhere/),
    ).toBeInTheDocument();
  });
});

describe("reading the file", () => {
  it("reads the rows and says how many", async () => {
    section();
    await load();

    expect(
      screen.getByText(/2 rows read from statement.csv/),
    ).toBeInTheDocument();
    // Matched case-insensitively: the row shows the normalised merchant name,
    // not the bank's upper-case wording.
    expect(screen.getByText(/loblaws/i)).toBeInTheDocument();
  });

  /**
   * The most destructive thing this screen could get wrong: a reversed file
   * turns a year of groceries into a year of income, and every figure
   * downstream inherits it. So it is offered, never applied on its own.
   */
  it("offers to reverse the signs rather than doing it", async () => {
    section();
    await load();

    expect(screen.getByText(/Signs as the file has them/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reverse the signs/ }));
    expect(screen.getByText(/Signs are reversed/)).toBeInTheDocument();
  });
});

describe("not writing what is already here", () => {
  /**
   * Re-importing an overlapping range is the normal case, not an error. The
   * hash makes those rows recognisable, and they are excluded rather than
   * written twice.
   */
  it("excludes a row it has already imported", async () => {
    // The hash is computed with the same pure functions the screen uses — the
    // claim under test is "a row whose hash is already in the ledger is left
    // out", not what the hash happens to be.
    const parsed = parseCsv(CSV);
    const [firstHash] = importHashes(
      readRows(parsed, detectFormat(parsed)).rows,
    );

    const already = {
      id: "t8",
      date: "2026-09-02",
      description: "Loblaws",
      kind: "spend",
      is_pending: false,
      import_hash: firstHash,
      fin_posting: [
        posting({ amount_minor: -4_210, base_amount_minor: -4_210 }),
      ],
    } as FinTransaction;

    section({ transactions: [already] });
    await load();

    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    expect(
      screen.getByText(/Already imported from an earlier file/),
    ).toBeInTheDocument();
  });

  it("flags a possible duplicate but still offers to import it", async () => {
    const byHand = {
      id: "t9",
      date: "2026-09-02",
      description: "Groceries",
      kind: "spend",
      is_pending: false,
      import_hash: null,
      fin_posting: [
        posting({ amount_minor: -4_210, base_amount_minor: -4_210 }),
      ],
    } as FinTransaction;

    section({ transactions: [byHand] });
    await load();

    expect(
      screen.getByText(/might be the same purchase, or a second identical one/),
    ).toBeInTheDocument();
    // Flagged, not dropped: the import cannot know, so the owner decides.
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
  });
});

describe("writing the rows", () => {
  it("records each selected row with its hash and batch", async () => {
    section();
    await load();

    fireEvent.click(screen.getByRole("button", { name: /^Import 2$/ }));

    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(2));

    const { transaction, postings } = mocks.record.mock.calls[0][0];
    expect(transaction.date).toBe("2026-09-02");
    expect(transaction.import_batch_id).toBe("batch-1");
    // The hash is what makes importing the same statement again a no-op.
    expect(transaction.import_hash).toBeTruthy();
    expect(postings[0]).toMatchObject({
      account_id: ACCOUNT_ID,
      amount_minor: -4_210,
      currency: "CAD",
    });
  });

  /**
   * A base-currency posting is priced, not unpriced: `fx_rate: 1`. Leaving it
   * null would make the reports and budgets treat it as missing a rate and drop
   * it from every total.
   */
  it("prices a base-currency row rather than leaving it unpriced", async () => {
    section();
    await load();
    fireEvent.click(screen.getByRole("button", { name: /^Import 2$/ }));

    await waitFor(() => expect(mocks.record).toHaveBeenCalled());
    expect(mocks.record.mock.calls[0][0].postings[0]).toMatchObject({
      fx_rate: 1,
      base_amount_minor: -4_210,
    });
  });

  it("starts a batch first, so the rows know where they came from", async () => {
    section();
    await load();
    fireEvent.click(screen.getByRole("button", { name: /^Import 2$/ }));

    await waitFor(() => expect(mocks.createBatch).toHaveBeenCalled());
    expect(mocks.createBatch.mock.calls[0][0]).toMatchObject({
      account_id: ACCOUNT_ID,
      file_name: "statement.csv",
      rows_imported: 2,
    });
  });

  it("writes nothing when the batch cannot be started", async () => {
    mocks.createBatch.mockReturnValue({
      unwrap: () => Promise.reject(new Error("nope")),
    });

    section();
    await load();
    fireEvent.click(screen.getByRole("button", { name: /^Import 2$/ }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.record).not.toHaveBeenCalled();
  });

  /** One bad row must not abandon the other forty-nine. */
  it("keeps going when a row fails, and says how many did not land", async () => {
    mocks.record
      .mockReturnValueOnce({ unwrap: () => Promise.reject(new Error("bad")) })
      .mockReturnValue({ unwrap: () => Promise.resolve("id") });

    section();
    await load();
    fireEvent.click(screen.getByRole("button", { name: /^Import 2$/ }));

    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringMatching(/1 imported, 1 could not be written/),
        expect.anything(),
      ),
    );
  });
});

describe("what it has learned", () => {
  const rule = {
    id: "r1",
    pattern: "LOBLAWS",
    category_id: categories[0].id,
    kind: "expense",
  };

  /**
   * A rule is a standing instruction, so a wrong one mis-files the same merchant
   * for as long as it exists. Something learned silently has to be visible.
   */
  it("shows what it files automatically, and lets one be forgotten", async () => {
    mocks.rules = [rule];
    section();

    const panel = within(screen.getByLabelText("What it has learned"));
    fireEvent.click(panel.getByRole("button", { name: /files automatically/ }));

    expect(panel.getByText("LOBLAWS")).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: /Forget LOBLAWS/ }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    await waitFor(() => expect(mocks.deleteRule).toHaveBeenCalledWith("r1"));
  });

  it("says nothing at all when it has learned nothing", () => {
    section();
    expect(screen.queryByLabelText("What it has learned")).toBeNull();
  });
});
