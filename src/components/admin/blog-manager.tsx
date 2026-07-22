import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import type { BlogPost } from "@/types";
import {
  useGetAdminBlogPostsQuery,
  useAddBlogPostMutation,
  useUpdateBlogPostMutation,
  useDeleteBlogPostMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { useConfirm } from "../providers/ConfirmDialogProvider";
import { PageHeader, EmptyState, ManagerWrapper } from "./shared";
import { PostsTable, PostCards } from "./blog/post-list";

// The editor pulls in the full TipTap/Novel suite — load it only when a post
// is actually opened for editing, so the list view stays light.
const BlogEditor = dynamic(() => import("./blog-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface BlogManagerProps {
  startInCreateMode?: boolean;
  onActionHandled?: () => void;
}

export default function BlogManager({
  startInCreateMode,
  onActionHandled,
}: BlogManagerProps) {
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

  const handleSavePost = async (postData: Partial<BlogPost>) => {
    try {
      if (isCreating || !editingPost?.id) {
        await addBlogPost(postData).unwrap();
        toast.success("Post created successfully.");
      } else {
        await updateBlogPost({ ...postData, id: editingPost.id }).unwrap();
        toast.success("Post updated successfully.");
      }
      handleCancel();
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

  if (isCreating || editingPost) {
    return (
      <BlogEditor
        post={editingPost}
        onSave={handleSavePost}
        onCancel={handleCancel}
      />
    );
  }

  const listActions = {
    onEdit: handleEditPost,
    onToggleStatus: togglePostStatus,
    onDelete: handleDeletePost,
  };

  return (
    <ManagerWrapper className="h-full flex flex-col">
      <PageHeader
        title="Blog Manager"
        description="Manage, create, and publish your content."
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Search posts..."
        actions={
          <Button
            onClick={handleCreatePost}
            size="sm"
            className="h-9 w-full sm:w-auto"
          >
            <Plus className="mr-2 size-4" /> Create Post
          </Button>
        }
        filters={
          <Select
            value={filterStatus}
            onValueChange={(v) =>
              setFilterStatus(v as "all" | "published" | "draft")
            }
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Card className="flex-1 flex flex-col overflow-hidden border-none sm:border shadow-none sm:shadow-sm bg-transparent sm:bg-card">
        <CardContent className="p-0 flex-1 overflow-auto bg-transparent sm:bg-background/50">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No posts found"
              description={
                searchTerm
                  ? "Try adjusting your search or filters."
                  : "Create your first blog post to get started."
              }
              action={
                !searchTerm
                  ? {
                      label: "Create Post",
                      onClick: handleCreatePost,
                      icon: Plus,
                    }
                  : undefined
              }
              className="h-64 border border-dashed rounded-lg bg-muted/10 mx-0 sm:mx-4 my-4"
            />
          ) : (
            <>
              <PostsTable posts={filteredPosts} {...listActions} />
              <PostCards posts={filteredPosts} {...listActions} />
            </>
          )}
        </CardContent>
      </Card>
    </ManagerWrapper>
  );
}
