import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichMarkdown } from "./rich-markdown";

/**
 * The long-form pipeline. Notes and blog posts both write through the same
 * editor, and notes were rendering through the short-form `Markdown`, which
 * deliberately omits Prism — so code fences came out as unhighlighted blocks.
 */
describe("RichMarkdown", () => {
  it("highlights a fenced code block", () => {
    const { container } = render(
      <RichMarkdown>{"```js\nconst a = 1;\n```"}</RichMarkdown>,
    );
    const code = container.querySelector("pre code");
    expect(code).toBeTruthy();
    // The `language-` class is what proves Prism ran, rather than the fence
    // being rendered as a plain block.
    expect(code?.className).toMatch(/language-/);
  });

  it("keeps Prism's token markup through sanitization", () => {
    const { container } = render(
      <RichMarkdown>{"```js\nconst a = 1;\n```"}</RichMarkdown>,
    );
    // The sanitizer runs after highlighting; without `className` on the
    // allowlist it strips exactly the classes Prism just added.
    expect(container.querySelector("pre code span")).toBeTruthy();
  });

  it("renders a GFM table", () => {
    render(<RichMarkdown>{"| a | b |\n| - | - |\n| 1 | 2 |"}</RichMarkdown>);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders a GFM task list", () => {
    const { container } = render(
      <RichMarkdown>{"- [x] done\n- [ ] todo"}</RichMarkdown>,
    );
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
  });

  it("gives headings an id, so anchors resolve", () => {
    const { container } = render(<RichMarkdown>{"## A heading"}</RichMarkdown>);
    expect(container.querySelector("h2")?.id).toBeTruthy();
  });

  /** Raw HTML passes through, but only what the schema allows. */
  it("strips a script tag from raw HTML", () => {
    const { container } = render(
      <RichMarkdown>{"<p>ok</p><script>alert(1)</script>"}</RichMarkdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("ok");
  });

  it("lets a caller decide how links behave", () => {
    render(
      <RichMarkdown
        components={{ a: ({ children }) => <button>{children}</button> }}
      >
        {"[go](https://example.com)"}
      </RichMarkdown>,
    );
    expect(screen.getByRole("button", { name: "go" })).toBeInTheDocument();
  });
});
