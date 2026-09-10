import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LibraryHighlight, LibrarySource } from "@/types";
import { SourceView } from "./source-view";

const VIDEO = "dQw4w9WgXcQ";

const source = (overrides: Partial<LibrarySource> = {}): LibrarySource => ({
  id: "s1",
  kind: "video",
  title: "A talk",
  status: "want",
  url: `https://youtu.be/${VIDEO}`,
  ...overrides,
});

const line = (overrides: Partial<LibraryHighlight> = {}): LibraryHighlight => ({
  id: "h1",
  source_id: "s1",
  text: "The line",
  is_public: false,
  is_favorite: false,
  ...overrides,
});

const renderView = (s: LibrarySource, highlights: LibraryHighlight[] = []) =>
  render(
    <SourceView
      source={s}
      highlights={highlights}
      onAddHighlight={vi.fn()}
      onEdit={vi.fn()}
    />,
  );

describe("SourceView", () => {
  it("plays a video here, from the provider's privacy-enhanced player", () => {
    renderView(source());
    expect(screen.getByTitle("A talk — YouTube player")).toHaveAttribute(
      "src",
      `https://www.youtube-nocookie.com/embed/${VIDEO}`,
    );
  });

  /** The reason a highlight's location is free text rather than a page. */
  it("starts the player at a highlight's timestamp", () => {
    renderView(source(), [line({ location: "12:34" })]);
    fireEvent.click(screen.getByRole("button", { name: /Play from 12:34/ }));
    expect(screen.getByTitle("A talk — YouTube player")).toHaveAttribute(
      "src",
      `https://www.youtube-nocookie.com/embed/${VIDEO}?start=754`,
    );
  });

  it("shows a page number as a place, not as a play button", () => {
    renderView(source(), [line({ location: "p. 42" })]);
    expect(screen.getByText("p. 42")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Play from/ })).toBeNull();
  });

  it("links an article out rather than framing it", () => {
    renderView(
      source({ kind: "article", url: "https://www.example.com/essay" }),
    );
    expect(document.querySelector("iframe")).toBeNull();
    expect(
      screen.getByRole("link", { name: /Open on example.com/ }),
    ).toHaveAttribute("href", "https://www.example.com/essay");
  });

  it("offers neither player nor link for an unsafe URL", () => {
    renderView(source({ url: "javascript:alert(1)" }));
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
