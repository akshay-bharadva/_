"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { skipToken } from "@reduxjs/toolkit/query";
import { ChevronRight, Clock, Linkedin, Share2 } from "lucide-react";
import {
  useGetBlogPostBySlugQuery,
  useGetSiteIdentityQuery,
  useIncrementPostViewMutation,
} from "@/store/api/publicApi";
import { isSupabaseConfigured } from "@/lib/config";
import { Band } from "@/components/layout/band";
import { Skeleton } from "@/components/ui/skeleton";
import { readTime } from "./blog-list-page";
import { ReadingProgress } from "./reading-progress";
import { TableOfContents, useHeadings } from "./table-of-contents";

const VIEW_COUNT_DELAY_MS = 5000;
const ARTICLE_ID = "post-article";

// The markdown pipeline (raw → sanitize → prism/refractor → slug) is by far the
// heaviest thing on this route, and nothing above the article body needs it.
// Splitting it lets the breadcrumb, title and cover image paint on the light
// chunk; the preload below keeps the fetch off the critical path.
const PostContent = dynamic(
  () => import("./post-content").then((mod) => mod.PostContent),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    ),
  },
);

function NotFoundView() {
  return (
    <Band weight="content" className="text-center">
      <p className="t-micro justify-center">
        <span aria-hidden className="text-destructive">
          ●{" "}
        </span>
        status: 404 — post not found
      </p>
      <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight">
        This post doesn&apos;t exist.
      </h1>
      <Link
        href="/blog"
        className="mt-8 inline-block rounded-md border bg-card px-4 py-2 font-mono text-xs transition-shadow duration-200 ease-enter hover:shadow-e2 hover:text-primary"
      >
        ← All posts
      </Link>
    </Band>
  );
}

export function PostPage() {
  const searchParams = useSearchParams();
  const slug = searchParams?.get("slug") ?? "";

  const {
    data: post,
    isLoading,
    isError,
  } = useGetBlogPostBySlugQuery(slug || skipToken);
  const { data: identity } = useGetSiteIdentityQuery();
  const [incrementView] = useIncrementPostViewMutation();

  // Owned by the page, not the rail: the layout has to know whether a table of
  // contents will render before it decides how wide the article is.
  const { headings, activeId } = useHeadings(ARTICLE_ID);

  // Warm the markdown chunk alongside the post query rather than after it, so
  // the code split doesn't serialize two round trips before the body appears.
  useEffect(() => {
    void import("./post-content");
  }, []);

  // Static-export limitation: the document title is set client-side.
  useEffect(() => {
    if (post) document.title = post.title;
  }, [post]);

  useEffect(() => {
    if (!post || process.env.NODE_ENV !== "production" || !isSupabaseConfigured)
      return;
    const timer = setTimeout(() => incrementView(post.id), VIEW_COUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [post, incrementView]);

  if (!slug || isError) return <NotFoundView />;

  if (isLoading || !post) {
    return (
      <Band weight="content" width="prose" aria-busy>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-5 h-12 w-3/4" />
        <Skeleton className="mt-8 h-64 w-full rounded-lg" />
      </Band>
    );
  }

  const author = identity?.profile_data;
  const published = post.published_at
    ? new Date(post.published_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const hasToc = post.show_toc !== false && headings.length > 0;

  const share = (network: "x" | "linkedin") => {
    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(post.title);
    window.open(
      network === "x"
        ? `https://twitter.com/intent/tweet?url=${url}&text=${text}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <>
      <ReadingProgress />
      <Band weight="content" width="wide">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <li>
              <Link href="/blog" className="hover:text-primary">
                blog
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3" />
            </li>
            <li aria-current="page" className="truncate text-foreground">
              {post.slug}
            </li>
          </ol>
        </nav>

        {/*
          Keyed on whether a table of contents will actually render, not on the
          `show_toc` flag alone. The rail returns null when the post has no
          h2/h3, so keying on the flag reserved a 14rem column for nothing and
          left the article pinned at max-w-3xl — the "content doesn't expand"
          case.
        */}
        <div
          className={
            hasToc
              ? "grid gap-12 lg:grid-cols-[minmax(0,1fr)_14rem]"
              : "mx-auto max-w-3xl"
          }
        >
          <article id={ARTICLE_ID} className="min-w-0">
            <header>
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                {post.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
                {author?.show_profile_picture && author.profile_picture_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={author.profile_picture_url}
                    alt=""
                    className="size-6 rounded-full border object-cover"
                  />
                )}
                {author?.name && <span>{author.name}</span>}
                {published && (
                  <time dateTime={post.published_at ?? undefined}>
                    {published}
                  </time>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  {readTime(post)} min read
                </span>
              </div>
              {post.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.cover_image_url}
                  alt=""
                  className="mt-8 w-full rounded-surface border object-cover"
                />
              )}
              <div className="mt-8 h-px w-16 bg-primary/40" aria-hidden />
            </header>

            <PostContent content={post.content ?? ""} />

            <footer className="mt-12 border-t border-dashed pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {post.tags && post.tags.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <li key={tag}>
                        <Link
                          href={`/blog?tag=${encodeURIComponent(tag)}`}
                          className="rounded border bg-secondary/60 px-2 py-1 font-mono text-xs text-muted-foreground transition-shadow duration-200 ease-enter hover:shadow-e2 hover:text-primary"
                        >
                          #{tag}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    share
                  </span>
                  <button
                    type="button"
                    onClick={() => share("x")}
                    aria-label="Share on X"
                    className="rounded-md border bg-card p-2 transition-shadow duration-200 ease-enter hover:shadow-e2 hover:text-primary"
                  >
                    <Share2 className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => share("linkedin")}
                    aria-label="Share on LinkedIn"
                    className="rounded-md border bg-card p-2 transition-shadow duration-200 ease-enter hover:shadow-e2 hover:text-primary"
                  >
                    <Linkedin className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </footer>
          </article>

          {hasToc && (
            <TableOfContents headings={headings} activeId={activeId} />
          )}
        </div>
      </Band>
    </>
  );
}
