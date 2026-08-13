import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SiteContent } from "@/types";
import SettingsPage from "./settings-page";

const mocks = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  update: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetSiteSettingsQuery: () => ({
    data: mocks.data,
    isLoading: mocks.isLoading,
  }),
  useUpdateSiteSettingsMutation: () => [mocks.update, { isLoading: false }],
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

/**
 * A row as the database actually stores it: one bio paragraph and one
 * "currently exploring" entry, while the form renders two inputs for each.
 */
const storedSettings = {
  id: 1,
  portfolio_mode: "multi-page",
  profile_data: {
    name: "Akshay",
    title: "Engineer",
    description: "Hello there",
    profile_picture_url: "",
    show_profile_picture: true,
    default_theme: "theme-ink-light",
    typography_preset: "typo-default",
    updates_layout: "scrapbook",
    logo: { main: "Ak", highlight: "shay" },
    bio: ["The only stored paragraph."],
    status_panel: {
      show: true,
      design: "minimal",
      title: "Status",
      availability: "Open to work",
      currently_exploring: { title: "Exploring", items: ["Rust"] },
      latestProject: { name: "Portfolio", linkText: "See it", href: "/work" },
    },
    github_projects_config: {
      username: "akshay",
      show: true,
      sort_by: "updated",
      exclude_forks: true,
      exclude_archived: true,
      exclude_profile_repo: true,
      min_stars: 1,
      projects_per_page: 9,
    },
    contact_page: {
      show_contact_form: true,
      show_availability_badge: true,
      show_services: true,
    },
  },
  social_links: [
    { id: "github", label: "GitHub", url: "https://gh", is_visible: true },
  ],
  footer_data: { copyright_text: "All rights reserved" },
} as unknown as SiteContent;

beforeEach(() => {
  mocks.data = storedSettings;
  mocks.isLoading = false;
  mocks.update
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve(null) });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe("SettingsPage hydration", () => {
  it("shows the stored values in the fields the form renders", async () => {
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("About Bio (Paragraph 1)")).toHaveValue(
        "The only stored paragraph.",
      ),
    );
    expect(screen.getByLabelText("Hero Title")).toHaveValue("Engineer");
    expect(screen.getByLabelText("Exploring #1")).toHaveValue("Rust");
  });

  it("renders the trailing array slots as controlled empty inputs", async () => {
    render(<SettingsPage />);

    // These have no counterpart in the stored row. Left unpadded they register
    // as `undefined`, which React renders as an uncontrolled input.
    await waitFor(() =>
      expect(screen.getByLabelText("About Bio (Paragraph 2)")).toHaveValue(""),
    );
    expect(screen.getByLabelText("Exploring #2")).toHaveValue("");
  });

  it("stays clean on load, so the unsaved-changes bar is hidden", async () => {
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("Hero Title")).toHaveValue("Engineer"),
    );
    expect(screen.queryByText("You have unsaved changes")).toBeNull();
  });

  it("shows the unsaved-changes bar once a field is edited", async () => {
    render(<SettingsPage />);

    const title = await screen.findByLabelText("Hero Title");
    fireEvent.change(title, { target: { value: "Staff Engineer" } });

    expect(
      await screen.findByText("You have unsaved changes"),
    ).toBeInTheDocument();
  });
});

describe("SettingsPage submit", () => {
  it("does not persist the blank slots the form padded in", async () => {
    render(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("Hero Title")).toHaveValue("Engineer"),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Save Changes/ })[0]);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const payload = mocks.update.mock.calls[0][0];
    expect(payload.profile_data.bio).toEqual(["The only stored paragraph."]);
    expect(payload.profile_data.status_panel.currently_exploring.items).toEqual(
      ["Rust"],
    );
  });

  it("stays clean through a save round-trip", async () => {
    // Saving invalidates the SiteContent tag, so the query hands back a fresh
    // object and the form resets again. Nothing the user did should be dirty.
    const { rerender } = render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Hero Title")).toHaveValue("Engineer"),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Save Changes/ })[0]);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());

    mocks.data = JSON.parse(JSON.stringify(storedSettings));
    rerender(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByLabelText("Hero Title")).toHaveValue("Engineer"),
    );
    expect(screen.queryByText("You have unsaved changes")).toBeNull();
  });

  it("keeps both paragraphs when both are filled", async () => {
    render(<SettingsPage />);

    const second = await screen.findByLabelText("About Bio (Paragraph 2)");
    fireEvent.change(second, { target: { value: "A second paragraph." } });
    fireEvent.click(screen.getAllByRole("button", { name: /Save Changes/ })[0]);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update.mock.calls[0][0].profile_data.bio).toEqual([
      "The only stored paragraph.",
      "A second paragraph.",
    ]);
  });
});
