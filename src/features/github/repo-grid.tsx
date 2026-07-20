"use client";

import { useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { GitFork, Star } from "lucide-react";
import {
  useGetGitHubReposQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import type { GitHubRepo } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

function RepoCard({ repo }: { repo: GitHubRepo }) {
  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <p className="truncate font-mono text-sm font-medium group-hover:text-primary">
        {repo.name}
      </p>
      <p className="mt-1.5 line-clamp-2 grow text-sm text-muted-foreground">
        {repo.description ?? "No description"}
      </p>
      <div className="mt-3 flex items-center gap-4 font-mono text-xs text-muted-foreground">
        {repo.language && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="size-3" aria-hidden />
          {repo.stargazers_count}
        </span>
        <span className="flex items-center gap-1">
          <GitFork className="size-3" aria-hidden />
          {repo.forks_count}
        </span>
      </div>
    </a>
  );
}

/** Live GitHub repositories grid driven by profile_data.github_projects_config. */
export function RepoGrid() {
  const { data: identity, isLoading: isIdentityLoading } =
    useGetSiteIdentityQuery();
  const config = identity?.profile_data.github_projects_config;

  const { data: repos, isLoading, isError } = useGetGitHubReposQuery(
    config?.show && config.username
      ? {
          username: config.username,
          sort_by: config.sort_by,
          projects_per_page: config.projects_per_page,
          page: 1,
          exclude_forks: config.exclude_forks,
          exclude_archived: config.exclude_archived,
          exclude_profile_repo: config.exclude_profile_repo,
          min_stars: config.min_stars,
        }
      : skipToken,
  );

  const perPage = config?.projects_per_page ?? 6;
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const shown = visibleCount ?? perPage;

  if (isLoading || isIdentityLoading || !identity) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: Math.min(perPage, 6) }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!config?.show || !config.username) return null;

  if (isError || !repos?.length) {
    return (
      <p className="status-line">
        <span aria-hidden>▲ </span>
        Could not load repositories from GitHub right now.
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {repos.slice(0, shown).map((repo) => (
          <RepoCard key={repo.id} repo={repo} />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {shown < repos.length && (
          <button
            type="button"
            onClick={() => setVisibleCount(shown + perPage)}
            className="rounded-md border px-4 py-2 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary"
          >
            Load more ({repos.length - shown})
          </button>
        )}
        <a
          href={`https://github.com/${config.username}?tab=repositories`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-primary underline-offset-4 hover:underline"
        >
          View all on GitHub →
        </a>
      </div>
    </div>
  );
}
