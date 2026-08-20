"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Eye, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  compactNumber,
  fetchJson,
  minimumScore,
  mostReadUrl,
  newReposUrl,
  parseMostRead,
  parseRepos,
  parseStories,
  topStoriesUrl,
  type ReadArticle,
  type Repo,
  type Story,
  type Window,
} from "./sources";

/**
 * The digest panels: what happened, in the window you asked about.
 *
 * Each panel owns its own fetch rather than the page orchestrating all three.
 * They are independent services with independent failure modes, and one being
 * down should cost you that panel and nothing else — the same rule the
 * dashboard's batch had to learn the hard way.
 */

/** Shared shell, so three panels cannot drift into three layouts. */
function Panel({
  title,
  note,
  state,
  empty,
  children,
}: {
  title: string;
  note?: string;
  state: "loading" | "done" | "failed";
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-surface bg-card shadow-e1">
      <header className="px-5 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </header>

      {state === "loading" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">Reading…</p>
      )}

      {state === "failed" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          {/* Named rather than "an error occurred": knowing which service is
              quiet is the difference between waiting and investigating. */}
          {title} did not answer. The service may be down, or the request may
          have been blocked.
        </p>
      )}

      {state === "done" && empty && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Nothing cleared the bar in this window.
        </p>
      )}

      {children}
    </section>
  );
}

function Row({
  href,
  title,
  meta,
  badge,
}: {
  href: string;
  title: string;
  meta?: string;
  badge?: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-baseline gap-3 border-t border-border/60 px-5 py-2.5 transition-colors hover:bg-secondary/50"
      >
        {badge}
        {/* min-w-0 so a long headline truncates rather than pushing the icon
            out of the panel; break-words so one unbroken token still wraps. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate break-words text-sm text-foreground">
            {title}
          </span>
          {meta && (
            <span className="block text-xs text-muted-foreground">{meta}</span>
          )}
        </span>
        <ExternalLink
          className="size-3 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </a>
    </li>
  );
}

/** Rank, not decoration: the order is the information. */
function Rank({ index }: { index: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "w-5 shrink-0 text-xs tabular-nums",
        index < 3 ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      {index + 1}
    </span>
  );
}

export function TopStories({ window }: { window: Window }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    void (async () => {
      const body = await fetchJson(topStoriesUrl(window));
      if (cancelled) return;
      if (body === null) {
        setState("failed");
        return;
      }
      setStories(parseStories(body, "hackernews"));
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [window]);

  return (
    <Panel
      title="Most discussed"
      note={`Hacker News, above ${minimumScore(window)} points`}
      state={state}
      empty={stories.length === 0}
    >
      <ul>
        {stories.map((story, index) => (
          <Row
            key={story.id}
            href={story.url}
            title={story.title}
            badge={<Rank index={index} />}
            meta={[story.host, story.score && `${story.score} points`]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </ul>
    </Panel>
  );
}

export function MostRead() {
  const [articles, setArticles] = useState<ReadArticle[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await fetchJson(mostReadUrl());
      if (cancelled) return;
      if (body === null) {
        setState("failed");
        return;
      }
      setArticles(parseMostRead(body, 6));
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel
      title="What the world looked up"
      /* Stated, not implied: this feed is published per day, so it does not
         follow the window control. Silently ignoring the selection would be
         the worse choice. */
      note="Wikipedia, yesterday — this one is always a single day"
      state={state}
      empty={articles.length === 0}
    >
      <ul>
        {articles.map((article, index) => (
          <Row
            key={article.title}
            href={article.url}
            title={article.title}
            badge={<Rank index={index} />}
            meta={`${compactNumber(article.views)} views`}
          />
        ))}
      </ul>
    </Panel>
  );
}

export function NewRepos({ window }: { window: Window }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    void (async () => {
      const body = await fetchJson(newReposUrl(window));
      if (cancelled) return;
      if (body === null) {
        setState("failed");
        return;
      }
      setRepos(parseRepos(body));
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [window]);

  return (
    <Panel
      title="New in software"
      note="Repositories created in this window, by stars"
      state={state}
      empty={repos.length === 0}
    >
      <ul>
        {repos.map((repo) => (
          <Row
            key={repo.id}
            href={repo.url}
            title={repo.name}
            badge={
              <span className="flex w-14 shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                <Star className="size-3" aria-hidden />
                {compactNumber(repo.stars)}
              </span>
            }
            meta={[repo.language, repo.description].filter(Boolean).join(" · ")}
          />
        ))}
      </ul>
    </Panel>
  );
}

export { Eye };
