import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LifeUpdate } from "@/types";
import { TimelineLayout } from "./timeline-layout";

const update = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: Math.random().toString(36).slice(2),
    title: "An update",
    content: "",
    category: "thought",
    created_at: "2026-03-04T12:00:00Z",
    is_pinned: false,
    ...overrides,
  }) as LifeUpdate;

describe("TimelineLayout", () => {
  it("groups entries by month, newest month as given", () => {
    render(
      <TimelineLayout
        updates={[
          update({ title: "March one", created_at: "2026-03-10T12:00:00Z" }),
          update({ title: "March two", created_at: "2026-03-02T12:00:00Z" }),
          update({ title: "February", created_at: "2026-02-10T12:00:00Z" }),
        ]}
      />,
    );
    const months = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(months).toEqual(["March 2026", "February 2026"]);
  });

  /** Owner-entered and public: an image URL goes through the allowlist. */
  it("drops an image whose URL is not a web image", () => {
    const { container } = render(
      <TimelineLayout
        updates={[update({ image_url: "javascript:alert(1)" } as Partial<LifeUpdate>)]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
