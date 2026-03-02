import type { Metadata } from "next";
import { Suspense } from "react";
import { siteContent } from "@/lib/site-content";
import { BlogListPage } from "@/features/blog/blog-list-page";

export const metadata: Metadata = {
  title: siteContent.pages.blog.title,
  description: siteContent.pages.blog.description,
};

export default function Page() {
  return (
    // useSearchParams (initial ?tag= filter) requires a Suspense boundary
    // under static export.
    <Suspense>
      <BlogListPage />
    </Suspense>
  );
}
