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
 * A row as the database actually stores it — including a social link whose id
 * is not one the defaults file has ever heard of, which the previous form
 * dropped on every save.
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
    { id: "pixelfed", label: "Pixelfed", url: "https://pf", is_visible: true },
  ],
  footer_data: { copyright_text: "All rights reserved" },
} as unknown as SiteContent;

const openGroup = (label: string | RegExp) =>
  fireEvent.click(screen.getAllByRole("button", { name: label })[0]);

const lastPayload = () =>
  mocks.update.mock.calls[mocks.update.mock.calls.length - 1][0];

beforeEach(() => {
  mocks.data = JSON.parse(JSON.stringify(storedSettings));
  mocks.isLoading = false;
  mocks.update
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve(null) });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe("SettingsPage hydration", () => {
  it("loads the stored row into the first group", async () => {
    render(<SettingsPage />);
    expect(await screen.findByLabelText("Display name")).toHaveValue("Akshay");
    expect(screen.getByLabelText("Logo")).toHaveValue("Ak");
  });

  it("stays clean on load", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");
    expect(screen.queryByText(/Unsaved changes in/)).toBeNull();
  });

  it("names the group with unsaved changes", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Akshay B" },
    });
    // The bar names the group rather than saying "you have unsaved changes".
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /Save brand & logo/i }),
      ).not.toHaveLength(0),
    );
  });
});

describe("SettingsPage per-group save", () => {
  /**
   * The whole reason the screen was rebuilt around groups: previously one
   * resolver ran over one submit, so a value the schema rejected anywhere
   * blocked every unrelated save.
   */
  it("saves one group while another group is invalid", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    // Break GitHub: the section is shown, so a blank username fails the schema.
    openGroup(/^GitHub/);
    fireEvent.change(await screen.findByLabelText("Username"), {
      target: { value: "" },
    });

    // Now fix a footer typo. Nothing about GitHub should stand in the way.
    openGroup(/^Footer/);
    fireEvent.change(await screen.findByLabelText("Copyright line"), {
      target: { value: "© 2026 Akshay" },
    });
    openGroup(/Save footer/);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastPayload().footer_data.copyright_text).toBe("© 2026 Akshay");
  });

  it("refuses the group that is actually invalid", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    openGroup(/^GitHub/);
    fireEvent.change(await screen.findByLabelText("Username"), {
      target: { value: "" },
    });
    openGroup(/Save github/i);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  /** Saving the footer must not carry a half-typed name into the database. */
  it("writes only the columns the group owns", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Half-typed na" },
    });

    openGroup(/^Footer/);
    fireEvent.change(await screen.findByLabelText("Copyright line"), {
      target: { value: "© 2026" },
    });
    openGroup(/Save footer/);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const payload = lastPayload();
    expect(Object.keys(payload)).toEqual(["footer_data"]);
    expect(payload.profile_data).toBeUndefined();
  });

  it("keeps untouched parts of profile_data when saving one part of it", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Akshay B" },
    });
    openGroup(/Save brand & logo/i);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const payload = lastPayload();
    expect(payload.profile_data.name).toBe("Akshay B");
    expect(payload.profile_data.github_projects_config.username).toBe("akshay");
    expect(payload.profile_data.status_panel.availability).toBe("Open to work");
  });
});

describe("SettingsPage open lists", () => {
  /**
   * `BIO_SLOTS = 2` used to be the only thing deciding how many bio paragraphs
   * a site could have — a limit present in neither the schema nor the database.
   */
  it("accepts a third bio paragraph", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    openGroup(/^Hero & bio/);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add paragraph" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add paragraph" }));

    fireEvent.change(screen.getByLabelText("Bio paragraph 2"), {
      target: { value: "Second." },
    });
    fireEvent.change(screen.getByLabelText("Bio paragraph 3"), {
      target: { value: "Third." },
    });
    openGroup(/Save hero & bio/i);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastPayload().profile_data.bio).toEqual([
      "The only stored paragraph.",
      "Second.",
      "Third.",
    ]);
  });

  it("drops a bio row left blank rather than rendering an empty paragraph", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    openGroup(/^Hero & bio/);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add paragraph" }),
    );
    openGroup(/Save hero & bio/i);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastPayload().profile_data.bio).toEqual([
      "The only stored paragraph.",
    ]);
  });

  /**
   * The old section mapped over a hard-coded list and merged by id, so a link
   * the defaults file did not contain never appeared — and was written away.
   */
  it("keeps a social link whose id is not a known platform", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    openGroup(/^Social links/);
    expect(await screen.findByDisplayValue("Pixelfed")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Link 1 URL"), {
      target: { value: "https://github.com/akshay" },
    });
    openGroup(/Save social links/i);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastPayload().social_links).toHaveLength(2);
    expect(lastPayload().social_links[1].id).toBe("pixelfed");
  });

  it("adds a link that was not in the row at all", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    openGroup(/^Social links/);
    fireEvent.click(await screen.findByRole("button", { name: "LinkedIn" }));
    openGroup(/Save social links/i);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(
      lastPayload().social_links.map((link: { id: string }) => link.id),
    ).toContain("linkedin");
  });
});

