"use client";

import { useEffect, useState } from "react";
import type { SiteContent } from "@/types";

type StatusPanelData = SiteContent["profile_data"]["status_panel"];

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

function AvailabilityDot() {
  return (
    <span aria-hidden className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function MinimalPanel({ panel }: { panel: StatusPanelData }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="section-label">{panel.title}</p>
      <p className="mt-3 flex items-center gap-2.5 text-sm font-medium">
        <AvailabilityDot />
        {panel.availability}
      </p>
      {panel.currently_exploring.items.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-xs text-muted-foreground">
            {panel.currently_exploring.title}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {panel.currently_exploring.items.map((item) => (
              <li
                key={item}
                className="rounded border bg-secondary/60 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {panel.latestProject.name && (
        <p className="mt-4 border-t border-dashed pt-3 text-sm">
          <span className="text-muted-foreground">
            {panel.latestProject.name}
          </span>{" "}
          <a
            href={panel.latestProject.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary underline-offset-4 hover:underline"
          >
            {panel.latestProject.linkText} →
          </a>
        </p>
      )}
    </div>
  );
}

function TerminalPanel({ panel }: { panel: StatusPanelData }) {
  const clock = useClock();
  return (
    <div className="overflow-hidden rounded-lg border bg-card font-mono text-xs">
      <div className="flex items-center gap-1.5 border-b bg-secondary/60 px-3 py-2">
        <span aria-hidden className="size-2.5 rounded-full bg-destructive/70" />
        <span
          aria-hidden
          className="size-2.5 rounded-full bg-muted-foreground/40"
        />
        <span aria-hidden className="size-2.5 rounded-full bg-primary/70" />
        <span className="ml-2 text-muted-foreground">status — zsh</span>
      </div>
      <div className="space-y-2 p-4">
        <p>
          <span className="text-primary">$</span> status --now
        </p>
        <p className="flex items-center gap-2 pl-4 text-muted-foreground">
          <AvailabilityDot />
          {panel.availability}
        </p>
        {panel.currently_exploring.items.length > 0 && (
          <>
            <p>
              <span className="text-primary">$</span>{" "}
              {panel.currently_exploring.title.toLowerCase()} --list
            </p>
            {panel.currently_exploring.items.map((item) => (
              <p key={item} className="pl-4 text-muted-foreground">
                · {item}
              </p>
            ))}
          </>
        )}
        {panel.latestProject.name && (
          <p>
            <span className="text-primary">$</span> latest →{" "}
            <a
              href={panel.latestProject.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {panel.latestProject.name}
            </a>
          </p>
        )}
        <p aria-hidden className="pt-1 text-muted-foreground/60">
          {clock && `⏱ ${clock} — session active`}
          <span className="ml-1 animate-caret-blink">▌</span>
        </p>
      </div>
    </div>
  );
}

function BentoPanel({ panel }: { panel: StatusPanelData }) {
  const clock = useClock();
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="col-span-2 flex items-center gap-2.5 rounded-lg border bg-card p-4 text-sm font-medium">
        <AvailabilityDot />
        {panel.availability}
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="section-label">{panel.currently_exploring.title}</p>
        <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
          {panel.currently_exploring.items.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-4">
        <p aria-hidden className="font-mono text-lg tabular-nums text-primary">
          {clock || "—"}
        </p>
        {panel.latestProject.name && (
          <a
            href={panel.latestProject.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary underline-offset-4 hover:underline"
          >
            {panel.latestProject.linkText} →
          </a>
        )}
      </div>
    </div>
  );
}

export function StatusPanel({ panel }: { panel: StatusPanelData }) {
  if (!panel.show) return null;
  switch (panel.design ?? "minimal") {
    case "terminal":
      return <TerminalPanel panel={panel} />;
    case "bento":
      return <BentoPanel panel={panel} />;
    default:
      return <MinimalPanel panel={panel} />;
  }
}
