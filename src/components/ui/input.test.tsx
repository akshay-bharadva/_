import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Textarea } from "./textarea";

/**
 * Most columns behind these fields are nullable, and react-hook-form passes the
 * row value straight through. Before this, a `null` reached the DOM node and
 * React flipped the field from controlled to uncontrolled mid-edit, wiping what
 * the user had typed and logging a warning.
 */
describe("Input null tolerance", () => {
  it("renders null as an empty controlled value", () => {
    render(<Input value={null} onChange={() => {}} aria-label="field" />);
    expect(screen.getByLabelText("field")).toHaveValue("");
  });

  it("still renders a real value", () => {
    render(<Input value="hello" onChange={() => {}} aria-label="field" />);
    expect(screen.getByLabelText("field")).toHaveValue("hello");
  });

  it("leaves undefined alone so uncontrolled inputs stay uncontrolled", () => {
    render(<Input defaultValue="typed" aria-label="field" />);
    expect(screen.getByLabelText("field")).toHaveValue("typed");
  });

  it("renders a numeric zero rather than treating it as empty", () => {
    render(
      <Input type="number" value={0} onChange={() => {}} aria-label="amount" />,
    );
    expect(screen.getByLabelText("amount")).toHaveValue(0);
  });
});

describe("Textarea null tolerance", () => {
  it("renders null as an empty controlled value", () => {
    render(<Textarea value={null} onChange={() => {}} aria-label="notes" />);
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("still renders a real value", () => {
    render(<Textarea value="body" onChange={() => {}} aria-label="notes" />);
    expect(screen.getByLabelText("notes")).toHaveValue("body");
  });
});
