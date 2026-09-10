"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { Reveal } from "@/components/layout/motion";
import { Button } from "@/components/ui/button";
import { safeLinkUrl } from "@/lib/safe-url";

/**
 * The closing invitation — one more section of the page, not a banner.
 *
 * It sits on the page ground, on the same left edge and at the same heading
 * size as every section title above it, so the home page reads as one flow
 * from the hero to here. Earlier versions put it on a tinted accent band
 * inside a raised card; the owner rejected them as a banner interrupting the
 * page. Without the tint, the contrast problem that required the card is gone
 * too: text on the plain ground uses the pairs every preset is gated on.
 *
 * Hierarchy is the heading and one primary action. Email is the secondary
 * action, offered only when a visible email exists.
 */
export function ContactCta() {
  const { data: identity } = useGetSiteIdentityQuery();
  const email = identity?.social_links.find(
    (social) => social.id.toLowerCase() === "email" && social.is_visible,
  );
  const emailHref = safeLinkUrl(email?.url);
  const availability = identity?.profile_data?.status_panel?.availability?.trim();

  return (
    <Band weight="content" aria-labelledby="cta-heading">
      <Reveal>
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="t-eyebrow">Next step</p>
            <h2
              id="cta-heading"
              className="t-heading mt-2 text-balance [overflow-wrap:anywhere]"
            >
              Let&apos;s build something that ships.
            </h2>
            <p className="mt-3 max-w-prose text-pretty leading-relaxed text-muted-foreground">
              Have a project, a role, or just a question — my inbox is open.
            </p>
            {availability && (
              <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium">
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-chart-2/60 motion-reduce:hidden" />
                  <span className="relative size-2 rounded-full bg-chart-2" />
                </span>
                {availability}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button asChild size="lg" className="group rounded-full px-7">
              <Link href="/contact">
                Get in touch
                <ArrowRight
                  aria-hidden
                  className="ml-2 size-4 transition-transform duration-200 ease-enter group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </Button>
            {emailHref && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full px-6"
              >
                <a href={emailHref}>
                  <Mail className="mr-2 size-4" aria-hidden />
                  Email me directly
                </a>
              </Button>
            )}
          </div>
        </div>
      </Reveal>
    </Band>
  );
}
