import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ContactSubmission } from "@/types";
import InboxPage from "./inbox-page";

const mocks = vi.hoisted(() => ({
  messages: [] as ContactSubmission[],
  update: vi.fn(),
  updateMany: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetContactSubmissionsQuery: () => ({
    data: mocks.messages,
    isLoading: false,
  }),
  useUpdateContactSubmissionMutation: () => [
    mocks.update,
    { isLoading: false },
  ],
  useUpdateContactSubmissionsMutation: () => [
    mocks.updateMany,
    { isLoading: false },
  ],
  useDeleteContactSubmissionMutation: () => [
    mocks.remove,
    { isLoading: false },
  ],
  useGetIntegrationSettingsQuery: () => ({ data: undefined, isLoading: true }),
  useUpdateIntegrationSettingsMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const message = (
  overrides: Partial<ContactSubmission> = {},
): ContactSubmission => ({
  id: "1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  subject: "Analytical engine",
  message: "Do you take contract work?",
  is_read: false,
  is_archived: false,
  replied_at: null,
  created_at: "2026-08-01T09:00:00.000Z",
  ...overrides,
});

const resolved = (value: unknown = null) => ({
  unwrap: () => Promise.resolve(value),
});

beforeEach(() => {
  mocks.messages = [message()];
  mocks.update.mockReset().mockReturnValue(resolved());
  mocks.updateMany.mockReset().mockReturnValue(resolved());
  mocks.remove.mockReset().mockReturnValue(resolved());
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
});

describe("InboxPage", () => {
  it("shows the messages that were previously invisible", async () => {
    render(<InboxPage />);
    // Twice: once in the list row, once in the open message beside it.
    expect(await screen.findAllByText("Analytical engine")).toHaveLength(2);
  });

  /**
   * `contact_submissions` had admin SELECT and DELETE policies and no UI, so
   * this is the whole point: an empty table should say so rather than showing
   * a blank pane.
   */
  it("explains itself when there is nothing yet", async () => {
    mocks.messages = [];
    render(<InboxPage />);
    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
  });

  it("marks a message read when it is opened", async () => {
    render(<InboxPage />);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ id: "1", is_read: true }),
    );
  });

  /**
   * Reading is not replying. A message you have merely opened has to stay in
   * the view that says you owe someone an answer.
   */
  it("keeps a read message in the needs-reply view", async () => {
    mocks.messages = [message({ is_read: true })];
    render(<InboxPage />);

    const tab = await screen.findByRole("tab", { name: /Needs reply/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Analytical engine").length).toBeGreaterThan(0);
  });

  it("drops a replied message out of the needs-reply view", async () => {
    mocks.messages = [
      message({ is_read: true, replied_at: "2026-08-02T09:00:00.000Z" }),
    ];
    render(<InboxPage />);

    expect(
      await screen.findByText("Nothing waiting on you."),
    ).toBeInTheDocument();
  });

  it("marks all unread read in one request", async () => {
    mocks.messages = [
      message({ id: "a" }),
      message({ id: "b" }),
      message({ id: "c", is_read: true }),
    ];
    render(<InboxPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Mark all read/ }),
    );

    await waitFor(() => expect(mocks.updateMany).toHaveBeenCalledTimes(1));
    expect(mocks.updateMany).toHaveBeenCalledWith({
      ids: ["a", "b"],
      changes: { is_read: true },
    });
  });

  it("offers no mark-all-read when nothing is unread", async () => {
    mocks.messages = [message({ is_read: true })];
    render(<InboxPage />);
    await screen.findByRole("tab", { name: /Needs reply/ });
    expect(screen.queryByRole("button", { name: /Mark all read/ })).toBeNull();
  });

  /** Deleting is permanent and archiving is not, so the confirm has to say so. */
  it("confirms before deleting, and mentions archiving", async () => {
    render(<InboxPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /Delete/ }))[0],
    );

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/[Aa]rchiv/);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("1"));
  });

  it("does not delete when the confirm is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    render(<InboxPage />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: /Delete/ }))[0],
    );

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("filters by search across the message body", async () => {
    mocks.messages = [
      message({ id: "a", subject: "Analytical engine" }),
      message({ id: "b", subject: "Something else", message: "Unrelated" }),
    ];
    render(<InboxPage />);

    fireEvent.change(
      await screen.findByPlaceholderText(/Search name, address or message/),
      { target: { value: "contract" } },
    );

    await waitFor(() =>
      expect(screen.queryByText("Something else")).toBeNull(),
    );
    expect(screen.getAllByText("Analytical engine").length).toBeGreaterThan(0);
  });
});
