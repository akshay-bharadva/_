import type { Note } from "@/types";

/**
 * `[[Wikilinks]]` between notes.
 *
 * The defining feature of every note tool worth using — Obsidian, Roam,
 * Logseq — and the reason a collection of notes becomes more useful than the
 * sum of its parts. Without it, a note you wrote six months ago is only
 * findable if you remember it exists.
 *
 * Links live in the markdown body rather than in a join table. The text is the
 * source of truth, so a link cannot survive the sentence that created it being
 * deleted, and there is nothing to keep in sync on every save.
 */

/** `[[Target]]` or `[[Target|shown text]]`. */
const WIKILINK = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

export interface ParsedLink {
  /** The note title being referenced. */
  target: string;
  /** What to render, when the link supplies an alias. */
  label: string;
}

/**
 * Every wikilink in a note body, in order, deduplicated by target.
 *
 * Fenced code blocks are skipped: `[[` inside a snippet is code, not a link,
 * and turning it into one would silently rewrite what the note says.
 */
export function extractLinks(content: string | null | undefined): ParsedLink[] {
  if (!content) return [];

  const withoutCode = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");

  const seen = new Set<string>();
  const links: ParsedLink[] = [];

  // `replace` as a scanner rather than `matchAll`: the build targets an older
  // lib where the iterator is not enumerable without downlevelIteration.
  withoutCode.replace(WIKILINK, (_whole, rawTarget: string, alias?: string) => {
    const target = rawTarget.trim();
    if (target) {
      const key = target.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ target, label: (alias ?? target).trim() || target });
      }
    }
    return "";
  });

  return links;
}

/** Titles are matched case-insensitively and whitespace-trimmed. */
export function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").trim().toLowerCase();
}

/**
 * Note lookup by title.
 *
 * Titles are not unique in the database, so a collision has to resolve to
 * something predictable: the oldest note wins, because that is the one the
 * link was most likely written against.
 */
export function indexByTitle(notes: Note[]): Map<string, Note> {
  const index = new Map<string, Note>();
  const sorted = [...notes].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  for (const note of sorted) {
    const key = normalizeTitle(note.title);
    if (!key || index.has(key)) continue;
    index.set(key, note);
  }
  return index;
}

export interface LinkGraph {
  /** note id → notes it links to. */
  outgoing: Map<string, Note[]>;
  /** note id → notes that link to it. */
  backlinks: Map<string, Note[]>;
  /** note id → link targets with no matching note. */
  unresolved: Map<string, string[]>;
}

export function buildLinkGraph(notes: Note[]): LinkGraph {
  const byTitle = indexByTitle(notes);
  const outgoing = new Map<string, Note[]>();
  const backlinks = new Map<string, Note[]>();
  const unresolved = new Map<string, string[]>();

  for (const note of notes) {
    const targets: Note[] = [];
    const missing: string[] = [];

    for (const link of extractLinks(note.content)) {
      const found = byTitle.get(normalizeTitle(link.target));
      // A note linking to itself is a typo, not a relationship, and showing it
      // in its own backlinks panel is just confusing.
      if (found && found.id !== note.id) {
        targets.push(found);
        backlinks.set(found.id, [...(backlinks.get(found.id) ?? []), note]);
      } else if (!found) {
        missing.push(link.target);
      }
    }

    if (targets.length > 0) outgoing.set(note.id, targets);
    if (missing.length > 0) unresolved.set(note.id, missing);
  }

  return { outgoing, backlinks, unresolved };
}

/**
 * Turn wikilinks into markdown links the renderer already understands.
 *
 * Resolved links point at the note; unresolved ones are left as plain text
 * rather than rendered as broken links — a link that goes nowhere invites you
 * to fix it, and there is nothing to fix until the note exists.
 */
export function linkifyContent(
  content: string | null | undefined,
  notes: Note[],
  hrefFor: (note: Note) => string,
): string {
  if (!content) return "";
  const byTitle = indexByTitle(notes);

  const replaceIn = (text: string) =>
    text.replace(WIKILINK, (_whole, rawTarget: string, alias?: string) => {
      const target = rawTarget.trim();
      const label = (alias ?? target).trim() || target;
      const found = byTitle.get(normalizeTitle(target));
      if (!found) return label;
      return `[${label}](${hrefFor(found)})`;
    });

  // Same reasoning as extractLinks: code is code. Split on fences so the
  // replacement never reaches inside one.
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((chunk) => (chunk.startsWith("```") ? chunk : replaceIn(chunk)))
    .join("");
}

/** Titles referenced by any note but not yet written — worth offering to create. */
export function missingNotes(notes: Note[]): string[] {
  const { unresolved } = buildLinkGraph(notes);
  const seen = new Map<string, string>();
  unresolved.forEach((targets) => {
    for (const target of targets) {
      const key = normalizeTitle(target);
      if (!seen.has(key)) seen.set(key, target);
    }
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
