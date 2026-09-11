import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FinanceAccount, FinanceCategory, FinanceSettings } from "@/types";

const { importMock } = vi.hoisted(() => ({
  importMock: vi.fn(() => ({
    unwrap: () => Promise.resolve({ batch_id: "b1", inserted: 3, skipped: 0, paired: 0 }),
  })),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetCategoryRulesQuery: () => ({ data: [] }),
  useGetImportBatchesQuery: () => ({ data: [] }),
  useImportTransactionsMutation: () => [importMock, { isLoading: false }],
  useUndoImportMutation: () => [vi.fn()],
  useDeleteCategoryRuleMutation: () => [vi.fn()],
  useRecategoriseTransactionsMutation: () => [vi.fn(), { isLoading: false }],
  useSaveFinanceCategoryMutation: () => [vi.fn()],
}));

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: { profile_data: { name: "Jordan Maplewood" } } }),
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => vi.fn(),
}));

import { ImportSection } from "./import-section";

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const accounts = [
  {
    id: uuid(1),
    name: "CIBC Chequing",
    currency: "CAD",
    kind: "chequing",
    opening_balance: 0,
    opening_date: "2024-01-01",
    is_liquid: true,
    sort_order: 0,
  },
] as FinanceAccount[];

const categories: FinanceCategory[] = [
  { id: uuid(2), name: "Salary", bucket: "income", is_essential: false, sort_order: 0 },
  { id: uuid(3), name: "Dining out", bucket: "want", is_essential: false, sort_order: 1 },
  { id: uuid(4), name: "Transfer", bucket: "transfer", is_essential: false, sort_order: 2 },
];

const CIBC = [
  '2024-03-01,"Internet Banking INTERNET TRANSFER 000000123456",500.00,',
  '2024-03-02,"Point of Sale - Interac RETAIL PURCHASE 000001 TIM HORTONS #12",3.45,',
  '2024-03-05,"Electronic Funds Transfer PAY ACME CORP",,2500.00',
].join("\n");

describe("ImportSection", () => {
  beforeEach(() => importMock.mockClear());

  it("reads a CIBC file, sorts every line, and imports it into the account", async () => {
    render(
      <ImportSection
        accounts={accounts}
        categories={categories}
        transactions={[]}
        settings={{ base_currency: "CAD" } as FinanceSettings}
      />,
    );

    fireEvent.change(screen.getByLabelText("Choose a CSV file"), {
      target: {
        files: [{ name: "cibc.csv", size: CIBC.length, text: () => Promise.resolve(CIBC) }],
      },
    });

    expect(await screen.findByText("cibc.csv")).toBeInTheDocument();
    expect(screen.getByText(/CIBC bank account · 3 transactions/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Import 3 into CIBC Chequing/ }));

    await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
    const args = (importMock.mock.calls[0] as unknown as [{
      accountId: string;
      format: string;
      rows: { amount: number; type: string; category_id: string | null }[];
    }])[0];
    expect(args.accountId).toBe(uuid(1));
    expect(args.format).toBe("cibc-bank");
    expect(args.rows.map((r) => [r.type, r.amount, r.category_id])).toEqual([
      ["expense", 500, uuid(4)],
      ["expense", 3.45, uuid(3)],
      ["earning", 2500, uuid(2)],
    ]);
    expect(await screen.findByText("Imported 3 transactions.")).toBeInTheDocument();
  });
});
