/**
 * The v3 Surface rules, as functions over a Tailwind class list.
 *
 * These live in their own module rather than inline in the test because the
 * first two versions of them, written inline, reported the codebase clean
 * while a seeded violation sat in it. A rule you cannot unit-test is a rule you
 * are trusting rather than checking — and the whole point of these is to catch
 * what a human reading a diff would not.
 */

export interface ClassToken {
  /** The utility itself, with any variant prefix removed. */
  base: string;
  /** `hover`, `focus-within`, `sm` … or null for an unprefixed utility. */
  variant: string | null;
}

export function tokenize(list: string): ClassToken[] {
  return list
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const at = token.lastIndexOf(":");
      return at === -1
        ? { base: token, variant: null }
        : { base: token.slice(at + 1), variant: token.slice(0, at) };
    });
}

/**
 * A border *width*, unprefixed.
 *
 * The distinction that matters: `border` and `border-2` set a width,
 * `border-border` and `border-primary/50` only set a colour. A hover colour on
 * an element with no width renders nothing at all.
 */
export function hasBorderWidth(list: string): boolean {
  return tokenize(list).some(
    ({ base, variant }) =>
      variant === null && /^border(-[trbl])?(-\d+)?$/.test(base),
  );
}

/** An unprefixed elevation token. */
export function hasElevation(list: string): boolean {
  return tokenize(list).some(
    ({ base, variant }) => variant === null && /^shadow-e[123]$/.test(base),
  );
}

/**
 * A surface is a fill plus an elevation — never both a border and an
 * elevation. Drawing the edge twice is the v2 habit the Surface system
 * replaced.
 *
 * A border swapped *for* an elevation on hover is the correct pattern, so an
 * element that clears its border on hover or focus is allowed.
 */
export function bordersAndElevates(list: string): boolean {
  if (!hasBorderWidth(list) || !hasElevation(list)) return false;

  const swaps = tokenize(list).some(
    ({ base, variant }) =>
      base === "border-transparent" &&
      (variant === "hover" || variant === "focus-within"),
  );

  return !swaps;
}

/**
 * A hover border colour on an element that has no border width — a hover state
 * that renders nothing, on a surface that looks interactive.
 */
export function hasDeadHoverBorder(list: string): boolean {
  const hoverBorderColour = tokenize(list).some(
    ({ base, variant }) =>
      variant === "hover" &&
      base.startsWith("border-") &&
      base !== "border-transparent",
  );

  return hoverBorderColour && !hasBorderWidth(list);
}

/** Every `className="…"` literal in a source file. */
export function classLists(source: string): string[] {
  const out: string[] = [];
  const pattern = /className=(?:"|\{")([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) out.push(match[1]);
  return out;
}
