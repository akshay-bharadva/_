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

function ProjectLink({ panel }: { panel: StatusPanelData }) {
  const href = safeLinkUrl(panel.latestProject.href);
  if (!panel.latestProject.name) return null;

  return (
    <div className="mt-s5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-sm text-muted-foreground">
        {panel.latestProject.name}
      </span>
      {href && panel.latestProject.linkText && (
        <a
          href={href}
          className="group inline-flex items-center gap-0.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {panel.latestProject.linkText}
          <ArrowUpRight className="size-3.5 transition-transform duration-200 ease-enter group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0" />
        </a>
      )}
    </div>
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
    <div className="mt-s5">
      <p className="t-micro">{panel.currently_exploring.title}</p>
      {variant === "chip" ? (
        <ul className="mt-s3 flex flex-wrap gap-2">
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
        <ul className="mt-s2 space-y-1">
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

/** Quiet by default: a single surface, generous padding, no ornament. */
function MinimalPanel({ panel }: { panel: StatusPanelData }) {
  return (
    <Surface className="p-s6">
      <p className="t-eyebrow">{panel.title}</p>
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
      <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/50 px-s4 py-s3">
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
      <div className="p-s5">
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
    <div className="grid grid-cols-2 gap-s3">
      <Surface className="col-span-2 p-s5">
        <p className="t-eyebrow">{panel.title}</p>
        <ProjectLink panel={panel} />
      </Surface>
      {items.slice(0, 4).map((item, index) => (
        <Surface
          key={item}
          className={cn(
            "flex items-center p-s4 text-sm font-medium",
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
