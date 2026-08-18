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

  it("opens the drawer to write a new note", () => {
    // A note exists so the empty state's own "New note" action is not present.
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    expect(screen.getByTestId("note-editor")).toBeInTheDocument();
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

  /**
   * The detail view hard-coded "Archive", so opening an already-archived note
   * offered to archive it a second time and there was no way back from there.
   */
  it("offers Restore, not Archive, when reading an archived note", async () => {
    notes = [
      note({
        id: "a",
        title: "Filed away",
        archived_at: "2026-02-01T00:00:00Z",
      }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    fireEvent.click(screen.getByLabelText("Open Filed away"));

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(archiveNote).toHaveBeenCalled());
    expect(archiveNote.mock.calls[0]?.[0]).toEqual({
      id: "a",
      archived: false,
    });
  });

  it("archives from the reading view of a live note", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(archiveNote).toHaveBeenCalled());
    expect(archiveNote.mock.calls[0]?.[0]).toEqual({ id: "a", archived: true });
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

  it("filters by tag from the Filters popover", () => {
    notes = [
      note({ id: "a", title: "Alpha", tags: ["work"] }),
      note({ id: "b", title: "Beta", tags: ["home"] }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /^work/ }));
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Beta")).not.toBeInTheDocument();
  });

  it("filters to pinned notes", () => {
    notes = [
      note({ id: "a", title: "Alpha", is_pinned: true }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByLabelText("Pinned"));
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Beta")).not.toBeInTheDocument();
  });

  /** Only meaningful now that notes link to each other. */
  it("filters to notes that take part in the link graph", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
      note({ id: "c", title: "Orphan" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByLabelText("Connected to another note"));
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.getByLabelText("Open Beta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Orphan")).not.toBeInTheDocument();
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

describe("NoteCard colour", () => {
  /**
   * The card used to tint its surface and border with two diluted derivations
   * of one value, both mixed with the theme's background — so on a dark preset
   * a red note and a blue note converged on the same murky grey and the colour
   * stopped being a label.
   */
  it("carries the note colour as a solid spine, not a background wash", () => {
    notes = [note({ id: "a", title: "Alpha", color: "#e11d48" })];
    const { container } = render(<NotesPage />);
    const spined = Array.from(
      container.querySelectorAll<HTMLElement>("*"),
    ).find((el) => el.style.borderLeftColor === "rgb(225, 29, 72)");

    expect(spined).toBeTruthy();
    // The value is used once. A tinted surface is what made it unreadable.
    expect(spined?.style.backgroundColor).toBe("");
  });

  /** The actions are revealed on hover, but must stay reachable by keyboard —
      opacity, not display, so they keep their place in the tab order. */
  it("keeps the card actions in the accessibility tree at rest", () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    expect(screen.getByLabelText("Edit note")).toBeInTheDocument();
    expect(screen.getByLabelText("Archive note")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete note")).toBeInTheDocument();
    expect(screen.getByLabelText("Pin note")).toBeInTheDocument();
  });

  it("shows how many notes a note links to", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "[[Beta]] and [[Gamma]]" }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("keeps the silhouette when a note has no colour", () => {
    notes = [note({ id: "a", title: "Alpha", color: null })];
    const { container } = render(<NotesPage />);
    const spined = Array.from(
      container.querySelectorAll<HTMLElement>("*"),
    ).find((el) => el.style.borderLeftColor !== "");
    expect(spined?.style.borderLeftColor).toContain("--border");
  });
});