describe("SettingsPage revert", () => {
  it("restores this group and leaves other groups alone", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Changed" },
    });

    openGroup(/^Footer/);
    fireEvent.change(await screen.findByLabelText("Copyright line"), {
      target: { value: "Also changed" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Revert" })[0]);

    await waitFor(() =>
      expect(screen.getByLabelText("Copyright line")).toHaveValue(
        "All rights reserved",
      ),
    );

    // The nav item's accessible name carries its unsaved marker.
    openGroup(/^Brand & logo/);
    expect(await screen.findByLabelText("Display name")).toHaveValue("Changed");
  });
});

describe("SettingsNav search", () => {
  it("filters the rail and finds a group by a field path", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Display name");

    fireEvent.change(screen.getAllByLabelText("Search settings")[0], {
      target: { value: "custom_theme_colors" },
    });

    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: "Footer" })).toHaveLength(
        0,
      ),
    );
    expect(
      screen.getAllByRole("button", { name: "Theme" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("SettingsPage save all", () => {
  const dirtyTwoGroups = async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Akshay B" },
    });

    openGroup(/^Footer/);
    fireEvent.change(await screen.findByLabelText("Copyright line"), {
      target: { value: "© 2026" },
    });
  };

  it("offers no master save while only one group is dirty", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Akshay B" },
    });

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /Save brand & logo/i }),
      ).not.toHaveLength(0),
    );
    // "Save all" and "Save this group" would be the same write.
    expect(screen.queryByRole("button", { name: /Save all/i })).toBeNull();
  });

  /**
   * The point of a master save: two groups edited across two visits go to the
   * database in one write, not one per group.
   */
  it("writes every dirty group in a single request", async () => {
    await dirtyTwoGroups();

    fireEvent.click(
      await screen.findByRole("button", { name: /Save all \(2\)/i }),
    );

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const payload = lastPayload();
    expect(payload.profile_data.name).toBe("Akshay B");
    expect(payload.footer_data.copyright_text).toBe("© 2026");
    // Groups nobody touched are still not in the write.
    expect(payload.social_links).toBeUndefined();
  });

  it("names every dirty group in the bar", async () => {
    await dirtyTwoGroups();
    expect(await screen.findByText(/Brand & logo, Footer/)).toBeInTheDocument();
  });

  /** One invalid group must not stop the others from being saved. */
  it("saves the valid groups and reports the one it skipped", async () => {
    await dirtyTwoGroups();

    openGroup(/^GitHub/);
    fireEvent.change(await screen.findByLabelText("Username"), {
      target: { value: "" },
    });

    fireEvent.click(
      await screen.findByRole("button", { name: /Save all \(3\)/i }),
    );

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    const payload = lastPayload();
    expect(payload.profile_data.name).toBe("Akshay B");
    expect(payload.footer_data.copyright_text).toBe("© 2026");
    // The blank username is not written, and the skip is reported rather than
    // swallowed.
    expect(payload.profile_data.github_projects_config.username).toBe("akshay");
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        expect.stringContaining("GitHub"),
        expect.anything(),
      ),
    );
  });

  it("discards every dirty group at once", async () => {
    await dirtyTwoGroups();

    fireEvent.click(
      await screen.findByRole("button", { name: /Discard all/i }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Copyright line")).toHaveValue(
        "All rights reserved",
      ),
    );
    openGroup(/^Brand & logo/);
    expect(await screen.findByLabelText("Display name")).toHaveValue("Akshay");
  });
});

describe("SettingsPage save bar visibility", () => {
  /**
   * The bar used to be gated on the *active* group being dirty, so navigating
   * away from an edit hid the only control that would save it — the edit could
   * only be saved by finding your way back to where you made it.
   *
   * Asserted through the save rather than through the bar's presence:
   * `AnimatePresence` keeps an exiting node mounted for the length of its
   * animation, and in jsdom that animation never completes, so querying for the
   * button passes whether or not the bar is on its way out. Clicking it and
   * checking what was written is the only version of this that can fail.
   */
  it("saves the other group's edit without going back to it", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Akshay B" },
    });

    openGroup(/^Footer/);
    await screen.findByLabelText("Copyright line");
    openGroup(/Save brand & logo/i);

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(lastPayload().profile_data.name).toBe("Akshay B");
  });

  it("disappears once everything is saved", async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Display name")).toHaveValue("Akshay"),
    );
    expect(
      screen.queryByRole("button", { name: /Save brand & logo/i }),
    ).toBeNull();
  });
});
