"use client";

import { useGetSectionsByPathQuery } from "@/store/api/publicApi";
import { Skeleton } from "@/components/ui/skeleton";
import SectionRenderer from "./section-renderer";

/** All visible CMS sections for a page path, in display order. */
export function DynamicPageContent({
  pagePath,
  startIndex = 0,
}: {
  pagePath: string;
  /** Offset for the "01 /" ordinals when the page has sections above these. */
  startIndex?: number;
}) {
  const {
    data: sections,
    isLoading,
    isError,
  } = useGetSectionsByPathQuery(pagePath);

  if (isLoading) {
    return (
      <div className="space-y-10" aria-busy>
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (isError || !sections?.length) return null;

  return (
    <div className="space-y-16">
      {sections.map((section, index) => (
        <SectionRenderer
          key={section.id}
          section={section}
          index={startIndex + index}
        />
      ))}
    </div>
  );
}
