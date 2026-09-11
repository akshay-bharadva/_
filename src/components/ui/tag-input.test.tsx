import { describe, it, expect } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TagInput } from "./tag-input";

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");
  return (
    <TagInput
      tags={tags}
      onTagsChange={setTags}
      draft={draft}
      onDraftChange={setDraft}
    />
  );
}

describe("TagInput", () => {
  it("adds on Enter and on a comma, dropping a typed #", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "#travel" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "books," } });
    expect(screen.getByText("#travel")).toBeInTheDocument();
    expect(screen.getByText("#books")).toBeInTheDocument();
  });

  it("removes the last on Backspace in an empty field, or one by its button", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.keyDown(screen.getByLabelText("Add a tag"), { key: "Backspace" });
    expect(screen.queryByText("#c")).toBeNull();
    fireEvent.click(screen.getByLabelText("Remove tag a"));
    expect(screen.queryByText("#a")).toBeNull();
    expect(screen.getByText("#b")).toBeInTheDocument();
  });

  it("keeps what was typed when the field is left", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "later" } });
    fireEvent.blur(input);
    expect(screen.getByText("#later")).toBeInTheDocument();
  });
});
