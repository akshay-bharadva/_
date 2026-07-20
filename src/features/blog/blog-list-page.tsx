"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, Eye, Search } from "lucide-react";
import { useGetPublishedBlogPostsQuery } from "@/store/api/publicApi";
import type { BlogPost } from "@/types";
import { calculateReadTime, readTimeFromWordCount } from "@/lib/utils";
import { siteContent } from "@/lib/site-content";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export function readTime(post: BlogPost): number {
  return typeof post.word_count === "number"
    ? readTimeFromWordCount(post.word_count)
    : calculateReadTime(post.content ?? "");
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <li>
      <Link
        href={`/blog/view?slug=${post.slug}`}
        className="group grid gap-5 rounded-lg border bg-card p-5 transition-colors hover:border-primary/50 sm:grid-cols-[1fr_auto]"
      >
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
            <time dateTime={post.published_at ?? undefined}>
              {formatDate(post.published_at)}
            </time>
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {readTime(post)} min read
            </span>
            {typeof post.views === "number" && (
              <span className="flex items-center gap-1">
                <Eye className="size-3" aria-hidden />
                {post.views}
              </span>
            )}
          </div>
          <h2 className="mt-2 font-heading text-xl font-bold tracking-tight group-hover:text-primary">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          )}
          {post.tags && post.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => (
                <li
                  key={tag}
                  className="rounded border bg-secondary/60 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt=""
            loading="lazy"
            className="hidden h-28 w-44 rounded-md border object-cover sm:block"
          />
        )}
      </Link>
    </li>
  );
}

export function BlogListPage() {
  const { data: posts, isLoading, isError } = useGetPublishedBlogPostsQuery();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams?.get("tag") ?? "");

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return posts ?? [];
    return (posts ?? []).filter((post) =>
      [post.title, post.excerpt, ...(post.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [posts, searchTerm]);

  return (
    <Container className="py-16 sm:py-20">
      <PageHeader
        kicker="Writing"
        title={siteContent.pages.blog.title}
        subheading={siteContent.pages.blog.description}
      />

      <div className="relative mb-10 w-full sm:max-w-xs">
        <Search
          aria-hidden
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search posts…"
          aria-label="Search posts"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="status-line">
          <span aria-hidden>▲ </span>
          Couldn&apos;t load posts right now — try again shortly.
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            {searchTerm ? "No posts match." : "Nothing published yet."}
          </p>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="mt-3 font-mono text-xs text-primary underline-offset-4 hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </ul>
      )}
    </Container>
  );
}
