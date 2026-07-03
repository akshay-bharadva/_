import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NavLink } from "@/types";
import { NavLinkForm } from "./nav-link-form";

const makeLink = (overrides: Partial<NavLink> = {}): NavLink => ({
  id: "n1",
  label: "About",
  href: "/about",
  display_order: 0,
  is_visible: true,
  ...overrides,
});

const renderForm = (
  link: Partial<NavLink> | null,
  existingLinks: NavLink[] = [],
) => {
  const onSave = vi.fn();
  render(
    <NavLinkForm
      link={link}
      existingLinks={existingLinks}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );
  return { onSave };
};

describe("NavLinkForm", () => {
  it("hydrates from the link being edited", () => {
    renderForm(makeLink());
    expect(screen.getByLabelText("Label")).toHaveValue("About");
    expect(screen.getByLabelText("Path")).toHaveValue("/about");
  });

  it("starts empty for a new link", () => {
    renderForm(null);
    expect(screen.getByLabelText("Label")).toHaveValue("");
    expect(screen.getByLabelText("Path")).toHaveValue("");
  });

  /**
   * The old copy claimed every path "becomes a page built from its CMS
   * sections". That is only true for unreserved paths — this is the correction.
   */
  it("says a built-in path already has a page", async () => {
    renderForm(makeLink({ href: "/about" }));
    expect(await screen.findByText(/Built-in page\./)).toBeInTheDocument();
  });

  it("says an unreserved path is a page this link creates", async () => {
    renderForm(makeLink({ href: "/uses" }));
    expect(await screen.findByText(/CMS page\./)).toBeInTheDocument();
    expect(
      screen.getByText(/exists only because this link does/),
    ).toBeInTheDocument();
  });

  it("warns that a reserved path with no route will 404", async () => {
    renderForm(makeLink({ href: "/experience" }));
    expect(await screen.findByText(/No page exists\./)).toBeInTheDocument();
  });

  it("warns when another link already uses the path", async () => {
    renderForm(makeLink({ id: "n2", href: "/about" }), [
      makeLink({ id: "n1", label: "About me", href: "/about" }),
    ]);
    expect(
      await screen.findByText(/already uses this path/),
    ).toBeInTheDocument();
  });

  it("does not call a link a duplicate of itself", () => {
    const link = makeLink();
    renderForm(link, [link]);
    expect(
      screen.queryByText(/already uses this path/),
    ).not.toBeInTheDocument();
  });

  it("updates the explanation as the path is typed", async () => {
    renderForm(makeLink({ href: "" }));
    fireEvent.change(screen.getByLabelText("Path"), {
      target: { value: "/uses" },
    });
    expect(await screen.findByText(/CMS page\./)).toBeInTheDocument();
  });

  it("rejects an external URL rather than building a broken path", async () => {
    const { onSave } = renderForm(
      makeLink({ label: "Blog", href: "https://example.com" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Must be a site path starting with/),
    ).toBeInTheDocument();
  });

  it("submits a valid link", async () => {
    const { onSave } = renderForm(makeLink({ label: "Uses", href: "/uses" }));
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Uses", href: "/uses" }),
    );
  });
});
