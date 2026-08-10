"use client";

import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import {
  Calendar,
  Edit,
  ExternalLink,
  Eye,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type { BlogPost } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PostListProps {
  posts: BlogPost[];
  onEdit: (post: BlogPost) => void;
  onToggleStatus: (post: BlogPost) => void;
  onDelete: (post: BlogPost) => void;
}

/** Desktop table view (hidden below md). */
export function PostsTable({
  posts,
  onEdit,
  onToggleStatus,
  onDelete,
}: PostListProps) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Image</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Views</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence>
            {posts.map((post) => (
              <motion.tr
                key={post.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="group hover:bg-secondary/40"
              >
                <TableCell>
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-secondary/50">
                    {post.cover_image_url ? (
                      <img
                        src={post.cover_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground opacity-50" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span className="max-w-[200px] truncate lg:max-w-[300px]">
                      {post.title}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      /{post.slug}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={post.published ? "default" : "secondary"}
                    className={
                      post.published
                        ? "border-primary/20 bg-primary/15 text-primary hover:bg-primary/25"
                        : ""
                    }
                  >
                    {post.published ? "Published" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {post.views?.toLocaleString() || 0}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    {format(
                      new Date(post.updated_at || new Date()),
                      "MMM dd, yyyy",
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onEdit(post)}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onEdit(post)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleStatus(post)}>
                          {post.published ? (
                            <>
                              <FileText className="mr-2 h-4 w-4" /> Unpublish
                            </>
                          ) : (
                            <>
                              <Eye className="mr-2 h-4 w-4" /> Publish
                            </>
                          )}
                        </DropdownMenuItem>
                        {post.published && (
                          <DropdownMenuItem asChild>
                            <a
                              href={`/blog/view?slug=${post.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" /> View
                              Live
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDelete(post)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </motion.tr>
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

/** Mobile card view (hidden at md and up). */
export function PostCards({
  posts,
  onEdit,
  onToggleStatus,
  onDelete,
}: PostListProps) {
  return (
    <div className="space-y-3 md:hidden">
      <AnimatePresence>
        {posts.map((post) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {post.cover_image_url && (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-secondary/50">
                      <img
                        src={post.cover_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-start justify-between">
                      <h3 className="truncate pr-2 text-sm font-semibold">
                        {post.title}
                      </h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Post actions"
                            className="-mr-2 -mt-1 h-6 w-6"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(post)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onToggleStatus(post)}
                          >
                            {post.published ? "Unpublish" : "Publish"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onDelete(post)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mb-2 flex items-center gap-2">
                      <Badge
                        variant={post.published ? "default" : "secondary"}
                        className={cn(
                          "h-5 px-1.5 text-[10px]",
                          post.published
                            ? "border-primary/20 bg-primary/15 text-primary"
                            : "",
                        )}
                      >
                        {post.published ? "Published" : "Draft"}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        /{post.slug}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Eye className="size-3" />{" "}
                        {post.views?.toLocaleString() || 0}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="size-3" />{" "}
                        {format(
                          new Date(post.updated_at || new Date()),
                          "MMM dd",
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
