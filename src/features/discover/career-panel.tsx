"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, ExternalLink, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  fetchPostings,
  filterPostings,
  postedLabel,
  skillDemand,
  type Posting,
} from "./live";

/**
 * What the market is hiring for, and what it is asking you to know.
 *
 * The previous version was broken in a way that looked fine, which is the
 * worst kind. It searched Remotive, whose `search` parameter is silently
 * ignored: "react" and "data engineer" returned the identical seventeen jobs,
 * top result "Patient Care Specialist". Every listing was irrelevant and every
 * skill count was computed over that same unfiltered handful, so the bar chart
 * was noise in the shape of an answer.
 *
 * This fetches a real board — around 175 live postings in one request — and
 * filters in the browser, where the matching is at least inspectable. The two
 * halves answer different questions and use different samples on purpose:
 *
 * - **Skills** are counted across the *whole* board. That is a market signal.
 *   Counting them inside a six-result search gives every skill a count of one.
 * - **Roles** are the filtered subset, because that is what you asked for.
 *
 * Both say how many postings they are built from. A count without its sample
 * is not a fact.
 */
export function CareerPanel() {
  const [postings, setPostings] = useState<Posting[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchPostings();
      if (cancelled) return;

      if (result === null) {
        setState("failed");
        return;
      }
      setPostings(result);
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filtering is cheap and local, so it runs as you type — unlike the upstream
  // search it replaced, which cost a request and returned the same thing.
  const matches = useMemo(
    () => filterPostings(postings, query),
    [postings, query],
  );

  const market = useMemo(() => skillDemand(postings, 12), [postings]);
  const top = market.skills[0]?.count ?? 1;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="overflow-hidden rounded-surface bg-card shadow-e1">
        <header className="space-y-3 px-5 pb-3 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Open roles
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {state === "done"
                ? `${matches.length} of ${postings.length} postings`
                : "Arbeitnow"}
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              maxLength={80}
              placeholder="Filter by role, skill or company…"
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </header>

        {state === "loading" && (
          <p className="px-5 pb-4 text-sm text-muted-foreground">Reading…</p>
        )}

        {state === "failed" && (
          <p className="px-5 pb-4 text-sm text-muted-foreground">
            The job board did not answer just now.
          </p>
        )}

        {state === "done" && matches.length === 0 && (
          <p className="px-5 pb-4 text-sm text-muted-foreground">
            {/* Says which corpus came up empty, so the answer is actionable
                rather than just discouraging. */}
            Nothing on this board matches “{query}”. Try a single word, or a
            skill rather than a job title.
          </p>
        )}

        <ul>
          {matches.slice(0, 12).map((posting) => (
            <li key={posting.id}>
              <a
                href={posting.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-baseline gap-3 border-t border-border/60 px-5 py-2.5 transition-colors hover:bg-secondary/50"
              >
                <Briefcase
                  className="size-3.5 shrink-0 self-center text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate break-words text-sm text-foreground">
                    {posting.title}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {posting.company}
                    {posting.location && (
                      <>
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        {posting.location}
                      </>
                    )}
                    {posting.remote && (
                      <span className="rounded-control bg-chart-2/15 px-1.5 text-[10px] text-chart-2">
                        remote
                      </span>
                    )}
                    {posting.postedAt && ` · ${postedLabel(posting.postedAt)}`}
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

        {state === "done" && matches.length > 12 && (
          <p className="border-t border-border/60 px-5 py-2 text-[11px] text-muted-foreground">
            Showing 12 of {matches.length}. Narrow the filter to see the rest.
          </p>
        )}
      </section>

      <aside className="h-fit rounded-surface bg-card p-5 shadow-e1">
        <h2 className="text-sm font-semibold text-foreground">
          Most asked for
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {/* The sample, always. "TypeScript, 12" means nothing without it. */}
          Across all {market.sampled} postings on the board
        </p>

        {market.skills.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No skills tagged yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {market.skills.map((skill) => {
              // Highlights what you are already looking at, so the chart
              // answers "where does my thing sit" and not only "what is hot".
              const active =
                query.trim() !== "" &&
                skill.tag.includes(query.trim().toLowerCase());

              return (
                <div key={skill.tag} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuery(skill.tag)}
                    className={cn(
                      "w-24 shrink-0 truncate text-left text-xs transition-colors hover:text-foreground",
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {skill.tag}
                  </button>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500 ease-enter",
                        active ? "bg-chart-2" : "bg-primary",
                      )}
                      // Relative to the most-demanded skill, so the bars fill
                      // the width whatever the absolute counts are.
                      style={{ width: `${(skill.count / top) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {skill.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground">
          One board, weighted towards European and remote roles. A signal, not a
          census.
        </p>
      </aside>
    </div>
  );
}
