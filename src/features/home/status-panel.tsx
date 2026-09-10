"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { SiteContent } from "@/types";
import { Surface } from "@/components/layout/surface";
import { safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";

type StatusPanelData = SiteContent["profile_data"]["status_panel"];

/**
 * The three panel designs are owner-selectable settings, so all three survive
 * the v3 rebuild — including `terminal`, whose whole point is that it looks
 * like a terminal. What changed is everything around them: each is now a
 * floating surface with the v3 shape and type roles rather than a bordered box
 * with monospace section labels.
 */

function useClock(): string {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The latest project, as one row: what it is, and the way in. Linked rows are
 * a single target rather than a name with a small link beside it.
 */
function ProjectLink({ panel }: { panel: StatusPanelData }) {
  const href = safeLinkUrl(panel.latestProject.href);
  if (!panel.latestProject.name) return null;

  const body = (
    <>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">Latest</span>
        <span className="block truncate text-sm font-semibold transition-colors group-hover:text-primary">
          {panel.latestProject.name}
        </span>
      </span>
      {href && (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {panel.latestProject.linkText}
          <ArrowUpRight
            aria-hidden
            className="size-3.5 transition-transform duration-200 ease-enter group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      )}
    </>
  );

  const row =
    "mt-6 flex items-center gap-3 rounded-control bg-secondary/60 px-4 py-3";

  return href ? (
    <a
      href={href}
      className={cn(
        "group transition-colors duration-200 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        row,
      )}
    >
      {body}
    </a>
  ) : (
    <div className={row}>{body}</div>
  );
}

function ExploringList({
  panel,
  variant = "chip",
}: {
  panel: StatusPanelData;
  variant?: "chip" | "line";
}) {
  const items = panel.currently_exploring.items;
  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="t-micro">{panel.currently_exploring.title}</p>
      {variant === "chip" ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-full bg-secondary px-3 py-1 text-micro text-secondary-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item} className="font-mono text-sm text-foreground">
              <span className="text-primary">&rsaquo;</span> {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Quiet by default: one raised surface, a live title, the facts beneath. */
function MinimalPanel({ panel }: { panel: StatusPanelData }) {
  return (
    <Surface elevation={2} className="p-7 sm:p-8">
      <p className="t-eyebrow flex items-center gap-2">
        <span aria-hidden className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60 motion-reduce:hidden" />
          <span className="relative size-1.5 rounded-full bg-primary" />
        </span>
        {panel.title}
      </p>
      <ExploringList panel={panel} />
      <ProjectLink panel={panel} />
    </Surface>
  );
}

/**
 * The deliberately technical option. Monospace is legitimate here — the panel
 * is imitating a terminal, which is the setting's entire purpose. It is not
 * used as a decorative metadata voice anywhere else in v3.
 */
function TerminalPanel({ panel }: { panel: StatusPanelData }) {
  const now = useClock();
  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/50 px-4 py-3">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-chart-3/60" />
          <span className="size-2.5 rounded-full bg-chart-2/60" />
        </span>
        <p className="ml-1 font-mono text-micro text-muted-foreground">
          {panel.title}
        </p>
        <p className="ml-auto font-mono text-micro tabular-nums text-muted-foreground">
          {now}
        </p>
      </div>
      <div className="p-6">
        <ExploringList panel={panel} variant="line" />
        <ProjectLink panel={panel} />
      </div>
    </Surface>
  );
}

/** Modular: the panel splits into tiles that each carry one fact. */
function BentoPanel({ panel }: { panel: StatusPanelData }) {
  const items = panel.currently_exploring.items;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Surface className="col-span-2 p-6">
        <p className="t-eyebrow">{panel.title}</p>
        <ProjectLink panel={panel} />
      </Surface>
      {items.slice(0, 4).map((item, index) => (
        <Surface
          key={item}
          className={cn(
            "flex min-h-20 items-end p-4 text-sm font-semibold",
            // The first tile carries the colour, so the grid has one anchor.
            index === 0 && "bg-primary text-primary-foreground",
            // A lone trailing tile spans rather than leaving a gap.
            items.length % 2 === 1 &&
              index === items.length - 1 &&
              "col-span-2",
          )}
        >
          {item}
        </Surface>
      ))}
    </div>
  );
}

export function StatusPanel({ panel }: { panel: StatusPanelData }) {
  if (!panel.show) return null;
  if (panel.design === "terminal") return <TerminalPanel panel={panel} />;
  if (panel.design === "bento") return <BentoPanel panel={panel} />;
  return <MinimalPanel panel={panel} />;
}
