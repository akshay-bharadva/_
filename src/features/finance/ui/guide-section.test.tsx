import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  FinAccount,
  FinBudget,
  FinCategory,
  FinCommitment,
  FinTransaction,
} from "@/types";
import { SETUP_STEPS } from "../finance-guide";
import { GuideSection } from "./guide-section";

/**
 * The content is prose and is not asserted word by word — a test that pins
 * paragraphs is a test that fails every time the writing improves. What is worth
 * pinning is the one behaviour: **the steps answer themselves from real data**,
 * so the guide does not tell someone with six accounts to add an account.
 */

const account = { id: "a1", name: "Chequing" } as FinAccount;
const category = { id: "c1", name: "Groceries" } as FinCategory;
const commitment = { id: "r1", name: "Rent" } as FinCommitment;
const budget = { id: "b1" } as FinBudget;

const transactions = (count: number): FinTransaction[] =>
  Array.from(
    { length: count },
    (_, index) => ({ id: `t${index}` }) as FinTransaction,
  );

const section = (over: Partial<Parameters<typeof GuideSection>[0]> = {}) =>
  render(
    <GuideSection
      accounts={[]}
      categories={[]}
      commitments={[]}
      transactions={[]}
      budgets={[]}
      onGo={vi.fn()}
      {...over}
    />,
  );

const setup = () => within(screen.getByLabelText("Setting up"));

describe("what to do next", () => {
  it("counts nothing done on an empty module", () => {
    section();
    expect(
      screen.getByText(new RegExp(`0 of ${SETUP_STEPS.length} done`)),
    ).toBeInTheDocument();
  });

  it("marks a step done once the data says so", () => {
    section({ accounts: [account] });
    expect(
      screen.getByText(new RegExp(`1 of ${SETUP_STEPS.length} done`)),
    ).toBeInTheDocument();
  });

  /** An archived account is one you have said is no longer part of the picture. */
  it("does not count an archived account as having one", () => {
    section({
      accounts: [{ ...account, archived_at: "2026-06-01T00:00:00Z" }],
    });
    expect(
      screen.getByText(new RegExp(`0 of ${SETUP_STEPS.length} done`)),
    ).toBeInTheDocument();
  });

  /**
   * The step that cannot be satisfied by setup alone. Runway, savings rate and
   * the forecast are derived from what actually happened, so the guide holds the
   * step open until there is enough of it.
   */
  it("holds the spending step open until there is real spending", () => {
    section({ transactions: transactions(19) });
    expect(
      screen.getByText(new RegExp(`0 of ${SETUP_STEPS.length} done`)),
    ).toBeInTheDocument();

    section({ transactions: transactions(20) });
    expect(
      screen.getAllByText(new RegExp(`1 of ${SETUP_STEPS.length} done`)).length,
    ).toBeGreaterThan(0);
  });

  it("says so when everything is done, instead of nagging", () => {
    section({
      accounts: [account],
      categories: [category],
      commitments: [commitment],
      transactions: transactions(20),
      budgets: [budget],
    });

    expect(screen.getByText(/All done/)).toBeInTheDocument();
    expect(setup().queryByRole("button", { name: /Go there/ })).toBeNull();
  });

  it("takes you to the section a step is about", () => {
    const onGo = vi.fn();
    section({ onGo });

    fireEvent.click(setup().getAllByRole("button", { name: /Go there/ })[0]);
    expect(onGo).toHaveBeenCalledWith(SETUP_STEPS[0].section);
  });
});

describe("the rest of the page", () => {
  it("explains the figures and what to do with them", () => {
    section();
    expect(screen.getByText("What the numbers mean")).toBeInTheDocument();
    expect(screen.getByText("What to do with it")).toBeInTheDocument();
  });

  /** Every idea costs something, and one presented without its cost is a pitch. */
  it("states a trade-off against every idea", () => {
    section();
    const ideas = within(screen.getByLabelText("What to do with it"));
    expect(ideas.getAllByText(/The trade-off:/).length).toBe(
      ideas.getAllByRole("listitem").length,
    );
  });

  it("keeps the detail folded away until asked", () => {
    section();
    const concepts = within(screen.getByLabelText("What the numbers mean"));
    const runway = concepts.getByRole("button", { name: /Runway/ });

    expect(runway).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(runway);
    expect(runway).toHaveAttribute("aria-expanded", "true");
  });

  it("says plainly that none of it is advice", () => {
    section();
    expect(
      screen.getByText(/None of this is financial advice/),
    ).toBeInTheDocument();
  });
});
