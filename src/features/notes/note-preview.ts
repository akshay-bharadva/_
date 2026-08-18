/**
 * A note body reduced to plain text, for card previews.
 *
 * Cards used to run the markdown through a renderer with no GFM plugin and no
 * highlighting, so a table printed as literal pipes, a fence printed as an
 * unstyled block, and a heading in the first line made one card twice the
 * height of its neighbours. A preview is a glance, not a document — Keep shows
 * plain text for exactly this reason, and it means the card can never disagree
 * with the full pipeline used on the reading view because it is not trying to
 * reproduce it.
 */
export function toPlainText(markdown: string | null | undefined): string {
  if (!markdown) return "";

  return (
    markdown
      // Fenced code: keep the code itself, drop the fence and language tag.
      .replace(/```[a-zA-Z0-9]*\n?/g, "")
      .replace(/~~~[a-zA-Z0-9]*\n?/g, "")
      // Images carry no text worth previewing; their alt is usually a filename.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // Links and wikilinks read as their label.
      .replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target, alias) =>
        (alias ?? target).trim(),
      )
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Any HTML the editor let through.
      .replace(/<[^>]+>/g, "")
      // Leading block markers: heading hashes, quotes, list bullets, task boxes.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, "")
      // Horizontal rules leave nothing behind.
      .replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
      // Emphasis, inline code and strikethrough markers.
      .replace(/(\*\*|__|\*|_|~~|`)/g, "")
      // A table's alignment row (`| --- | :--: |`) carries no content, and
      // stripping only the pipes would leave a row of loose dashes.
      .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, "")
      // Remaining pipes become spaces so cells do not run together.
      .replace(/\|/g, " ")
      // Collapse the whitespace the substitutions leave behind.
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim()
  );
}
