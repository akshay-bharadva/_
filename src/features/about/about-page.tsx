"use client";

import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
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
  return (
    <div className="grid gap-8 sm:grid-cols-[8rem_1fr]">
      {identity.profile_data.show_profile_picture &&
        identity.profile_data.profile_picture_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={identity.profile_data.profile_picture_url}
            alt={identity.profile_data.name}
            className="size-32 rounded-surface border object-cover"
          />
        )}
      <div className="space-y-4 leading-relaxed [&_strong]:text-foreground">
        {identity.profile_data.bio.map((paragraph, index) => (
          <Markdown key={index} className="max-w-none text-muted-foreground">
            {paragraph}
          </Markdown>
        ))}
      </div>
    </div>
  );
}
