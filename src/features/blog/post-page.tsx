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
import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";
import { readTime } from "./blog-list-page";
import { ReadingProgress } from "./reading-progress";
import { TableOfContents } from "./table-of-contents";

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
    <Container className="py-24 text-center">
      <p className="status-line justify-center">
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
        className="mt-8 inline-block rounded-md border bg-card px-4 py-2 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary"
      >
        ← All posts
      </Link>
    </Container>
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
      <Container className="max-w-3xl py-16" aria-busy>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-5 h-12 w-3/4" />
        <Skeleton className="mt-8 h-64 w-full rounded-lg" />
      </Container>
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
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : "";

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
      <Container className="py-12 sm:py-16">
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

        <div
          className={
            post.show_toc
              ? "grid gap-12 lg:grid-cols-[1fr_14rem]"
              : "mx-auto max-w-3xl"
          }
        >
          <article id={ARTICLE_ID} className="min-w-0 max-w-3xl">
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
                  className="mt-8 w-full rounded-lg border object-cover"
                />
              )}
              <hr className="rule-dotted my-8" aria-hidden />
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
                          className="rounded border bg-secondary/60 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
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
                    className="rounded-md border bg-card p-2 transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <Share2 className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => share("linkedin")}
                    aria-label="Share on LinkedIn"
                    className="rounded-md border bg-card p-2 transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <Linkedin className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </footer>
          </article>

          {post.show_toc && <TableOfContents articleId={ARTICLE_ID} />}
        </div>
      </Container>
    </>
  );
}
