/**
 * The model behind the branching timeline.
 *
 * ## What the data can and cannot say
 *
 * `portfolio_items` has `date_from` and `date_to` as free-text **TEXT**
 * columns, and no parent, branch or lane field of any kind. That bounds what
 * an honest git-style graph can claim:
 *
 * - **Chronology** — yes, for values this parser can read.
 * - **Parallel tracks** — yes. Two items whose ranges overlap *were* concurrent,
 *   and that is real branching in the only sense the data supports.
 * - **An open branch** — yes. A missing `date_to` means ongoing, matching what
 *   `ItemDates` already renders as "— Present". The two must agree, or the
 *   graph would draw a line ending where the label says it continues.
 * - **A merge** — **no.** A true merge is "X was merged into Y", which needs an
 *   explicit parent pointer. Inferring one from "this ended around when that
 *   began" would invent a relationship the owner never stated. So a lane is
 *   drawn *rejoining the trunk* when it ends — which is true, the concurrency
 *   stopped — and nothing claims causation.
 *
 * Adding `depends_on` to `portfolio_items` is the right change if real merges
 * are wanted later. It is deliberately not made on speculation.
 *
 * ## Why the dates are only ever compared, never displayed
 *
 * The column is free text, so a value can be `2023`, `Jan 2023`, `2023-01-15`
 * or `Summer 2022`. Anything this parser cannot read yields **null** rather
 * than a guess — a timeline that silently orders "Summer 2022" as the epoch is
 * worse than one that admits it does not know. Undated items keep their given
 * order and sit on the trunk, claiming nothing.
 *
 * Parsed values are built with `Date.UTC` and used **only** for comparison.
 * Rendering keeps the author's own strings, so the local-versus-UTC trap this
 * project has hit four times cannot apply here: no parsed value is ever
 * formatted back out.
 */

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Words an author writes to mean "still going". */
const ONGOING_WORDS = new Set([
  "present",
  "now",
  "current",
  "ongoing",
  "today",
]);

export function isOngoingWord(value?: string | null): boolean {
  return ONGOING_WORDS.has((value ?? "").trim().toLowerCase());
}

/**
 * A free-text date as a comparable number, or null when it cannot be read.
 *
 * Handles the forms an author actually types: a bare year, `YYYY-MM`,
 * `YYYY-MM-DD`, `MM/YYYY`, and `Mon YYYY` / `Month YYYY` in either order.
 * Everything else — "Summer 2022", "the pandemic" — is null on purpose.
 */
export function parseTimelinePoint(value?: string | null): number | null {
  const raw = (value ?? "").trim();
  if (!raw || isOngoingWord(raw)) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (iso) {
    return Date.UTC(+iso[1], Math.min(+iso[2], 12) - 1, iso[3] ? +iso[3] : 1);
  }

  const slash = raw.match(/^(\d{1,2})[/](\d{4})$/);
  if (slash) return Date.UTC(+slash[2], Math.min(+slash[1], 12) - 1, 1);

  const named = raw.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (month !== -1) return Date.UTC(+named[2], month, 1);
  }

  const namedAfter = raw.match(/^(\d{4})\s+([A-Za-z]{3,})\.?$/);
  if (namedAfter) {
    const month = MONTHS.indexOf(namedAfter[2].slice(0, 3).toLowerCase());
    if (month !== -1) return Date.UTC(+namedAfter[1], month, 1);
  }

  const year = raw.match(/^(\d{4})$/);
  if (year) return Date.UTC(+year[1], 0, 1);

  return null;
}

export interface TimelineSpan {
  start: number;
  /** `now` for an ongoing item, so an open branch overlaps everything current. */
  end: number;
  ongoing: boolean;
}

export interface TimelineRow<T> {
  item: T;
  /** 0 is the trunk. */
  lane: number;
  /** Null when neither date could be read; such rows stay on the trunk. */
  span: TimelineSpan | null;
}

export interface LaneSpan {
  lane: number;
  /** Topmost (newest) row index the lane reaches. */
  firstRow: number;
  /** Bottommost (oldest) row index the lane reaches. */
  lastRow: number;
}

export interface TimelineGraph<T> {
  rows: TimelineRow<T>[];
  laneCount: number;
  laneSpans: LaneSpan[];
}

export interface DatedFields {
  date_from?: string | null;
  date_to?: string | null;
}

