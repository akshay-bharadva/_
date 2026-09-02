"use client";

import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/ui/markdown";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import type { SiteContent } from "@/types";

export function AboutPage() {
  const { data: identity, isLoading } = useGetSiteIdentityQuery();

  return (
    <Band weight="content">
      <PageHeader kicker="whoami" title="About" />

      {isLoading || !identity ? (
        <div className="grid gap-8 sm:grid-cols-[8rem_1fr]" aria-busy>
          <Skeleton className="size-32 rounded-surface" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : (
        <AboutView identity={identity} />
      )}

      <div className="mt-16">
        <DynamicPageContent pagePath="/about" />
      </div>
    </Band>
  );
}

/**
 * Picture and bio, over identity passed in rather than fetched — the part of
 * this page the settings screen controls, so the settings preview can render
 * the real thing instead of a lookalike. The CMS block below it is left to the
 * page: it has its own query and nothing in settings changes it.
 */
export function AboutView({ identity }: { identity: SiteContent }) {
  /**
   * The picture column exists only when there is a picture.
   *
   * The grid was unconditional, so with the picture switched off the bio still
   * rendered into the *second* column and the 8rem first column stayed as an
   * empty gutter — the text started a third of the way across the page for no
   * reason a reader could see. With no picture the prose simply takes the
   * band at its own reading measure, which is the layout an about page wants
   * anyway.
   */
  const showPicture = Boolean(
    identity.profile_data.show_profile_picture &&
      identity.profile_data.profile_picture_url,
  );

  return (
    <div className={cn("grid gap-8", showPicture && "sm:grid-cols-[8rem_1fr]")}>
      {showPicture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={identity.profile_data.profile_picture_url as string}
          alt={identity.profile_data.name}
          className="size-32 rounded-surface border object-cover"
        />
      )}
      <div className="max-w-prose space-y-4 leading-relaxed [&_strong]:text-foreground">
        {identity.profile_data.bio.map((paragraph, index) => (
          <Markdown key={index} className="max-w-none text-muted-foreground">
            {paragraph}
          </Markdown>
        ))}
      </div>
    </div>
  );
}
