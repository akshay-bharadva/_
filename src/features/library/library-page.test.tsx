import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LibraryHighlight, LibrarySource } from "@/types";
import LibraryPage from "./library-page";
import { localIsoDate } from "./library-model";

const ok = () => ({ unwrap: () => Promise.resolve({}) });
const saveHighlight = vi.fn((_: Partial<LibraryHighlight>) => ok());
const deleteHighlight = vi.fn((_: string) => ok());
const saveSource = vi.fn((_: Partial<LibrarySource>) => ok());
const deleteSource = vi.fn((_: string) => ok());
const confirmSpy =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

let sources: LibrarySource[] = [];
let highlights: LibraryHighlight[] = [];

vi.mock("@/store/api/adminApi", () => ({
  useGetLibrarySourcesQuery: () => ({ data: sources, isLoading: false }),
  useGetLibraryHighlightsQuery: () => ({ data: highlights, isLoading: false }),
  useSaveLibraryHighlightMutation: () => [saveHighlight],
  useDeleteLibraryHighlightMutation: () => [deleteHighlight],
  useSaveLibrarySourceMutation: () => [saveSource],
  useDeleteLibrarySourceMutation: () => [deleteSource],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirmSpy,
}));

// The forms pull in react-hook-form and the schemas; the page is what these
// tests are about.
vi.mock("./source-form", () => ({ SourceForm: () => null }));
vi.mock("./highlight-form", () => ({ HighlightForm: () => null }));

const VIDEO = "dQw4w9WgXcQ";

const source = (overrides: Partial<LibrarySource> = {}): LibrarySource => ({
  id: "s1",
  kind: "book",
  title: "Dune",
  creator: "Frank Herbert",
  status: "want",
  ...overrides,
});

const highlight = (
  overrides: Partial<LibraryHighlight> = {},
): LibraryHighlight => ({
  id: "h1",
  text: "Fear is the mind-killer.",
  is_public: false,
  is_favorite: false,
  ...overrides,
});

const openReadingList = () =>
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Reading list/ }));

beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockResolvedValue(true);
  sources = [];
  highlights = [];
});

describe("LibraryPage — highlights", () => {
  it("invites the first line when there are none", () => {
    render(<LibraryPage />);
    expect(screen.getByText("No highlights yet")).toBeInTheDocument();
  });

  it("cites the source a line came from", () => {
    sources = [source()];
    highlights = [highlight({ source_id: "s1", location: "p. 8" })];
    render(<LibraryPage />);
    expect(screen.getByText("— Frank Herbert, Dune, p. 8")).toBeInTheDocument();
  });

  it("narrows to the lines on the site", () => {
    highlights = [
      highlight({ id: "a", text: "Public line", is_public: true }),
      highlight({ id: "b", text: "Private line" }),
    ];
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole("button", { name: /On the site/ }));
    expect(screen.getByText("Public line")).toBeInTheDocument();
    expect(screen.queryByText("Private line")).not.toBeInTheDocument();
  });

  it("puts a line on the site with one control", () => {
    highlights = [highlight()];
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole("button", { name: "Show on the site" }));
    expect(saveHighlight).toHaveBeenCalledWith({ id: "h1", is_public: true });
  });

  it("finds a line by its source's title", () => {
    sources = [source()];
    highlights = [
      highlight({ id: "a", source_id: "s1" }),
      highlight({ id: "b", text: "Unrelated" }),
    ];
    render(<LibraryPage />);
    fireEvent.change(screen.getByPlaceholderText(/Search lines/), {
      target: { value: "dune" },
    });
    expect(screen.getByText("Fear is the mind-killer.")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated")).not.toBeInTheDocument();
  });

  it("warns that deleting a public line takes it off the site", async () => {
    highlights = [highlight({ is_public: true })];
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete highlight" }));
    await vi.waitFor(() => expect(deleteHighlight).toHaveBeenCalledWith("h1"));
    expect(confirmSpy.mock.calls[0]?.[0]?.description).toMatch(/site/);
  });
});

describe("LibraryPage — reading list", () => {
  it("offers to play a video here, and opens an article elsewhere", () => {
    sources = [
      source({
        id: "v",
        kind: "video",
        title: "A talk",
        url: `https://youtu.be/${VIDEO}`,
      }),
      source({
        id: "a",
        kind: "article",
        title: "An essay",
        url: "https://example.com/essay",
      }),
    ];
    render(<LibraryPage />);
    openReadingList();
    expect(screen.getByRole("button", { name: /Watch here/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open An essay" })).toHaveAttribute(
      "href",
      "https://example.com/essay",
    );
  });

  /** A stored `javascript:` link must never become an anchor. */
  it("renders no link for an unsafe URL", () => {
    sources = [source({ url: "javascript:alert(1)" })];
    render(<LibraryPage />);
    openReadingList();
    expect(screen.queryByRole("link", { name: /Open Dune/ })).toBeNull();
  });

  it("stamps today when something is finished", () => {
    sources = [source({ status: "in_progress", started_on: "2020-01-01" })];
    render(<LibraryPage />);
    openReadingList();
    fireEvent.change(screen.getByLabelText("Status of Dune"), {
      target: { value: "done" },
    });
    expect(saveSource).toHaveBeenCalledWith({
      id: "s1",
      status: "done",
      finished_on: localIsoDate(),
    });
  });

  /**
   * The foreign key keeps the highlights and drops their source. That is the
   * right behaviour, and exactly the kind that should be said before it
   * happens rather than discovered after.
   */
  it("says how many highlights lose their source", async () => {
    sources = [source()];
    highlights = [
      highlight({ id: "a", source_id: "s1" }),
      highlight({ id: "b", source_id: "s1" }),
    ];
    render(<LibraryPage />);
    openReadingList();
    fireEvent.click(screen.getByRole("button", { name: "Delete Dune" }));
    await vi.waitFor(() => expect(deleteSource).toHaveBeenCalledWith("s1"));
    expect(confirmSpy.mock.calls[0]?.[0]?.description).toMatch(
      /2 highlights stay/,
    );
  });

  it("filters by status", () => {
    sources = [
      source({ id: "a", title: "Next up", status: "want" }),
      source({ id: "b", title: "Done one", status: "done" }),
    ];
    render(<LibraryPage />);
    openReadingList();
    fireEvent.click(screen.getByRole("button", { name: /Finished/ }));
    expect(screen.getByText("Done one")).toBeInTheDocument();
    expect(screen.queryByText("Next up")).not.toBeInTheDocument();
  });
});
