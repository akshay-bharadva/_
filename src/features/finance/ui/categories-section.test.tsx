import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FinCategory } from "@/types";
import { FINANCE_LIMITS } from "@/lib/schemas";
import { CategoriesSection } from "./categories-section";

/**
 * Two of these test behaviour this screen *changed* rather than ported, and they
 * are the ones worth having: v1 bounded a category name with an `Input`
 * `maxLength` attribute and nothing else, and let a duplicate reach the unique
 * index to come back as an opaque failed save.
 */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useSaveFinCategoryMutation: () => [mocks.save, { isLoading: false }],
  useDeleteFinCategoryMutation: () => [mocks.remove, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

const CATEGORIES: FinCategory[] = [
  {
    id: "c1",
    name: "Groceries",
    bucket: "need",
    is_essential: true,
    sort_order: 0,
  },
  {
    id: "c2",
    name: "Dining out",
    bucket: "want",
    is_essential: false,
    sort_order: 10,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.remove.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockResolvedValue(true);
});

const section = (categories = CATEGORIES) =>
  render(<CategoriesSection categories={categories} />);

const typeNewName = (name: string) =>
  fireEvent.change(screen.getByLabelText("New category"), {
    target: { value: name },
  });

describe("adding a category", () => {
  /**
   * `fin_category` has `UNIQUE (user_id, name)`. Left to the database this comes
   * back as a constraint violation the reader cannot act on.
   */
  it("refuses a duplicate name, and says which one", async () => {
    section();
    typeNewName("groceries");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringMatching(/already have a category called groceries/i),
      ),
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  /**
   * The input caps typing at 80, but an attribute is a courtesy to whoever is
   * typing — it does not check a value arriving any other way. The schema does.
   */
  it("refuses a name longer than the column allows", async () => {
    section();
    typeNewName("x".repeat(FINANCE_LIMITS.CATEGORY_NAME + 1));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  /** A need is essential by default: it is the only input to runway. */
  it("marks a new need as essential", async () => {
    section();
    typeNewName("Rent");

    const buckets = screen.getByRole("radiogroup", {
      name: "Bucket for the new category",
    });
    fireEvent.click(within(buckets).getByRole("radio", { name: "Need" }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Rent",
          bucket: "need",
          is_essential: true,
        }),
      ),
    );
  });

  it("does not assume a want is essential", async () => {
    section();
    typeNewName("Concerts");
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: "want", is_essential: false }),
      ),
    );
  });
});

describe("editing in place", () => {
  it("changes a bucket without opening anything", async () => {
    section();
    const buckets = screen.getByRole("radiogroup", {
      name: "Groceries bucket",
    });
    fireEvent.click(within(buckets).getByRole("radio", { name: "Want" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({ id: "c1", bucket: "want" }),
    );
  });

  /**
   * Separate from the bucket on purpose: a gym membership can be a `need` in
   * your budgeting shape and still be the first thing cancelled.
   */
  it("toggles essential independently of the bucket", async () => {
    section();
    fireEvent.click(screen.getByLabelText("Groceries is essential"));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        id: "c1",
        is_essential: false,
      }),
    );
  });

  it("renames from the list, on Enter", async () => {
    section();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));

    const field = screen.getByLabelText("Rename Groceries");
    fireEvent.change(field, { target: { value: "Food" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({ id: "c1", name: "Food" }),
    );
  });

  it("refuses to rename onto a name already in use", async () => {
    section();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));

    const field = screen.getByLabelText("Rename Groceries");
    fireEvent.change(field, { target: { value: "Dining out" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("asks first, and says what happens to the transactions", async () => {
    section();
    fireEvent.click(screen.getByRole("button", { name: "Delete Groceries" }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(
      /keep their amounts but lose the label/,
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("c1"));
  });

  it("does nothing when the confirmation is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    section();
    fireEvent.click(screen.getByRole("button", { name: "Delete Groceries" }));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("with nothing set up yet", () => {
  it("explains what categories are for rather than showing an empty list", () => {
    section([]);
    expect(screen.getByText("No categories yet")).toBeInTheDocument();
  });

  /** Archived categories are out of the picture, not merely greyed out. */
  it("leaves archived categories out", () => {
    section([
      CATEGORIES[0],
      { ...CATEGORIES[1], archived_at: "2026-06-01T00:00:00Z" },
    ]);
    expect(screen.queryByText("Dining out")).not.toBeInTheDocument();
  });
});
