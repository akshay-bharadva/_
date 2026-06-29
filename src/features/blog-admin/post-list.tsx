"use client";

import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import {
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  ImageIcon,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import type { BlogPost } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readTimeFromWordCount } from "@/lib/utils";
import { cn } from "@/lib/cn";

export interface PostListProps {
  posts: BlogPost[];
  onEdit: (post: BlogPost) => void;
  onToggleStatus: (post: BlogPost) => void;
  onDelete: (post: BlogPost) => void;
}

function StatusBadge({ published }: { published?: boolean }) {
  return (
    <Badge
      variant={published ? "default" : "secondary"}
      className={cn(
        "shrink-0",
        published && "bg-chart-2/15 text-chart-2 hover:bg-chart-2/25",
      )}
    >
      {published ? "Published" : "Draft"}
    </Badge>
  );
}

/**
 * One post, at every width.
 *
 * This replaces a `PostsTable` (`hidden md:block`) and a `PostCards`
 * (`md:hidden`) that were both rendered on every page load and hidden with CSS
 * — two components, two designs, and two places for a change to be forgotten.
 * A single row that reflows covers both, and the metadata that used to vanish
 * below `md` now wraps instead of disappearing.
 *
 * Publish is on the row rather than only in a menu: it is the action a blog
 * list exists for, and burying the one thing you came to do behind an overflow
 * menu is what made this feel unfinished.
 */
export function PostRow({
  post,
  onEdit,
  onToggleStatus,
  onDelete,
}: { post: BlogPost } & Omit<PostListProps, "posts">) {
  const readTime = post.word_count
    ? readTimeFromWordCount(post.word_count)
    : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-start gap-3 rounded-surface bg-card p-3 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 sm:items-center"
    >
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-secondary">
        {post.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>

      <button
        type="button"
        onClick={() => onEdit(post)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="truncate font-medium">{post.title}</span>
          <StatusBadge published={post.published} />
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate font-mono">/{post.slug}</span>
          {typeof post.views === "number" && (
            <span className="flex items-center gap-1">
              <Eye className="size-3" aria-hidden />
              {post.views.toLocaleString()}
            </span>
          )}
          {readTime && <span>{readTime} min read</span>}
          {post.updated_at && (
            <span>{format(new Date(post.updated_at), "d MMM yyyy")}</span>
          )}
        </span>
      </button>

      {/* The primary row action, not hidden in the menu. */}
      <Button
        variant={post.published ? "outline" : "default"}
        size="sm"
        className="hidden shrink-0 sm:inline-flex"
        onClick={() => onToggleStatus(post)}
      >
        {post.published ? (
          <>
            <EyeOff className="mr-2 size-3.5" aria-hidden /> Unpublish
          </>
        ) : (
          <>
            <Send className="mr-2 size-3.5" aria-hidden /> Publish
          </>
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Actions for "${post.title}"`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(post)}>
            <Edit className="mr-2 size-4" aria-hidden /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="sm:hidden"
            onClick={() => onToggleStatus(post)}
          >
            {post.published ? (
              <>
                <EyeOff className="mr-2 size-4" aria-hidden /> Unpublish
              </>
            ) : (
              <>
                <Send className="mr-2 size-4" aria-hidden /> Publish
              </>
            )}
          </DropdownMenuItem>
          {post.published && (
            <DropdownMenuItem asChild>
              <a
                href={`/blog/view/?slug=${post.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 size-4" aria-hidden /> View live
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => onDelete(post)}
          >
            <Trash2 className="mr-2 size-4" aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.li>
  );
}

export function PostList({
  posts,
  onEdit,
  onToggleStatus,
  onDelete,
}: PostListProps) {
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {posts.map((post) => (
          <PostRow
            key={post.id}
            post={post}
            onEdit={onEdit}
            onToggleStatus={onToggleStatus}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}
