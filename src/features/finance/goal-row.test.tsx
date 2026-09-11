import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FinanceSettings, FinancialGoal } from "@/types";
import { GoalRow } from "./plan-section";

vi.mock("@/store/api/adminApi", () => ({
  useRecordGoalContributionMutation: () => [vi.fn()],
  useDeleteGoalMutation: () => [vi.fn()],
  useGetGoalContributionsQuery: () => ({ data: [] }),
}));

const goal: FinancialGoal = {
  id: "g1",
  name: "Emergency fund",
  target_amount: 5000,
  current_amount: 1000,
  currency: "CAD",
};

const settings = { base_currency: "CAD" } as FinanceSettings;

const row = (onMove = vi.fn().mockResolvedValue(true)) => {
  render(
    <GoalRow
      goal={goal}
      settings={settings}
      accounts={[]}
      movements={[
        { id: "m1", goal_id: "g1", amount: -200, occurred_on: "2026-09-02", note: "Car repair" },
      ]}
      onMove={onMove}
      onEdit={() => {}}
      onDelete={() => {}}
    />,
  );
  return onMove;
};

describe("GoalRow", () => {
  it("withdraws, as a negative movement with its note", async () => {
    const onMove = row();
    fireEvent.click(screen.getByRole("radio", { name: /Withdraw/ }));
    fireEvent.change(screen.getByLabelText("Amount for Emergency fund"), {
      target: { value: "300" },
    });
    fireEvent.change(screen.getByLabelText("Note for Emergency fund"), {
      target: { value: "Dentist" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Withdraw \$300/ }));
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(-300, null, "Dentist"));
  });

  it("refuses to withdraw more than the goal holds", () => {
    const onMove = row();
    fireEvent.click(screen.getByRole("radio", { name: /Withdraw/ }));
    fireEvent.change(screen.getByLabelText("Amount for Emergency fund"), {
      target: { value: "1500" },
    });
    expect(screen.getByText(/most you can withdraw/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Withdraw \$1,500/ })).toBeDisabled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("shows what moved, and why", () => {
    row();
    expect(screen.getByText("Car repair")).toBeInTheDocument();
  });
});
