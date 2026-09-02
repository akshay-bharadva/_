import type { Note } from "@/types";

/**
 * What to call a note that has no title.
 *
 * A note's title is genuinely optional — you open one to write, and a heading
 * is often the last thing you add, if ever. Writing "Untitled" over the top of
 * it is the app telling you off for that: a whole board of notes reading
 * "Untitled / Untitled / Untitled" says nothing, when the note's own first
 * line usually says exactly what it is.
 *
 * So an untitled note is titled by its opening line. "New note" is reserved
 * for the one case where there is genuinely nothing to show — an empty note,
 * which is the moment just after you created it.
 *
 * `derived` tells the caller which of the two it got, so a real title can be
 * set solid and a borrowed one muted. Without that a derived line would look
 * like a title the author wrote.
 */
export interface NoteLabel {
  text: string;
  /** True when the text came from the body rather than the title column. */
  derived: boolean;
}

/** Longer than this and a card truncates anyway; cut on a word where possible. */
const MAX_DERIVED = 60;

export function noteLabel(
  note: Pick<Note, "title" | "content">,
  emptyLabel = "New note",
): NoteLabel {
  const title = note.title?.trim();
  if (title) return { text: title, derived: false };

  const line = firstMeaningfulLine(note.content ?? "");
  if (line) return { text: line, derived: true };

  return { text: emptyLabel, derived: true };
}

/**
 * The first line of the body with its markup taken off.
 *
 * Notes are markdown, so the raw first line is as likely to be `## Heading` or
 * `- [ ] thing` as it is prose. Leading syntax is stripped rather than the
 * whole line skipped: `# Groceries` should read "Groceries", not fall through
 * to the second line.
 */
export function firstMeaningfulLine(content: string): string {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      // Emphasis and code markers, left over once the line is unwrapped.
      .replace(/[*_`~]/g, "")
      .trim();

    // A fence or a rule is not a line of text.
    if (!line || /^([-*_])\1{2,}$/.test(line.replace(/\s/g, ""))) continue;

    return line.length > MAX_DERIVED
      ? `${line.slice(0, MAX_DERIVED).replace(/\s+\S*$/, "")}…`
      : line;
  }

  return "";
}
