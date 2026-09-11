"use client";

import { useState, type ReactNode } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Copy,
  ExternalLink,
  EyeOff,
  FileText,
  MoreHorizontal,
  PenLine,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { BlogPost } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { readTimeFromWordCount } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";

export interface PostActions {
  onEdit: (post: BlogPost) => void;
  onToggleStatus: (post: BlogPost) => void;
  onDelete: (post: BlogPost) => void;
}

/** Where a published post lives on the public site. */
export function livePath(post: Pick<BlogPost, "slug">): string {
  return `/blog/view/?slug=${encodeURIComponent(post.slug)}`;
}

/** Published posts say when they went out; drafts say when they were last touched. */
function when(post: BlogPost): string {
  if (post.published && post.published_at) {
    return `Published ${format(new Date(post.published_at), "d MMM yyyy")}`;
  }
  const edited = post.updated_at ?? post.created_at;
  return edited
    ? `Edited ${formatDistanceToNow(new Date(edited), { addSuffix: true })}`
    : "Not saved yet";
}

/**
 * The draft you were last working on, first — because opening the blog
 * module is most often a way back to it.
 */
export function ContinueWriting({
  post,
  onOpen,
}: {
  post: BlogPost;
  onOpen: () => void;
}) {
  const cover = safeImageUrl(post.cover_image_url);
  const minutes = post.word_count ? readTimeFromWordCount(post.word_count) : null;

  return (
    <section
      aria-label="Continue writing"
      className={cn(
        "grid overflow-hidden rounded-surface bg-card shadow-e2",
        cover && "sm:grid-cols-[minmax(0,1fr)_16rem]",
      )}
    >
      <div className="flex min-w-0 flex-col p-6">
        <p className="t-eyebrow">Continue writing</p>
        <h2 className="mt-2 break-words text-2xl font-semibold leading-tight tracking-tight">
          {post.title || "Untitled"}
        </h2>
        {post.excerpt && (
          <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">
            {post.excerpt}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {when(post)}
          {post.word_count ? ` · ${post.word_count.toLocaleString()} words` : ""}
          {minutes ? ` · ${minutes} min read` : ""}
        </p>
        <div className="mt-5">
          <Button onClick={onOpen}>
            <PenLine className="mr-2 size-4" aria-hidden />
            Continue
          </Button>
        </div>
      </div>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="hidden h-full w-full bg-secondary object-cover sm:block"
        />
      )}
    </section>
  );
}

/** Drafts and published posts are different kinds of work, so they are listed apart. */
export function PostSection({
  title,
  posts,
  ...actions
}: { title: string; posts: BlogPost[] } & PostActions) {
  if (posts.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
        {/* The space is for the accessible name — "Drafts 3", not "Drafts3". */}
        {title}{" "}
        <span className="font-normal tabular-nums text-muted-foreground">
          {posts.length}
        </span>
      </h2>
      <ul className="list-none space-y-2 p-0">
        {posts.map((post) => (
          <PostRow key={post.id} post={post} {...actions} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One post: its cover, title, summary and when — and, for a published post,
 * how many people have read it, in its own column so the numbers line up.
 */
export function PostRow({
  post,
  onEdit,
  onToggleStatus,
  onDelete,
}: { post: BlogPost } & PostActions) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cover = safeImageUrl(post.cover_image_url);
  const minutes = post.word_count ? readTimeFromWordCount(post.word_count) : null;
  const title = post.title || "Untitled";

  const copyLink = async () => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(
        new URL(livePath(post), window.location.origin).toString(),
      );
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-surface bg-card p-2 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 sm:gap-4 sm:p-3">
      <button
        type="button"
        onClick={() => onEdit(post)}
        aria-label={`Edit ${title}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4"
      >
        <span className="flex aspect-[16/10] w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-secondary sm:w-24">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <FileText className="size-5 text-muted-foreground" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">
            {title}
          </span>
          {post.excerpt && (
            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
              {post.excerpt}
            </span>
          )}
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{when(post)}</span>
            {minutes && <span>{minutes} min read</span>}
            {post.tags?.slice(0, 2).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </span>
        </span>
      </button>

      {post.published && typeof post.views === "number" && (
        <span className="hidden w-20 shrink-0 text-right sm:block">
          <span className="block text-sm font-semibold tabular-nums text-foreground">
            {post.views.toLocaleString()}
          </span>
          <span className="block text-xs text-muted-foreground">views</span>
        </span>
      )}

      <Button
        size="sm"
        variant={post.published ? "ghost" : "secondary"}
        onClick={() => onToggleStatus(post)}
        className="hidden shrink-0 sm:inline-flex"
      >
        {post.published ? (
          <>
            <EyeOff className="mr-1.5 size-3.5" aria-hidden /> Unpublish
          </>
        ) : (
          <>
            <Send className="mr-1.5 size-3.5" aria-hidden /> Publish
          </>
        )}
      </Button>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`More actions for ${title}`}
            className="size-8 shrink-0"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1">
          <MenuButton
            icon={PenLine}
            onClick={() => {
              setMenuOpen(false);
              onEdit(post);
            }}
          >
            Edit
          </MenuButton>
          <MenuButton
            icon={post.published ? EyeOff : Send}
            className="sm:hidden"
            onClick={() => {
              setMenuOpen(false);
              onToggleStatus(post);
            }}
          >
            {post.published ? "Unpublish" : "Publish"}
          </MenuButton>
          {post.published && (
            <>
              <a
                href={livePath(post)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="size-4 opacity-70" aria-hidden />
                View live
              </a>
              <MenuButton icon={Copy} onClick={copyLink}>
                Copy link
              </MenuButton>
            </>
          )}
          <div className="my-1 h-px bg-border" aria-hidden />
          <MenuButton
            icon={Trash2}
            destructive
            onClick={() => {
              setMenuOpen(false);
              onDelete(post);
            }}
          >
            Delete
          </MenuButton>
        </PopoverContent>
      </Popover>
    </li>
  );
}

function MenuButton({
  icon: Icon,
  destructive,
  className,
  onClick,
  children,
}: {
  icon: LucideIcon;
  destructive?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-secondary",
        className,
      )}
    >
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
      {children}
    </button>
  );
}
