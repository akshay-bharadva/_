import type { Metadata } from "next";
import { Suspense } from "react";
import { PostPage } from "@/features/blog/post-page";

export const metadata: Metadata = {
  title: "Post",
};

export default function Page() {
  // Slug arrives as ?slug= (static-export-friendly); useSearchParams requires
  // a Suspense boundary.
  return (
    <Suspense>
      <PostPage />
    </Suspense>
  );
}
