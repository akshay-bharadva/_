import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { LifeUpdate } from "@/types";
import { UpdatesPage } from "./updates-page";

const state: {
  updates: LifeUpdate[];
  layout: "timeline" | "scrapbook";
} = { updates: [], layout: "scrapbook" };

vi.mock("@/store/api/publicApi", () => ({
  useGetPublishedLifeUpdatesQuery: () => ({
    data: state.updates,
    isLoading: false,
  }),
  useGetSiteIdentityQuery: () => ({
    data: { profile_data: { updates_layout: state.layout } },
  }),
}));

vi.mock("@/features/sections/dynamic-page-content", () => ({
  DynamicPageContent: ({ pagePath }: { pagePath: string }) => (
    <div data-testid="cms-sections" data-path={pagePath} />
  ),
}));

const update = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: Math.random().toString(36).slice(2),
    title: "An update",
    content: "",
    category: "thought",
    created_at: "2026-03-04T12:00:00Z",
    is_pinned: false,
    is_published: true,
    ...overrides,
  }) as LifeUpdate;

beforeEach(() => {
  state.updates = [];
  state.layout = "scrapbook";
});

describe("UpdatesPage", () => {
  /**
   * Updates was the one content page with no CMS slot, so a section — the
   * Library's random highlight among them — could be placed on Contact but
   * not here.
   */
  it("hosts the CMS sections placed on /updates", () => {
    render(<UpdatesPage />);
    expect(screen.getByTestId("cms-sections")).toHaveAttribute(
      "data-path",
      "/updates",
    );
  });

  it("leads with what is pinned, and does not repeat it in the feed", () => {
    state.updates = [
      update({ title: "Pinned news", is_pinned: true }),
      update({ title: "Ordinary news" }),
    ];
    render(<UpdatesPage />);
    const pinned = screen.getByRole("region", { name: "Pinned" });
    expect(within(pinned).getByText("Pinned news")).toBeInTheDocument();
    expect(screen.getAllByText("Pinned news")).toHaveLength(1);
    expect(screen.getByText("Ordinary news")).toBeInTheDocument();
  });

  /** A search that skipped pinned updates would look broken. */
  it("includes pinned matches once filtering", () => {
    state.updates = [
      update({ title: "Pinned trip", is_pinned: true }),
      update({ title: "Other" }),
    ];
    render(<UpdatesPage />);
    fireEvent.change(screen.getByLabelText("Search updates"), {
      target: { value: "trip" },
    });
    expect(screen.getAllByText("Pinned trip")).toHaveLength(2);
    expect(screen.queryByText("Other")).toBeNull();
    expect(screen.getByText("That's every match")).toBeInTheDocument();
  });

  it("filters the feed by a tag, and clears it", () => {
    state.updates = [
      update({ title: "Hike", tags: ["outdoors"] }),
      update({ title: "Film", tags: ["movies"] }),
    ];
    render(<UpdatesPage />);
    fireEvent.click(screen.getByLabelText("Show updates tagged outdoors"));
    expect(screen.queryByText("Film")).toBeNull();

    fireEvent.click(screen.getByLabelText("Stop filtering by outdoors"));
    expect(screen.getByText("Film")).toBeInTheDocument();
  });

  it("offers to clear filters that match nothing", () => {
    state.updates = [update({ title: "Only one" })];
    render(<UpdatesPage />);
    fireEvent.change(screen.getByLabelText("Search updates"), {
      target: { value: "zzz" },
    });
    fireEvent.click(screen.getByText("Clear filters"));
    expect(screen.getByText("Only one")).toBeInTheDocument();
  });

  it("groups the journal by month", () => {
    state.layout = "timeline";
    state.updates = [
      update({ title: "March one", created_at: "2026-03-10T12:00:00Z" }),
      update({ title: "March two", created_at: "2026-03-02T12:00:00Z" }),
      update({ title: "February", created_at: "2026-02-10T12:00:00Z" }),
    ];
    render(<UpdatesPage />);
    const months = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(months).toEqual(["March 2026", "February 2026"]);
  });

  /** Owner-entered and public: an image URL goes through the allowlist. */
  it("drops an image whose URL is not a web image", () => {
    state.updates = [update({ image_url: "javascript:alert(1)" })];
    const { container } = render(<UpdatesPage />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("says so when nothing is published", () => {
    render(<UpdatesPage />);
    expect(screen.getByText("Nothing posted yet.")).toBeInTheDocument();
  });
});
