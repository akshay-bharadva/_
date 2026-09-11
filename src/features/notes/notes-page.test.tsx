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

const ok = <T,>(value: T) => ({ unwrap: () => Promise.resolve(value) });

const addNote = vi.fn((note: Partial<Note>) =>
  ok({ id: "new", title: note.title ?? null, content: null } as Note),
);
const updateNote = vi.fn((_note: Partial<Note>) => ok({}));
const archiveNote = vi.fn((_args: { id: string; archived: boolean }) => ok({}));
const deleteNote = vi.fn((_id: string) => ok({}));
const confirmSpy =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

let notes: Note[] = [];

/**
 * The editor chunk, reached only through its loader, mocked statically — and
 * the lazy editor itself stands in as a textarea.
 */
const { loadEditor, realEditorRequested } = vi.hoisted(() => ({
  loadEditor: vi.fn(() => Promise.resolve({ default: () => null })),
  realEditorRequested: vi.fn(),
}));
vi.mock("@/components/admin/novel-editor/load-editor", () => ({
  loadNovelEditor: loadEditor,
}));
vi.mock("@/components/admin/novel-editor/novel-editor", () => {
  realEditorRequested();
  return { default: () => null };
});
vi.mock("@/components/admin/novel-editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Note body"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetNotesQuery: () => ({ data: notes, isLoading: false }),
  useAddNoteMutation: () => [addNote, { isLoading: false }],
  useUpdateNoteMutation: () => [updateNote],
  useArchiveNoteMutation: () => [archiveNote],
  useDeleteNoteMutation: () => [deleteNote],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirmSpy,
}));

vi.mock("./note-body", () => ({
  NoteBody: ({ children }: { children: string }) => (
    <div data-testid="note-body">{children}</div>
  ),
}));

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Alpha",
  content: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const saved = { timeout: 3000 };

beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockResolvedValue(true);
  notes = [];
});

describe("NotesPage — the list", () => {
  it("says there is nothing yet", () => {
    render(<NotesPage />);
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
  });

  it("leads with pinned notes", () => {
    notes = [
      note({ id: "a", title: "Recent", updated_at: "2026-06-01T00:00:00Z" }),
      note({ id: "b", title: "Pinned", is_pinned: true }),
    ];
    render(<NotesPage />);
    const rows = screen
      .getAllByRole("button", { name: /^Open / })
      .map((el) => el.getAttribute("aria-label"));
    expect(rows[0]).toBe("Open Pinned");
    expect(
      screen.getByRole("heading", { level: 2, name: "Pinned" }),
    ).toBeInTheDocument();
  });

  it("shows the start of what each note says", () => {
    notes = [note({ title: "Alpha", content: "## Heading\n\nbody **text**" })];
    render(<NotesPage />);
    expect(screen.getByText("Heading body text")).toBeInTheDocument();
  });

  /** "Untitled / Untitled / Untitled" says nothing about what is in them. */
  it("names an untitled note by its first line", () => {
    notes = [note({ title: "", content: "Call the letting agent\nMonday" })];
    render(<NotesPage />);
    expect(
      screen.getByLabelText("Open Call the letting agent"),
    ).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
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
    expect(screen.queryByLabelText("Open Unrelated")).toBeNull();
    expect(screen.getByLabelText("Open Beta")).toBeInTheDocument();
    expect(screen.getByLabelText("Open Gamma")).toBeInTheDocument();
  });

  it("filters by a tag", () => {
    notes = [
      note({ id: "a", title: "Alpha", tags: ["work"] }),
      note({ id: "b", title: "Beta", tags: ["home"] }),
    ];
    render(<NotesPage />);
    const tags = screen.getByRole("group", { name: "Filter by tag" });
    fireEvent.click(within(tags).getByRole("button", { name: /work/ }));
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Beta")).toBeNull();
  });

  it("shows only notes in the link graph under Linked", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
      note({ id: "c", title: "Orphan" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Linked/ }));
    expect(screen.getByLabelText("Open Alpha")).toBeInTheDocument();
    expect(screen.getByLabelText("Open Beta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Orphan")).toBeNull();
  });

  it("keeps archived notes out of the list, and in the archive", () => {
    notes = [
      note({ id: "a", title: "Alpha" }),
      note({ id: "b", title: "Filed away", archived_at: "2026-02-01T00:00:00Z" }),
    ];
    render(<NotesPage />);
    expect(screen.queryByLabelText("Open Filed away")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Archive/ }));
    expect(screen.getByLabelText("Open Filed away")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Alpha")).toBeNull();
  });
});

