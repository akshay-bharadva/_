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

/**
 * Tailwind's own radius scale, which `--r-surface` and `--r-control` replaced.
 *
 * The v3 rule is that a panel takes the surface radius and a control takes the
 * control radius — one decision, applied everywhere, rather than a per-element
 * guess between six values that all look nearly the same.
 */
export function usesRawRadius(list: string): boolean {
  return tokenize(list).some(({ base }) =>
    /^rounded-(lg|xl|2xl|3xl)$/.test(base),
  );
}

/**
 * Whether a string literal is a Tailwind class list.
 *
 * Needed because half the class lists in this codebase never appear in a
 * `className="…"` attribute — they are arguments to `cn()`, and a gate that
 * only reads the attribute is blind to them. A border-plus-elevation
 * violation was sitting in one such call when this was written.
 *
 * The test is deliberately conservative: every token must look like a utility,
 * and at least one must carry a hyphen or a variant colon. Prose fails on the
 * first capital letter or full stop, and a bare phrase like "the quick brown
 * fox" fails for having no hyphenated token.
 */
export function looksLikeClassList(value: string): boolean {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;

  const utilityish = /^[a-z0-9][a-z0-9:._/[\]%()#!-]*$/;
  if (!parts.every((part) => utilityish.test(part))) return false;

  return parts.some((part) => part.includes("-") || part.includes(":"));
}

/**
 * The complete class list of an element: `className="…"` attributes only.
 *
 * Used by rules that need to see everything applied to one element. The
 * dead-hover rule is the example — a `cn()` argument commonly carries the
 * hover colour while the border width sits in a sibling argument, so judging a
 * fragment on its own reports a working hover as broken.
 */
export function classLists(source: string): string[] {
  const out: string[] = [];
  const pattern = /className=(?:"|\{")([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) out.push(match[1]);
  return out;
}

/**
 * Every class string in a file, including the fragments inside `cn()`.
 *
 * Used by rules that are violated by a fragment regardless of its siblings.
 * Half the class lists here never appear in a `className` attribute, and a
 * border-plus-elevation violation was sitting in one such call when this was
 * written — invisible to a gate that only read the attribute.
 */
export function classFragments(source: string): string[] {
  const out = classLists(source);

  // Length-capped rather than newline-excluded: a class list wrapped by the
  // formatter spans lines, and the check below splits on whitespace anyway.
  // The cap keeps a large blob of prose out of the loop.
  const literal = /"([^"]{4,400})"/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(source)) !== null) {
    const value = match[1];
    if (looksLikeClassList(value) && !out.includes(value)) out.push(value);
  }

  return out;
}
