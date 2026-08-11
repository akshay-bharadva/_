"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Flame } from "lucide-react";
import { fetchTrending, type TrendingLink } from "./live";

/**
 * What is actually being read and shared right now.
 *
 * Mastodon's trending links: the articles being shared most across the network
 * over the last few days, ranked by share count. That ranking is the reason
 * this beats a publisher's front page — the order comes from readers rather
 * than an editor, which is what "trending" is supposed to mean.
 *
 * It replaced a Google News feed that needed a server-side CORS shim to reach
 * at all. This one sends `access-control-allow-origin: *`, so it works from
 * the browser with nothing to deploy.
 *
 * The limit worth knowing: it is one Mastodon instance, and it skews toward
 * technology, science and public policy. Said in the panel rather than left
 * for the reader to infer from a week of watching it.
 */
export function Headlines() {
  const [links, setLinks] = useState<TrendingLink[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchTrending();
      if (cancelled) return;

      if (result === null) {
        setState("failed");
        return;
      }
      setLinks(result);
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-surface bg-card shadow-e1">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Flame className="size-3.5 text-chart-3" aria-hidden />
          Trending
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Most shared · Mastodon
        </p>
      </header>

      {state === "loading" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">Reading…</p>
      )}

      {state === "failed" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Mastodon did not answer just now.
        </p>
      )}

      {state === "done" && links.length === 0 && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Nothing trending at the moment.
        </p>
      )}

      <ul>
        {links.map((link, index) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline gap-3 border-t border-border/60 px-5 py-3 transition-colors hover:bg-secondary/50"
            >
              {/* The rank is the information: this list is ordered by how many
                  people shared each piece, not by when it appeared. */}
              <span
                aria-hidden
                className={
                  index < 3
                    ? "w-4 shrink-0 text-xs font-semibold tabular-nums text-foreground"
                    : "w-4 shrink-0 text-xs tabular-nums text-muted-foreground"
                }
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm text-foreground">
                  {link.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    link.publisher,
                    link.shares !== null && `${link.shares} shares`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <ExternalLink
                className="size-3 shrink-0 self-center text-muted-foreground"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>

      {state === "done" && links.length > 0 && (
        <p className="border-t border-border/60 px-5 py-2 text-[11px] text-muted-foreground">
          One network&apos;s view — it leans towards technology, science and
          public policy.
        </p>
      )}
    </section>
  );
}
