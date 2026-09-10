"use client";

import {
  Children,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "framer-motion";

/**
 * The motion vocabulary every public section layout shares.
 *
 * Three moves, used everywhere, so the site has one way of arriving rather
 * than nineteen: **reveal** (a block eases up, or in from its side), **stagger**
 * (a group arrives in sequence) and **count up** (a figure counts to its
 * value). All three run once, on the house curve, and are absent under
 * reduced motion — the content is simply there, never waiting on an observer
 * that might not fire.
 */

/** The house curve — the same one as `--m-enter`. */
export const EASE = [0.32, 0.72, 0, 1] as const;

const VIEWPORT = { once: true, margin: "0px 0px -10% 0px" } as const;

const TAGS = {
  div: motion.div,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  article: motion.article,
  figure: motion.figure,
};
type Tag = keyof typeof TAGS;

interface BlockProps {
  as?: Tag;
  className?: string;
  children?: ReactNode;
}

/** A block that eases into place once, from below or from one side. */
export function Reveal({
  as = "div",
  from = "up",
  delay = 0,
  className,
  children,
}: BlockProps & { from?: "up" | "left" | "right"; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Plain = as as "div";
    return <Plain className={className}>{children}</Plain>;
  }

  const Comp = TAGS[as] as typeof motion.div;
  const offset =
    from === "left" ? { x: -24 } : from === "right" ? { x: 24 } : { y: 24 };

  return (
    <Comp
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </Comp>
  );
}

const ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * A group whose children arrive in sequence.
 *
 * The step shrinks as the group grows, so the whole sequence never takes
 * longer than about 0.7s — forty tool chips at a fixed 70ms each would still be
 * arriving three seconds after the reader got there.
 */
export function Stagger({
  as = "div",
  step = 0.07,
  className,
  children,
}: BlockProps & { step?: number }) {
  const reduce = useReducedMotion();
  const count = Children.count(children);

  if (reduce) {
    const Plain = as as "div";
    return <Plain className={className}>{children}</Plain>;
  }

  const Comp = TAGS[as] as typeof motion.div;
  const stagger = Math.min(step, 0.7 / Math.max(count, 1));

  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={VIEWPORT}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </Comp>
  );
}

/** One member of a `Stagger`. */
export function StaggerItem({ as = "div", className, children }: BlockProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Plain = as as "div";
    return <Plain className={className}>{children}</Plain>;
  }
  const Comp = TAGS[as] as typeof motion.div;
  return (
    <Comp className={className} variants={ITEM}>
      {children}
    </Comp>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Count up
 * ──────────────────────────────────────────────────────────────── */

export interface Stat {
  prefix: string;
  number: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

/** Split "$1,200+" into "$", 1200 and "+". Null when there is no number. */
export function parseStat(value: string): Stat | null {
  const match = value.trim().match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/);
  if (!match) return null;

  const [, prefix, digits, suffix] = match;
  const plain = digits.replace(/,/g, "");
  const number = Number(plain);
  if (!Number.isFinite(number)) return null;

  return {
    prefix,
    number,
    decimals: plain.includes(".") ? plain.split(".")[1].length : 0,
    grouped: digits.includes(","),
    suffix,
  };
}

/**
 * A stat worth animating, or null.
 *
 * Counting is only honest for a quantity. A year ("2019") counting up from
 * zero is absurd, a ratio ("24/7", "4.9/5") would count its first half and
 * then snap, and a phrase ("Since 2019", "Top 5") is words with a number in
 * them. Those render as written.
 */
export function animatableStat(value: string): Stat | null {
  const stat = parseStat(value);
  if (!stat) return null;
  if (/[A-Za-z0-9]/.test(stat.prefix)) return null;
  if (/\d/.test(stat.suffix)) return null;
  if (!stat.prefix && !stat.suffix && /^(19|20)\d{2}$/.test(value.trim())) {
    return null;
  }
  return stat;
}

export function formatStat(stat: Stat, n: number): string {
  const body = stat.grouped
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: stat.decimals,
        maximumFractionDigits: stat.decimals,
      })
    : n.toFixed(stat.decimals);
  return `${stat.prefix}${body}${stat.suffix}`;
}

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A figure that counts up to its value when it comes into view.
 *
 * The server renders the real value, so a visitor without JavaScript — and a
 * crawler — reads the number, not a zero. It resets to zero before first
 * paint, counts when seen, and always lands on the author's exact string
 * ("01" stays "01"). Screen readers get the value once, never the frames.
 */
export function CountUp({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const stat = useMemo(() => animatableStat(value), [value]);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, VIEWPORT);

  const count = useMotionValue(stat?.number ?? 0);
  const display = useTransform(count, (n) =>
    !stat || n === stat.number ? value : formatStat(stat, n),
  );

  useIsoLayoutEffect(() => {
    if (stat && !reduce) count.set(0);
  }, [stat, reduce, count]);

  useEffect(() => {
    if (!stat || reduce || !inView) return;
    const controls = animate(count, stat.number, { duration: 1.4, ease: EASE });
    return () => controls.stop();
  }, [inView, stat, reduce, count]);

  if (!stat || reduce) return <span className={className}>{value}</span>;

  return (
    <span className={className}>
      <motion.span ref={ref} aria-hidden data-count-up>
        {display}
      </motion.span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
