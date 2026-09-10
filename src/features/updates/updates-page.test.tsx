import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdatesPage } from "./updates-page";

vi.mock("@/store/api/publicApi", () => ({
  useGetPublishedLifeUpdatesQuery: () => ({ data: [], isLoading: false }),
  useGetSiteIdentityQuery: () => ({ data: undefined }),
}));

vi.mock("@/features/sections/dynamic-page-content", () => ({
  DynamicPageContent: ({ pagePath }: { pagePath: string }) => (
    <div data-testid="cms-sections" data-path={pagePath} />
  ),
}));

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
});
