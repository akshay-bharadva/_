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
 * The editor chunk is reached only through its loader, mocked statically. The
 * lazy editor stands in as a textarea, plus one button per page it was told it
 * may link to — the way a click on a `[[link]]` reaches the page.
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
    links,
  }: {
    value: string;
    onChange: (value: string) => void;
    links?: {
      targets: { id: string; title: string }[];
      onOpen: (title: string) => void;
    };
  }) => (
    <div>
      <textarea
        aria-label="Note body"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {links?.targets.map((target) => (
        <button
          key={target.id}
          type="button"
          onClick={() => links.onOpen(target.title)}
        >
          Follow {target.title}
        </button>
      ))}
      {links && (
        <button type="button" onClick={() => links.onOpen("Nowhere")}>
          Follow a missing link
        </button>
      )}
    </div>
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

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Alpha",
  content: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const saved = { timeout: 3000 };

const openMore = () =>
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));

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
    expect(screen.queryByLabelText("Open Beta")).toBeNull();
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
  });
});

describe("NotesPage — a note is a page", () => {
  /** No reading mode: a note opens ready to write in. */
  it("opens ready to write, with the editor fetched ahead of time", () => {
    notes = [note({ title: "Alpha", content: "Some body" })];
    render(<NotesPage />);
    expect(loadEditor).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByLabelText("Note title")).toHaveValue("Alpha");
    expect(screen.getByLabelText("Note body")).toHaveValue("Some body");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(realEditorRequested).not.toHaveBeenCalled();
  });

  it("saves an edit on its own", async () => {
    notes = [note({ content: "Hello" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
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

  /** The colour is a cover band, mixed toward the theme's own surfaces. */
  it("shows the colour as a cover, and changes it from the menu", async () => {
    notes = [note({ color: "#f87171" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    const cover = screen.getByTestId("note-cover");
    expect(cover.style.background).toContain("#f87171");
    expect(cover.style.background).toContain("hsl(var(--card))");

    openMore();
    fireEvent.click(await screen.findByLabelText("Use colour #22d3ee"));
    expect(screen.getByTestId("note-cover").style.background).toContain(
      "#22d3ee",
    );
    await waitFor(
      () =>
        expect(updateNote).toHaveBeenCalledWith(
          expect.objectContaining({ color: "#22d3ee" }),
        ),
      saved,
    );
  });

  it("has no cover without a colour", () => {
    notes = [note({ color: null })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.queryByTestId("note-cover")).toBeNull();
  });

  it("pins from the bar", () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByLabelText("Pin note"));
    expect(updateNote).toHaveBeenCalledWith({ id: "n1", is_pinned: true });
  });

  it("archives from the menu", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    openMore();
    fireEvent.click(await screen.findByRole("button", { name: "Archive note" }));
    await waitFor(() =>
      expect(archiveNote).toHaveBeenCalledWith({ id: "n1", archived: true }),
    );
  });

  it("offers Restore on an archived note", async () => {
    notes = [note({ archived_at: "2026-02-01T00:00:00Z" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Archive/ }));
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(archiveNote).toHaveBeenCalledWith({ id: "n1", archived: false }),
    );
  });

  /** Deleting is the one action here that loses something unrecoverable. */
  it("says archiving is the alternative before deleting", async () => {
    notes = [note()];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    openMore();
    fireEvent.click(await screen.findByRole("button", { name: "Delete note" }));
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
  });

  /** Trying the button should not leave an empty note behind. */
  it("discards a new note left blank, without asking", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    await screen.findByLabelText("Note title");
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

  /** The reading mode existed only so links could be followed. */
  it("follows a link from inside the editor", () => {
    notes = [
      note({ id: "a", title: "Alpha", content: "see [[Beta]]" }),
      note({ id: "b", title: "Beta" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Follow Beta" }));
    expect(screen.getByLabelText("Note title")).toHaveValue("Beta");
  });

  it("writes the note a link points at, when it does not exist yet", async () => {
    notes = [note({ id: "a", title: "Alpha" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Follow a missing link" }));
    await waitFor(() =>
      expect(addNote).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Nowhere" }),
      ),
    );
  });

  it("offers every other titled note to link, but not itself", () => {
    notes = [
      note({ id: "a", title: "Alpha" }),
      note({ id: "b", title: "Beta" }),
      note({ id: "c", title: "", content: "untitled" }),
    ];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByRole("button", { name: "Follow Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Follow Alpha" })).toBeNull();
  });

  it("offers to write a note a link points at, under the note", async () => {
    notes = [note({ id: "a", title: "Alpha", content: "see [[Nowhere]]" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    expect(screen.getByText("Not written yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Nowhere" }));
    await waitFor(() => expect(addNote).toHaveBeenCalled());
  });

  /** A link typed right now shows up before the next save. */
  it("follows the draft, not only what is saved", () => {
    notes = [note({ id: "a", title: "Alpha" }), note({ id: "b", title: "Beta" })];
    render(<NotesPage />);
    fireEvent.click(screen.getByLabelText("Open Alpha"));
    fireEvent.change(screen.getByLabelText("Note body"), {
      target: { value: "now [[Beta]]" },
    });
    expect(screen.getByText("Links to")).toBeInTheDocument();
  });
});
