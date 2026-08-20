"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  cleanHeadline,
  fetchNews,
  hasLiveData,
  NEWS_TOPICS,
  type Article,
  type NewsTopic,
} from "./live";
import { postedLabel } from "./career";

/**
 * News by category, or by whatever you type.
 *
 * Hacker News answers the technology question well and every other one badly,
 * which is why this exists beside it. Google News covers the genres a person
 * actually reads across — world, business, sport, culture — and ranks by
 * editorial prominence rather than by one community's votes.
 *
 * It needs the market-data edge function, because Google's RSS sends no CORS
 * header. When that is not deployed the panel says so plainly instead of
 * sitting empty, since an empty panel reads as a page that failed.
 */
export function Headlines() {
  const [topic, setTopic] = useState<NewsTopic>("top");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed" | "off">(
    hasLiveData() ? "loading" : "off",
  );

  useEffect(() => {
    if (!hasLiveData()) {
      setState("off");
      return;
    }

    let cancelled = false;
    setState("loading");

    void (async () => {
      const result = await fetchNews(topic, search, 10);
      if (cancelled) return;

      if (result === null) {
        setState("failed");
        return;
      }
      setArticles(result);
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [topic, search]);

  return (
    <section className="overflow-hidden rounded-surface bg-card shadow-e1">
      <header className="space-y-3 px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Headlines</h2>
          <p className="text-[11px] text-muted-foreground">
            Google News · Canada
          </p>
        </div>

        {/* Categories first: picking one is the common case, and typing a
            search is the exception that overrides it. */}
        <div
          role="radiogroup"
          aria-label="Category"
          className="flex flex-wrap gap-1"
        >
          {NEWS_TOPICS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === topic && !search}
              onClick={() => {
                setTopic(option.id);
                setQuery("");
                setSearch("");
              }}
              className={cn(
                "rounded-control px-2.5 py-1 text-xs transition-colors",
                option.id === topic && !search
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            maxLength={100}
            placeholder="Or search a company, person, anything…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Applied on Enter rather than per keystroke: each change is an
              // upstream request, and one per letter is abuse of a free feed.
              if (event.key === "Enter") setSearch(query.trim());
              if (event.key === "Escape") {
                setQuery("");
                setSearch("");
              }
            }}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </header>

      {state === "off" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Headlines need the <code className="text-xs">market-data</code>{" "}
          function deployed — Google News sends no CORS header, so a browser
          cannot read it directly.
        </p>
      )}

      {state === "loading" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">Reading…</p>
      )}

      {state === "failed" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Google News did not answer just now.
        </p>
      )}

      {state === "done" && articles.length === 0 && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Nothing found for that. Try a broader search.
        </p>
      )}

      <ul>
        {articles.map((article) => (
          <li key={article.url}>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline gap-3 border-t border-border/60 px-5 py-2.5 transition-colors hover:bg-secondary/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate break-words text-sm text-foreground">
                  {/* Google appends " - Publisher" to most titles, and the
                      publisher is already shown below. */}
                  {cleanHeadline(article.title, article.source)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    article.source,
                    article.publishedAt && postedLabel(article.publishedAt),
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
    </section>
  );
}
