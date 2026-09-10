"use client";

import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/ui/markdown";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { Reveal, Stagger, StaggerItem } from "@/components/layout/motion";
import { safeImageUrl } from "@/lib/safe-url";
import type { SiteContent } from "@/types";

export function AboutPage() {
  const { data: identity, isLoading } = useGetSiteIdentityQuery();

  return (
    <Band weight="content">
      {/* "whoami" was the v2 terminal voice. */}
      <PageHeader kicker="About" title="About me" />

      {isLoading || !identity ? (
        <div className="grid gap-10 sm:grid-cols-[15rem_1fr]" aria-busy>
          <Skeleton className="aspect-[4/5] w-full rounded-surface" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : (
        <AboutView identity={identity} />
      )}

      <div className="mt-24">
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
  const { profile_data } = identity;
  // Through the image allowlist: the URL is owner-entered TEXT rendered on a
  // public page, and a `javascript:` or `data:` value must not reach `src`.
  const picture = profile_data.show_profile_picture
    ? safeImageUrl(profile_data.profile_picture_url)
    : null;
  const showPicture = Boolean(picture);
  const role = profile_data.title?.split("|")[0]?.trim();
  const [lead, ...rest] = profile_data.bio.filter((p) => p?.trim());

  /**
   * An editorial spread: the portrait as a card that stays beside the bio on
   * a wide screen, and the bio opening on a larger first paragraph — the
   * magazine convention for "start reading here".
   */
  return (
    <div
      className={cn(
        "grid gap-10 lg:gap-16",
        showPicture && "sm:grid-cols-[minmax(0,15rem)_1fr] lg:grid-cols-[18rem_1fr]",
      )}
    >
      {showPicture && (
        <Reveal className="sm:sticky sm:top-28 sm:self-start">
          <figure className="overflow-hidden rounded-surface bg-card shadow-e2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={picture as string}
              alt={profile_data.name}
              className="aspect-[4/5] w-full object-cover"
            />
            <figcaption className="p-5">
              <p className="font-heading font-semibold [overflow-wrap:anywhere]">
                {profile_data.name}
              </p>
              {role && (
                <p className="mt-0.5 text-sm text-muted-foreground">{role}</p>
              )}
            </figcaption>
          </figure>
        </Reveal>
      )}
      <Stagger className="min-w-0 max-w-prose space-y-5 [&_strong]:text-foreground">
        {lead && (
          <StaggerItem>
            <Markdown className="max-w-none text-lg leading-relaxed text-foreground sm:text-xl [&_p]:m-0">
              {lead}
            </Markdown>
          </StaggerItem>
        )}
        {rest.map((paragraph, index) => (
          <StaggerItem key={index}>
            <Markdown className="max-w-none leading-relaxed text-muted-foreground">
              {paragraph}
            </Markdown>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
