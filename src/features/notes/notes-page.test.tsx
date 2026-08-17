import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Note } from "@/types";
import NotesPage from "./notes-page";

const addNote = vi.fn<(note: Partial<Note>) => { unwrap: () => Promise<Note> }>(
  () => ({ unwrap: () => Promise.resolve({ id: "new" } as Note) }),
);
const updateNote = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const archiveNote = vi.fn<
  (args: { id: string; archived: boolean }) => {
    unwrap: () => Promise<unknown>;
  }
>(() => ({ unwrap: () => Promise.resolve({}) }));
const deleteNote = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const confirmSpy =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

let notes: Note[] = [];

vi.mock("@/store/api/adminApi", () => ({
  useGetNotesQuery: () => ({ data: notes, isLoading: false }),
  useAddNoteMutation: () => [addNote],
  useUpdateNoteMutation: () => [updateNote],
  useArchiveNoteMutation: () => [archiveNote],
  useDeleteNoteMutation: () => [deleteNote],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirmSpy,
}));

// The rich editor pulls in TipTap, which is code-split in the app and not
// worth booting to assert on the page around it.
vi.mock("./note-editor", () => ({
  NoteEditor: () => <div data-testid="note-editor" />,
}));

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Alpha",
  content: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockResolvedValue(true);
  notes = [];
});

describe("NotesPage", () => {
  it("shows an empty state with no notes", () => {
    render(<NotesPage />);
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
  });

  /**
   * The friction this module had: every note started with a sheet and a rich
   * editor, which is a lot of ceremony for a thought you wanted out of your
   * head.
   */
  it("creates a note from the capture box without opening an editor", async () => {
    render(<NotesPage />);
    fireEvent.change(screen.getByLabelText("Quick capture"), {
      target: { value: "Ring the dentist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => expect(addNote).toHaveBeenCalled());
    expect(addNote.mock.calls[0]?.[0]).toMatchObject({
      title: "Ring the dentist",
    });
    expect(screen.queryByTestId("note-editor")).not.toBeInTheDocument();
  });

  it("will not capture an empty thought", () => {
    render(<NotesPage />);
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled();
  });

  it("clears the capture box after saving", async () => {
    render(<NotesPage />);
    const input = screen.getByLabelText("Quick capture");
    fireEvent.change(input, { target: { value: "A thought" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("opens a note to read rather than to edit", () => {
    notes = [note({ title: "Alpha", content: "Some body" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.queryByTestId("note-editor")).not.toBeInTheDocument();
  });

  /** The reason linking is worth having at all. */
  it("shows what links to a note", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Beta"));
    expect(screen.getByText("Linked from")).toBeInTheDocument();
  });

  it("shows what a note links to", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByText("Links to")).toBeInTheDocument();
  });

  it("offers to create a note a link points at but does not exist", async () => {
    notes = [note({ id: "a", title: "Alpha", content: "see [[Nowhere]]" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByText("Not written yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Nowhere/ }));
    await waitFor(() => expect(addNote).toHaveBeenCalled());
    expect(addNote.mock.calls[0]?.[0]).toMatchObject({ title: "Nowhere" });
  });

  it("archives a note instead of only offering deletion", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Archive note"));
    await waitFor(() => expect(archiveNote).toHaveBeenCalled());
    expect(archiveNote.mock.calls[0]?.[0]).toEqual({
      id: "a",
      archived: true,
    });
  });

  it("hides archived notes from the main list", () => {
    notes = [
      note({ id: "a", title: "Alpha" }),
      note({
        id: "b",
        title: "Filed away",
        archived_at: "2026-02-01T00:00:00Z",
      }),
    ];
    render(<NotesPage />);
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Filed away")).not.toBeInTheDocument();
  });

  it("shows archived notes in the archive view", () => {
    notes = [
      note({ id: "a", title: "Alpha" }),
      note({
        id: "b",
        title: "Filed away",
        archived_at: "2026-02-01T00:00:00Z",
      }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByLabelText("Open Filed away")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Alpha")).not.toBeInTheDocument();
  });

  /** Deleting is the one action here that loses something unrecoverable. */
  it("says archiving is the alternative before deleting", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Delete note"));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy.mock.calls[0]?.[0]?.description).toMatch(/Archiving/);
  });

  it("searches title, body and tags", () => {
    notes = [
      note({ id: "a", title: "Dentist" }),
      note({ id: "b", title: "Beta", content: "call the dentist" }),
      note({ id: "c", title: "Gamma", tags: ["dentist"] }),
      note({ id: "d", title: "Unrelated" }),
    ];
    render(<NotesPage />);
    fireEvent.change(screen.getByLabelText("Search notes"), {
      target: { value: "dentist" },
    });
    expect(screen.queryByLabelText("Open Unrelated")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open Dentist")).toBeInTheDocument();
  });

  it("filters by tag from one control", () => {
    notes = [
      note({ id: "a", title: "Alpha", tags: ["work"] }),
      note({ id: "b", title: "Beta", tags: ["home"] }),
    ];
    render(<NotesPage />);
    const tags = screen.getByRole("group", { name: "Filter by tag" });
    fireEvent.click(within(tags).getByRole("button", { name: /work/ }));
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Beta")).not.toBeInTheDocument();
  });

  it("keeps pinned notes first", () => {
    notes = [
      note({ id: "a", title: "Older", updated_at: "2026-06-01T00:00:00Z" }),
      note({
        id: "b",
        title: "Pinned",
        is_pinned: true,
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ];
    render(<NotesPage />);
    const opened = screen
      .getAllByRole("button", { name: /^Open / })
      .map((el) => el.getAttribute("aria-label"));
    expect(opened[0]).toBe("Open Pinned");
  });
});
