import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

/**
 * Every icon-only button needs an accessible name.
 *
 * A button whose only child is an icon has no text for a screen reader to
 * announce — it reads as "button", and a toolbar of them reads as "button,
 * button, button". The rich-text editor's entire toolbar, 23 controls, was in
 * exactly that state when this was written.
 *
 * Nothing else catches it: the markup is valid, the icons render, and the
 * buttons work for anyone using a mouse.
 */

const SRC = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry))
      out.push(full);
  }
  return out;
}

/**
 * Read each icon button as a whole element.
 *
 * Deliberately not an attribute regex. Scanning forwards from `<Button` for
 * the closing `>` lands on the one inside `onClick={() => …}`, which truncates
 * the attributes — two earlier versions of this audit did exactly that and
 * reported working buttons as unnamed while missing the real ones.
 */
function iconButtons(
  source: string,
): { line: number; attrs: string; after: string }[] {
  const lines = source.split(/\r?\n/);
  const found: { line: number; attrs: string; after: string }[] = [];

  lines.forEach((line, i) => {
    if (!/size="icon"/.test(line)) return;

    let open = -1;
    for (let j = i; j >= 0 && j > i - 15; j -= 1) {
      if (/<(Button|button)\b/.test(lines[j])) {
        open = j;
        break;
      }
    }
    if (open === -1) return;

    let close = open;
    while (close < lines.length && close < open + 25) {
      const trimmed = lines[close].trim();
      const ends = trimmed === ">" || trimmed.endsWith(">");
      if (ends && !trimmed.endsWith("=>") && close > open) break;
      close += 1;
    }

    found.push({
      line: open + 1,
      attrs: lines.slice(open, close + 1).join("\n"),
      after: lines.slice(close + 1, close + 6).join("\n"),
    });
  });

  return found;
}

const FILES = walk(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).replace(/\\/g, "/"),
  source: readFileSync(path, "utf-8"),
}));

describe("icon buttons", () => {
  const all = FILES.flatMap(({ path, source }) =>
    iconButtons(source).map((button) => ({ path, ...button })),
  );

  it("found icon buttons to check", () => {
    // Guards the parser: every assertion below filters this list, so a parser
    // that stops matching turns the check green while saying nothing.
    expect(all.length).toBeGreaterThan(50);
  });

  it("all have an accessible name", () => {
    const unnamed = all
      .filter(
        (button) =>
          !/aria-label|aria-labelledby|title=/.test(button.attrs) &&
          // A visually-hidden span in the children names it just as well.
          !/sr-only/.test(button.after),
      )
      .map((button) => `${button.path}:${button.line}`);

    expect(unnamed).toEqual([]);
  });
});
