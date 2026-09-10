"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Eye, Search, X } from "lucide-react";
import { useGetPublishedBlogPostsQuery } from "@/store/api/publicApi";
import type { BlogPost } from "@/types";
import { calculateReadTime, readTimeFromWordCount } from "@/lib/utils";
import { siteContent } from "@/lib/site-content";
import { safeImageUrl } from "@/lib/safe-url";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/layout/motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

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

/** The tags worth offering as filters: most used first, at most `limit`. */
export function topTags(posts: BlogPost[], limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const unique = Array.from(
      new Set((post.tags ?? []).map((t) => t.trim()).filter(Boolean)),
    );
    for (const tag of unique) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

/** Date · read time · views, in the body face. */
function PostMeta({ post, className }: { post: BlogPost; className?: string }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground",
        className,
      )}
    >
      {post.published_at && (
        <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
      )}
      {post.published_at && <span aria-hidden>·</span>}
      <span>{readTime(post)} min read</span>
      {typeof post.views === "number" && (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden />
            {post.views.toLocaleString()}
          </span>
        </>
      )}
    </p>
  );
}

/** A cover, or a tinted well with the title's initial when there is none. */
function Cover({ post, className }: { post: BlogPost; className?: string }) {
  const src = safeImageUrl(post.cover_image_url);
  return (
    <div className={cn("overflow-hidden bg-secondary", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-700 ease-enter group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div
          aria-hidden
          className="flex size-full items-center justify-center bg-[radial-gradient(80%_80%_at_30%_20%,hsl(var(--primary)/0.18),transparent)] font-heading text-5xl font-bold text-primary/60"
        >
          {post.title.trim().charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

const CARD_LINK =
  "group flex h-full overflow-hidden rounded-surface bg-card shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0";

/** The newest post, given the room a lead story gets. */
function FeaturedPost({ post }: { post: BlogPost }) {
  return (
    <Reveal>
      <Link
        href={`/blog/view?slug=${post.slug}`}
        data-featured
        className={cn(CARD_LINK, "flex-col lg:grid lg:grid-cols-[1.25fr_1fr]")}
      >
        <Cover post={post} className="aspect-[16/9] lg:aspect-auto lg:min-h-80" />
        <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
          <p className="t-eyebrow">Latest</p>
          <h2 className="t-heading mt-3 text-balance [overflow-wrap:anywhere] transition-colors group-hover:text-primary">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="mt-3 line-clamp-3 leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          )}
          <PostMeta post={post} className="mt-5" />
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            Read the post
            <ArrowUpRight
              aria-hidden
              className="size-4 transition-transform duration-200 ease-enter group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </span>
        </div>
      </Link>
    </Reveal>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/view?slug=${post.slug}`}
      className={cn(CARD_LINK, "flex-col")}
    >
      <Cover post={post} className="aspect-[16/10]" />
      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        {post.tags?.[0] && <p className="t-eyebrow">{post.tags[0]}</p>}
        <h2 className="mt-2 font-heading text-lg font-semibold leading-snug [overflow-wrap:anywhere] transition-colors group-hover:text-primary">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        )}
        <PostMeta post={post} className="mt-auto pt-5 text-xs" />
      </div>
    </Link>
  );
}

export function BlogListPage() {
  const {
    data: posts,
    isLoading,
    isError,
    refetch,
  } = useGetPublishedBlogPostsQuery();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  // A post's tag links land here as ?tag=, so the chip arrives pressed.
  const [tag, setTag] = useState<string | null>(searchParams?.get("tag") ?? null);

  const tags = useMemo(() => topTags(posts ?? []), [posts]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (posts ?? []).filter((post) => {
      if (tag && !(post.tags ?? []).includes(tag)) return false;
      if (!term) return true;
      return [post.title, post.excerpt, ...(post.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [posts, searchTerm, tag]);

  const filtering = Boolean(searchTerm.trim() || tag);
  // The lead story is only a lead when the reader is browsing, not searching.
  const [featured, ...rest] = filtering ? [undefined, ...filtered] : filtered;

  const clear = () => {
    setSearchTerm("");
    setTag(null);
  };

  return (
    <Band weight="content">
      <PageHeader
        kicker="Writing"
        title={siteContent.pages.blog.title}
        subheading={siteContent.pages.blog.description}
      />

      <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search
            aria-hidden
            className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search posts…"
            aria-label="Search posts"
            className="h-11 rounded-full bg-card pl-11 shadow-e1"
          />
        </div>
        {tags.length > 0 && (
          <FilterBar label="Filter by topic">
            <FilterChip active={tag === null} onClick={() => setTag(null)}>
              All
            </FilterChip>
            {tags.map((name) => (
              <FilterChip
                key={name}
                active={tag === name}
                onClick={() => setTag(tag === name ? null : name)}
              >
                {name}
              </FilterChip>
            ))}
          </FilterBar>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6" aria-busy>
          <Skeleton className="h-80 rounded-surface" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-surface" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-surface bg-card px-6 py-14 text-center shadow-e1">
          <p className="font-heading text-lg font-semibold">
            The posts didn&apos;t load
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is lost — it&apos;s the connection, not the writing.
          </p>
          <Button variant="outline" className="mt-6 rounded-full" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-surface border border-dashed px-6 py-16 text-center">
          <p className="font-heading text-lg font-semibold">
            {filtering ? "No posts match" : "Nothing published yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtering
              ? "Try a different word or topic."
              : "The first post is on its way."}
          </p>
          {filtering && (
            <Button variant="outline" className="mt-6 gap-2 rounded-full" onClick={clear}>
              <X className="size-4" aria-hidden />
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {featured && <FeaturedPost post={featured} />}
          {rest.length > 0 && (
            <Stagger
              as="ul"
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {rest.map((post) =>
                post ? (
                  <StaggerItem as="li" key={post.id}>
                    <PostCard post={post} />
                  </StaggerItem>
                ) : null,
              )}
            </Stagger>
          )}
        </div>
      )}
    </Band>
  );
}
