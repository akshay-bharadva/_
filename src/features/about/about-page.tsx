"use client";

import ReactMarkdown from "react-markdown";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";

export function AboutPage() {
  const { data: identity, isLoading } = useGetSiteIdentityQuery();

  return (
    <Container className="py-16 sm:py-20">
      <PageHeader kicker="whoami" title="About" />

      {isLoading || !identity ? (
        <div className="grid gap-8 sm:grid-cols-[8rem_1fr]" aria-busy>
          <Skeleton className="size-32 rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-[8rem_1fr]">
          {identity.profile_data.show_profile_picture &&
            identity.profile_data.profile_picture_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.profile_data.profile_picture_url}
                alt={identity.profile_data.name}
                className="size-32 rounded-lg border object-cover"
              />
            )}
          <div className="markdown max-w-none space-y-4 leading-relaxed text-muted-foreground [&_strong]:text-foreground">
            {identity.profile_data.bio.map((paragraph, index) => (
              <ReactMarkdown key={index}>{paragraph}</ReactMarkdown>
            ))}
          </div>
        </div>
      )}

      <div className="mt-16">
        <DynamicPageContent pagePath="/about" />
      </div>
    </Container>
  );
}
