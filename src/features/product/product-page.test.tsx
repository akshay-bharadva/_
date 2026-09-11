import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import { PRODUCT } from "@/lib/product";

const applyTheme = vi.hoisted(() => vi.fn());

vi.mock("@/lib/themes", async (original) => ({
  ...(await original<typeof import("@/lib/themes")>()),
  applyTheme,
}));
vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({
    data: {
      ...SITE_IDENTITY_DEFAULTS,
      profile_data: {
        ...SITE_IDENTITY_DEFAULTS.profile_data,
        default_theme: "theme-paper",
      },
    },
  }),
}));

import { ProductPage } from "./product-page";

beforeEach(() => applyTheme.mockClear());

describe("ProductPage", () => {
  it("leads with the promise and the figures counted from the code", () => {
    render(<ProductPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your portfolio and your personal OS, in one repo.",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "By the numbers" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(4);
  });

  /** Plans come from the owner's config — nothing here is a made-up price. */
  it("shows the plans from the config, each with its way in", () => {
    render(<ProductPage />);
    for (const plan of PRODUCT.plans) {
      const card = screen.getByRole("article", { name: plan.name });
      expect(within(card).getByText(plan.price)).toBeInTheDocument();
      expect(
        within(card).getByRole("link", { name: plan.cta.label }),
      ).toBeInTheDocument();
    }
  });

  it("previews a theme on the page, and puts the site's own back", () => {
    render(<ProductPage />);
    fireEvent.click(screen.getByRole("button", { name: /Nord/ }));
    expect(applyTheme).toHaveBeenLastCalledWith(
      "theme-nord",
      "typo-default",
      undefined,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Reset to this site's theme/ }),
    );
    expect(applyTheme).toHaveBeenLastCalledWith(
      "theme-paper",
      "typo-default",
      expect.anything(),
    );
  });

  it("restores the site's theme when the visitor leaves mid-preview", () => {
    const { unmount } = render(<ProductPage />);
    fireEvent.click(screen.getByRole("button", { name: /Dracula/ }));
    applyTheme.mockClear();
    unmount();
    expect(applyTheme).toHaveBeenCalledWith(
      "theme-paper",
      "typo-default",
      expect.anything(),
    );
  });

  it("answers the questions a buyer asks first", () => {
    render(<ProductPage />);
    expect(screen.getByText("Do I need a server?")).toBeInTheDocument();
    expect(screen.getByText("Who owns my data?")).toBeInTheDocument();
  });
});