describe("NotesPage — a note", () => {
  it("opens to read, and warms the editor through its loader", () => {
    notes = [note({ title: "Alpha", content: "Some body" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByLabelText("Note title")).toHaveValue("Alpha");
    expect(screen.getByTestId("note-body")).toHaveTextContent("Some body");
    expect(screen.queryByLabelText("Note body")).toBeNull();
    expect(loadEditor).toHaveBeenCalled();
    expect(realEditorRequested).not.toHaveBeenCalled();
  });

  /** No Save button: the body saves itself once typing pauses. */
  it("saves an edit on its own", async () => {
    notes = [note({ content: "Hello" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Note body"), {
      target: { value: "Hello there" },
    });
    await waitFor(
      () =>
        expect(updateNote).toHaveBeenCalledWith(
          expect.objectContaining({ id: "n1", content: "Hello there" }),
        ),
      saved,
    );
    expect(await screen.findByText("Saved", {}, saved)).toBeInTheDocument();
  });

  it("saves a title change", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Renamed" },
    });
    await waitFor(
      () =>
        expect(updateNote).toHaveBeenCalledWith(
          expect.objectContaining({ id: "n1", title: "Renamed" }),
        ),
      saved,
    );
  });

  it("saves at once on Ctrl + S", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    const title = screen.getByLabelText("Note title");
    fireEvent.change(title, { target: { value: "Now" } });
    fireEvent.keyDown(title, { key: "s", ctrlKey: true });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
  });

  /** Plain state rather than a form library: the shared schema checks it. */
  it("refuses a title over the limit, and says so", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "x".repeat(201) },
    });
    expect(await screen.findByRole("alert", {}, saved)).toHaveTextContent(
      "Not saved",
    );
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("saves a tag added as a chip", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.change(screen.getByLabelText("Add a tag"), {
      target: { value: "work," },
    });
    await waitFor(
      () =>
        expect(updateNote).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ["work"] }),
        ),
      saved,
    );
  });

  /**
   * Keep colours the whole tile, mixed against the card token so the text
   * contrast holds on a dark preset — and the tile follows the picker at once.
   */
  it("fills the note with its colour and follows the picker", async () => {
    notes = [note({ color: "#f87171" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    const tile = screen.getByRole("article");
    expect(tile.style.background).toContain("#f87171");
    expect(tile.style.background).toContain("hsl(var(--card))");

    fireEvent.click(screen.getByLabelText("Note colour"));
    fireEvent.click(await screen.findByLabelText("Use colour #22d3ee"));
    expect(tile.style.background).toContain("#22d3ee");
    await waitFor(
      () =>
        expect(updateNote).toHaveBeenCalledWith(
          expect.objectContaining({ color: "#22d3ee" }),
        ),
      saved,
    );
  });

  it("pins from the note", () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByLabelText("Pin note"));
    expect(updateNote).toHaveBeenCalledWith({ id: "n1", is_pinned: true });
  });

  it("archives, and offers Restore on an archived note", async () => {
    notes = [note({ archived_at: "2026-02-01T00:00:00Z" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Archive/ }));
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(archiveNote).toHaveBeenCalledWith({ id: "n1", archived: false }),
    );
  });

  it("archives a live note", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByLabelText("Archive note"));
    await waitFor(() =>
      expect(archiveNote).toHaveBeenCalledWith({ id: "n1", archived: true }),
    );
  });

  /** Deleting is the one action here that loses something unrecoverable. */
  it("says archiving is the alternative before deleting", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByLabelText("Delete note"));
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith("n1"));
    expect(confirmSpy.mock.calls[0]?.[0]?.description).toMatch(/Archiving/);
  });
});

describe("NotesPage — new notes", () => {
  it("creates a note and opens it to write in", async () => {
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    await waitFor(() => expect(addNote).toHaveBeenCalled());
    expect(await screen.findByLabelText("Note title")).toHaveValue("");
    expect(screen.getByLabelText("Note body")).toBeInTheDocument();
  });

  /** Trying the button should not leave an empty note behind. */
  it("discards a new note left blank, without asking", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    await screen.findByLabelText("Note body");
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith("new"));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("keeps a new note once anything is in it", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    fireEvent.change(await screen.findByLabelText("Note title"), {
      target: { value: "Kept" },
    });
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    await waitFor(() =>
      expect(updateNote).toHaveBeenCalledWith(
        expect.objectContaining({ id: "new", title: "Kept" }),
      ),
    );
    expect(deleteNote).not.toHaveBeenCalled();
  });
});

describe("NotesPage — links", () => {
  it("shows what links to a note, and what it links to", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Beta"));
    expect(screen.getByText("Linked from")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByText("Links to")).toBeInTheDocument();
  });

  it("strips wikilink syntax from what it renders", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByTestId("note-body")).toHaveTextContent("see [Beta](#note-b)");
  });

  it("offers to write a note a link points at", async () => {
    notes = [note({ id: "a", title: "Alpha", content: "see [[Nowhere]]" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByText("Not written yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nowhere/ }));
    await waitFor(() => expect(addNote).toHaveBeenCalled());
    expect(addNote.mock.calls[0]?.[0]).toMatchObject({ title: "Nowhere" });
  });

  /** A link typed right now shows up before the next save. */
  it("follows the draft, not only what is saved", () => {
    notes = [note({ id: "a", title: "Alpha" }), note({ id: "b", title: "Beta" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    // An empty note opens straight into writing.
    fireEvent.change(screen.getByLabelText("Note body"), {
      target: { value: "now [[Beta]]" },
    });
    expect(screen.getByText("Links to")).toBeInTheDocument();
  });
});
