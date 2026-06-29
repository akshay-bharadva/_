"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { BlogPost } from "@/types";
import {
  useAddBlogPostMutation,
  useDeleteBlogPostMutation,
  useGetAdminBlogPostsQuery,
  useUpdateBlogPostMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  ManagerWrapper,
  PageHeader,
  LoadingState,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { PostList } from "./post-list";

// The editor pulls in the full TipTap/Novel suite — load it only when a post
// is actually opened for editing, so the list view stays light.
const BlogEditor = dynamic(() => import("./blog-editor"), {
  ssr: false,
  loading: () => <LoadingState />,
});

interface BlogAdminPageProps {
  startInCreateMode?: boolean;
  onActionHandled?: () => void;
}

export default function BlogAdminPage({
  startInCreateMode,
  onActionHandled,
}: BlogAdminPageProps) {
  const confirm = useConfirm();

  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "published" | "draft"
  >("all");

  const { data: posts = [], isLoading } = useGetAdminBlogPostsQuery();
  const [addBlogPost] = useAddBlogPostMutation();
  const [updateBlogPost] = useUpdateBlogPostMutation();
  const [deleteBlogPost] = useDeleteBlogPostMutation();

  useEffect(() => {
    if (startInCreateMode) {
      handleCreatePost();
      onActionHandled?.();
    }
  }, [startInCreateMode, onActionHandled]);

  const filteredPosts = useMemo(() => {
    return posts
      .filter((post) => {
        if (filterStatus === "published") return post.published;
        if (filterStatus === "draft") return !post.published;
        return true;
      })
      .filter((post) =>
        (post.title || "").toLowerCase().includes(searchTerm.toLowerCase()),
      );
  }, [posts, searchTerm, filterStatus]);

  const handleCreatePost = () => {
    setIsCreating(true);
    setEditingPost(null);
  };

  const handleEditPost = (post: BlogPost) => {
    setEditingPost(post);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingPost(null);
  };

  const handleDeletePost = async (post: BlogPost) => {
    const ok = await confirm({
      title: `Delete "${post.title}"?`,
      description: "This action cannot be undone.",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteBlogPost(post).unwrap();
      toast.success("Post deleted successfully.");
    } catch (err) {
      toast.error("Failed to delete post", {
        description: getErrorMessage(err),
      });
    }
  };

  /**
   * Saving keeps you in the editor.
   *
   * Every save used to call `handleCancel()`, so writing a post and pressing
   * Save threw you back to the list — you then had to find the post and
   * reopen it to carry on. A create now switches the editor onto the record it
   * just made, so the next save is an update rather than a second insert.
   * Leaving is the explicit "Posts" control.
   */
  const handleSavePost = async (postData: Partial<BlogPost>) => {
    try {
      if (isCreating || !editingPost?.id) {
        const created = await addBlogPost(postData).unwrap();
        setIsCreating(false);
        setEditingPost(created);
        toast.success("Post created.");
      } else {
        const updated = await updateBlogPost({
          ...postData,
          id: editingPost.id,
        }).unwrap();
        setEditingPost(updated);
        toast.success("Post saved.");
      }
    } catch (err) {
      toast.error("Failed to save post", {
        description: getErrorMessage(err),
      });
    }
  };

  const togglePostStatus = async (post: BlogPost) => {
    try {
      await updateBlogPost({
        id: post.id,
        published: !post.published,
        published_at: !post.published ? new Date().toISOString() : null,
      }).unwrap();
      toast.success(`Post ${!post.published ? "published" : "unpublished"}.`);
    } catch (err) {
      toast.error("Failed to update status", {
        description: getErrorMessage(err),
      });
    }
  };

  /* ── editor ───────────────────────────────────────────────────────── */

  if (isCreating || editingPost) {
    return (
      <BlogEditor
        post={editingPost}
        onSave={handleSavePost}
        onCancel={handleCancel}
      />
    );
  }

  /* ── list ─────────────────────────────────────────────────────────── */

  const counts = {
    all: posts.length,
    published: posts.filter((p) => p.published).length,
    draft: posts.filter((p) => !p.published).length,
  };

  return (
    <ManagerWrapper>
      <PageHeader
        title="Blog"
        description="Write, publish and manage your posts."
        actions={
          <Button onClick={handleCreatePost}>
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
          action={{ label: "New post", onClick: handleCreatePost, icon: Plus }}
        />
      ) : (
        <div className="space-y-4">
          {/*
            Status, filter and search in one bar directly above the list they
            act on. Previously the search sat in the page header, the status
            filter beside it, and the count nowhere — so nothing told you how
            much the filter had hidden.
          */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label="Filter by status"
              className="flex gap-1"
            >
              {(["all", "published", "draft"] as const).map((status) => (
                <button
                  key={status}
                  role="tab"
                  aria-selected={filterStatus === status}
                  onClick={() => setFilterStatus(status)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filterStatus === status
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {status === "all" ? "All" : status}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      filterStatus === status
                        ? "bg-primary-foreground/20"
                        : "bg-secondary",
                    )}
                  >
                    {counts[status]}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative sm:w-72">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search posts…"
                aria-label="Search posts by title"
                className="h-9 pl-8"
              />
            </div>
          </div>

          {filteredPosts.length === 0 ? (
            <EmptyState
              variant="card"
              size="compact"
              icon={Search}
              title="No matches"
              description="No posts match the current filter and search."
              action={{
                label: "Clear filters",
                onClick: () => {
                  setSearchTerm("");
                  setFilterStatus("all");
                },
              }}
            />
          ) : (
            <PostList
              posts={filteredPosts}
              onEdit={handleEditPost}
              onToggleStatus={togglePostStatus}
              onDelete={handleDeletePost}
            />
          )}
        </div>
      )}
    </ManagerWrapper>
  );
}
