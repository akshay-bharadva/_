import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { BlogPost, SiteContent } from "@/types";

const mocks = vi.hoisted(() => ({
  settings: undefined as SiteContent | undefined,
  sections: [] as unknown[],
  posts: [] as Partial<BlogPost>[],
  storage: "missing" as "ok" | "missing" | "unknown",
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetSiteSettingsQuery: () => ({ data: mocks.settings }),
  useGetPortfolioContentQuery: () => ({ data: mocks.sections }),
  useGetAdminBlogPostsQuery: () => ({ data: mocks.posts }),
  useGetStorageStatusQuery: () => ({ data: mocks.storage }),
}));

import { SETUP_DISMISS_KEY, SetupChecklist } from "./setup-checklist-card";

const fresh = () =>
  structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent;

const complete = (): SiteContent => {
  const identity = fresh();
  return {
    ...identity,
    profile_data: {
      ...identity.profile_data,
      name: "Ada",
      title: "Engineer",
      headline: "I build engines",
      default_theme: "theme-nord",
    },
    social_links: [
      { id: "github", label: "GitHub", url: "https://github.com/ada", is_visible: true },
    ],
  };
};

beforeEach(() => {
  window.localStorage.clear();
  mocks.settings = fresh();
  mocks.sections = [];
  mocks.posts = [];
  mocks.storage = "missing";
});

describe("SetupChecklist", () => {
  it("lists what a new install has left, each linked to where it is done", () => {
    render(<SetupChecklist />);
    expect(screen.getByRole("heading", { name: "Get your site ready" })).toBeInTheDocument();
    expect(screen.getByText("0 of 7 done — 7 to go.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Publish a first post/ })).toHaveAttribute(
      "href",
      "/admin/blog",
    );
  });

  it("counts what is already done", () => {
    mocks.posts = [{ id: "1", published: true }];
    mocks.storage = "ok";
    render(<SetupChecklist />);
    expect(screen.getByText("2 of 7 done — 5 to go.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });

  /** A finished checklist is noise on every dashboard visit after. */
  it("disappears once everything is done", () => {
    mocks.settings = complete();
    mocks.sections = [{ id: "s" }];
    mocks.posts = [{ id: "1", published: true }];
    mocks.storage = "ok";
    const { container } = render(<SetupChecklist />);
    expect(container).toBeEmptyDOMElement();
  });

  it("can be hidden for now, and stays hidden in this browser", () => {
    const { unmount } = render(<SetupChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "Hide for now" }));
    expect(screen.queryByText("Get your site ready")).toBeNull();
    expect(window.localStorage.getItem(SETUP_DISMISS_KEY)).toBe("1");
    unmount();
    render(<SetupChecklist />);
    expect(screen.queryByText("Get your site ready")).toBeNull();
  });

  it("waits for the settings before saying anything", () => {
    mocks.settings = undefined;
    const { container } = render(<SetupChecklist />);
    expect(container).toBeEmptyDOMElement();
  });
});
