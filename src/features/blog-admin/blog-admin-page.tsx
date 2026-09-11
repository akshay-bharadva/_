"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { BlogPost } from "@/types";
import {
  useDeleteBlogPostMutation,
  useGetAdminBlogPostsQuery,
  useUpdateBlogPostMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { draftFromPost, postProblems, recordFromDraft } from "./post-draft";
import { ContinueWriting, PostSection } from "./post-list";

// The editor pulls in TipTap — loaded only when a post is opened, so the list
// stays light.
const BlogEditor = dynamic(() => import("./blog-editor"), {
  ssr: false,
  loading: () => <LoadingState label="Opening the editor" />,
});

type Status = "all" | "draft" | "published";

const time = (iso?: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);

/**
 * The blog: what you are writing, then what is out and how it is doing.
 *
 * The latest draft leads as "Continue writing", because coming back to it is
 * the usual reason to open this page. Drafts and published posts are listed
 * apart — one is work in progress, the other is a record with readers — and a
 * published row carries its views in a column of its own.
 */
export default function BlogAdminPage() {
  const confirm = useConfirm();
  const { data: posts = [], isLoading } = useGetAdminBlogPostsQuery();
  const [updateBlogPost] = useUpdateBlogPostMutation();
  const [deleteBlogPost] = useDeleteBlogPostMutation();

  /**
   * The open editor. Keyed once when opened, not by post id, so a new post's
   * first save — which gives it an id — does not remount the editor under
   * the person typing in it.
   */
  const [session, setSession] = useState<{ key: number; id: string | null } | null>(
    null,
  );
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");

  const open = (post: BlogPost | null) =>
    setSession({ key: Date.now(), id: post?.id ?? null });

  const handleDelete = async (post: BlogPost) => {
    const ok = await confirm({
      title: `Delete "${post.title || "Untitled"}"?`,
      description: post.published
        ? "It comes off the blog straight away, with its views. This can't be undone — unpublishing keeps it instead."
        : "This can't be undone.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await deleteBlogPost(post).unwrap();
      if (session?.id === post.id) setSession(null);
      toast.success("Post deleted.");
    } catch (err) {
      toast.error("Couldn't delete the post", {
        description: getErrorMessage(err),
      });
    }
  };

  /** Publishing from the list follows the editor's rules: a post needs a body. */
  const handleToggle = async (post: BlogPost) => {
    const publishing = !post.published;
    if (publishing) {
      const problems = postProblems(
        recordFromDraft(draftFromPost(post), true, post),
        true,
      );
      if (Object.keys(problems).length > 0) {
        toast.error("Not ready to publish", {
          description: `${Object.values(problems)[0]} Open the post to finish it.`,
        });
        return;
      }
    }
    try {
      await updateBlogPost({
        id: post.id,
        published: publishing,
        published_at: publishing ? new Date().toISOString() : null,
      }).unwrap();
      toast.success(publishing ? "Published." : "Moved back to drafts.");
    } catch (err) {
      toast.error("Couldn't update the post", {
        description: getErrorMessage(err),
      });
    }
  };

  const term = search.trim().toLowerCase();
  const matching = useMemo(
    () =>
      posts.filter(
        (post) =>
          !term ||
          [post.title, post.excerpt, ...(post.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(term),
      ),
    [posts, term],
  );

  if (session) {
    const post = session.id
      ? (posts.find((p) => p.id === session.id) ?? null)
      : null;
    return (
      <BlogEditor
        key={session.key}
        post={post}
        onClose={() => setSession(null)}
        onCreated={(created) =>
          setSession((s) => (s ? { ...s, id: created.id } : s))
        }
        onDelete={handleDelete}
      />
    );
  }

  const drafts = matching
    .filter((p) => !p.published)
    .sort((a, b) => time(b.updated_at ?? b.created_at) - time(a.updated_at ?? a.created_at));
  const live = matching
    .filter((p) => p.published)
    .sort((a, b) => time(b.published_at) - time(a.published_at));
  const counts = {
    all: posts.length,
    draft: posts.filter((p) => !p.published).length,
    published: posts.filter((p) => p.published).length,
  };
  const featured = status === "all" && !term ? drafts[0] : undefined;
  const draftRows = featured ? drafts.slice(1) : drafts;
  const showDrafts = status !== "published";
  const showLive = status !== "draft";
  const nothing =
    !featured &&
    (!showDrafts || draftRows.length === 0) &&
    (!showLive || live.length === 0);

  const actions = {
    onEdit: open,
    onToggleStatus: handleToggle,
    onDelete: handleDelete,
  };

  return (
    <ManagerWrapper>
      <PageHeader
        title="Blog"
        description="What you're writing, and how published posts are doing."
        actions={
          <Button onClick={() => open(null)}>
            <Plus className="mr-2 size-4" aria-hidden /> New post
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState label="Loading posts" />
      ) : posts.length === 0 ? (
        <EmptyState
          variant="card"
          icon={FileText}
          title="No posts yet"
          description="Write your first post — it stays a draft until you publish it."
          action={{ label: "New post", onClick: () => open(null), icon: Plus }}
        />
      ) : (
        <div className="space-y-8">
          {featured && (
            <ContinueWriting post={featured} onOpen={() => open(featured)} />
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FilterBar label="Filter by status" className="min-w-0">
              <FilterChip
                active={status === "all"}
                count={counts.all}
                onClick={() => setStatus("all")}
              >
                All
              </FilterChip>
              <FilterChip
                active={status === "draft"}
                count={counts.draft}
                onClick={() => setStatus("draft")}
              >
                Drafts
              </FilterChip>
              <FilterChip
                active={status === "published"}
                count={counts.published}
                onClick={() => setStatus("published")}
              >
                Published
              </FilterChip>
            </FilterBar>
            <div className="relative w-full shrink-0 sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search posts…"
                aria-label="Search posts"
                className="h-9 pl-8"
              />
            </div>
          </div>

          {nothing ? (
            <EmptyState
              variant="card"
              size="compact"
              icon={Search}
              title="No matches"
              description="No posts match this filter and search."
              action={{
                label: "Clear filters",
                onClick: () => {
                  setSearch("");
                  setStatus("all");
                },
              }}
            />
          ) : (
            <>
              {showDrafts && (
                <PostSection title="Drafts" posts={draftRows} {...actions} />
              )}
              {showLive && (
                <PostSection title="Published" posts={live} {...actions} />
              )}
            </>
          )}
        </div>
      )}
    </ManagerWrapper>
  );
}
