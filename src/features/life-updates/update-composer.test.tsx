import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LifeUpdate } from "@/types";
import { UpdateComposer } from "./update-composer";

const add = vi.fn();
const save = vi.fn();

vi.mock("@/store/api/adminApi", () => ({
  useAddLifeUpdateMutation: () => [
    (data: unknown) => ({ unwrap: () => add(data) }),
    { isLoading: false },
  ],
  useUpdateLifeUpdateMutation: () => [
    (data: unknown) => ({ unwrap: () => save(data) }),
    { isLoading: false },
  ],
}));

const makeUpdate = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: "u1",
    title: "Finished the deck",
    content: "Notes",
    category: "watching",
    image_url: null,
    tags: ["one"],
    is_pinned: false,
    is_published: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as LifeUpdate;

const checked = () =>
  screen.getByRole("radio", { checked: true }).textContent ?? "";

beforeEach(() => {
  add.mockReset().mockResolvedValue({});
  save.mockReset().mockResolvedValue({});
});

describe("UpdateComposer — hydration", () => {
  it("defaults a new update to Thought", () => {
    render(<UpdateComposer />);
    expect(checked()).toContain("Thought");
  });

  it("hydrates an existing update", () => {
    render(<UpdateComposer update={makeUpdate()} />);
    expect(checked()).toContain("Watching");
    expect(screen.getByLabelText("Title")).toHaveValue("Finished the deck");
    expect(screen.getByLabelText("Update")).toHaveValue("Notes");
    expect(screen.getByText("#one")).toBeInTheDocument();
  });

  /** The column is nullable, so a row can arrive with no category at all. */
  it("falls back to Thought when the row has no category", () => {
    render(
      <UpdateComposer update={makeUpdate({ category: null as never })} />,
    );
    expect(checked()).toContain("Thought");
  });

  /**
   * The CHECK constraint arrived after the column did, so an old row can hold
   * anything. It is shown and flagged rather than silently replaced — and it
   * cannot be saved.
   */
  it("shows a category outside the list, flagged, and refuses to save it", async () => {
    render(
      <UpdateComposer update={makeUpdate({ category: "legacy" as never })} />,
    );
    expect(checked()).toContain("legacy");
    expect(checked()).toContain("unrecognised");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("legacy");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("UpdateComposer — writing", () => {
  it("cannot post an empty update", () => {
    render(<UpdateComposer />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("publishes a new update and clears for the next", async () => {
    render(<UpdateComposer />);
    fireEvent.click(screen.getByRole("radio", { name: /Milestone/ }));
    fireEvent.change(screen.getByLabelText("Update"), {
      target: { value: "Shipped it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][0]).toMatchObject({
      content: "Shipped it",
      category: "milestone",
      is_published: true,
      title: null,
      tags: null,
    });
    await waitFor(() => expect(screen.getByLabelText("Update")).toHaveValue(""));
  });

  it("saves a draft unpublished", async () => {
    render(<UpdateComposer />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Idea" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][0]).toMatchObject({ is_published: false });
  });

  it("publishes on Ctrl + Enter", async () => {
    render(<UpdateComposer />);
    const body = screen.getByLabelText("Update");
    fireEvent.change(body, { target: { value: "Quick one" } });
    fireEvent.keyDown(body, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  });

  it("edits in place, keeping a published update live", async () => {
    const onDone = vi.fn();
    render(<UpdateComposer update={makeUpdate()} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({
      id: "u1",
      is_published: true,
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("offers Move to drafts for a published update", async () => {
    render(<UpdateComposer update={makeUpdate()} />);
    fireEvent.click(screen.getByRole("button", { name: "Move to drafts" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ is_published: false });
  });

  /** Plain state rather than a form library: the shared schema does the checking. */
  it("validates against the shared schema before writing", async () => {
    render(<UpdateComposer />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "x".repeat(201) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });

  it("carries the pin", async () => {
    render(<UpdateComposer />);
    fireEvent.change(screen.getByLabelText("Update"), {
      target: { value: "Big news" },
    });
    fireEvent.click(screen.getByLabelText("Pin to the top of /updates"));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][0]).toMatchObject({ is_pinned: true });
  });
});

describe("UpdateComposer — tags", () => {
  it("adds a tag on Enter and on a comma, and removes the last on Backspace", () => {
    render(<UpdateComposer />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "#travel" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "books," } });
    expect(screen.getByText("#travel")).toBeInTheDocument();
    expect(screen.getByText("#books")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Backspace" });
    expect(screen.queryByText("#books")).toBeNull();
  });

  it("includes a tag still being typed when saving", async () => {
    render(<UpdateComposer />);
    fireEvent.change(screen.getByLabelText("Update"), {
      target: { value: "Hi" },
    });
    fireEvent.change(screen.getByLabelText("Add a tag"), {
      target: { value: "unfinished" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][0]).toMatchObject({ tags: ["unfinished"] });
  });
});

describe("UpdateComposer — images", () => {
  it("warns about an image address the site won't show", () => {
    render(
      <UpdateComposer
        update={makeUpdate({ image_url: "javascript:alert(1)" })}
      />,
    );
    expect(screen.queryByAltText("Attached")).toBeNull();
    expect(screen.getByText(/only shows images from an http/)).toBeInTheDocument();
  });
});