function spanOf(item: DatedFields, now: number): TimelineSpan | null {
  const start = parseTimelinePoint(item.date_from);
  const rawEnd = parseTimelinePoint(item.date_to);

  if (start === null && rawEnd === null) return null;

  // A missing or unreadable end means ongoing — the same reading `ItemDates`
  // gives when it prints "— Present". If these two disagreed, the graph would
  // stop a line where the label says the work continues.
  const ongoing = rawEnd === null;
  const from = start ?? rawEnd!;
  const end = ongoing ? Math.max(now, from) : Math.max(rawEnd!, from);

  return { start: from, end, ongoing };
}

/** Half-open overlap: touching at a boundary is not an overlap. */
function overlaps(a: TimelineSpan, b: TimelineSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Order rows and give each a lane.
 *
 * Rows read newest first, which is how a commit log reads. Dated items sort by
 * start descending; undated items cannot be placed on any defensible date, so
 * they keep their given order and follow — appended rather than interleaved,
 * because there is no position for them that would be true.
 *
 * Lanes are greedy first-fit, the same shape the calendar uses for overlapping
 * events: reuse the leftmost lane whose occupant does not overlap. That is
 * what makes consecutive items stack in the trunk instead of marching
 * rightwards, so a lane opening is a real signal that two things ran at once.
 *
 * The calendar's own implementation is deliberately *not* reused: it clips to
 * a day first and normalises a width across each overlap cluster so every
 * event in a cluster is the same size, neither of which a timeline wants.
 * Sharing the two would mean one of them carrying a flag for the other.
 */
export function buildTimeline<T extends DatedFields>(
  items: T[],
  now: number = Date.now(),
): TimelineGraph<T> {
  const dated: { item: T; span: TimelineSpan }[] = [];
  const undated: T[] = [];

  for (const item of items) {
    const span = spanOf(item, now);
    if (span) dated.push({ item, span });
    else undated.push(item);
  }

  dated.sort((a, b) => b.span.start - a.span.start || b.span.end - a.span.end);

  const laneOccupants: TimelineSpan[] = [];
  const rows: TimelineRow<T>[] = [];

  for (const entry of dated) {
    let lane = laneOccupants.findIndex(
      (occupant) => !overlaps(occupant, entry.span),
    );
    if (lane === -1) {
      lane = laneOccupants.length;
      laneOccupants.push(entry.span);
    } else {
      laneOccupants[lane] = entry.span;
    }
    rows.push({ item: entry.item, lane, span: entry.span });
  }

  for (const item of undated) {
    rows.push({ item, lane: 0, span: null });
  }

  const spansByLane = new Map<number, LaneSpan>();
  rows.forEach((row, index) => {
    const existing = spansByLane.get(row.lane);
    if (existing) existing.lastRow = index;
    else
      spansByLane.set(row.lane, {
        lane: row.lane,
        firstRow: index,
        lastRow: index,
      });
  });

  return {
    rows,
    laneCount: Math.max(laneOccupants.length, rows.length > 0 ? 1 : 0),
    laneSpans: Array.from(spansByLane.values()).sort((a, b) => a.lane - b.lane),
  };
}

export interface RailState {
  lane: number;
  /** A line continues upward out of this row. */
  above: boolean;
  /** A line continues downward out of this row. */
  below: boolean;
  /** This row's own node sits in this lane. */
  node: boolean;
  /**
   * The lane opens here — drawn as a branch leaving the trunk rather than a
   * line arriving from off-screen.
   */
  opens: boolean;
  /** The lane closes here, rejoining the trunk. */
  closes: boolean;
}

/**
 * What to draw in each lane column for one row.
 *
 * Kept separate from the component because it is the part with rules in it.
 * The renderer only turns booleans into spans.
 */
export function railsForRow(
  rowIndex: number,
  rowLane: number,
  laneSpans: LaneSpan[],
  laneCount: number,
): RailState[] {
  const rails: RailState[] = [];

  for (let lane = 0; lane < laneCount; lane++) {
    const span = laneSpans.find((candidate) => candidate.lane === lane);
    if (!span) {
      rails.push({
        lane,
        above: false,
        below: false,
        node: false,
        opens: false,
        closes: false,
      });
      continue;
    }

    const inside = rowIndex >= span.firstRow && rowIndex <= span.lastRow;
    rails.push({
      lane,
      above: inside && rowIndex > span.firstRow,
      below: inside && rowIndex < span.lastRow,
      node: rowLane === lane,
      opens: lane > 0 && rowIndex === span.firstRow,
      closes: lane > 0 && rowIndex === span.lastRow,
    });
  }

  return rails;
}
