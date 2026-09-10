"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { Surface } from "@/components/layout/surface";
import { Reveal } from "@/components/layout/motion";
import { Button } from "@/components/ui/button";
import { safeLinkUrl } from "@/lib/safe-url";

/**
 * The closing call to action.
 *
 * **Why the content sits on a Surface.** The accent band's ground is
 * `hsl(var(--accent) / 0.35)`, and text straight on it fails WCAG AA on 31 of
 * the 52 presets — a pair `theme-contrast.test.ts` does not gate. On a Surface
 * the ground is `--card` and the text `--card-foreground`, which *is* gated.
 * The band keeps its accent weight so it still reads as the end of the page.
 *
 * **Hierarchy.** One saturated element — the primary action. The email link is
 * quiet and inline; two raised objects side by side would make neither the
 * main one. The light inside the panel is decoration only, in the theme's own
 * colour, behind the text rather than under it.
 */
export function ContactCta() {
  const { data: identity } = useGetSiteIdentityQuery();
  const email = identity?.social_links.find(
    (social) => social.id.toLowerCase() === "email" && social.is_visible,
  );
  const emailHref = safeLinkUrl(email?.url);

  return (
    <Band weight="accent" aria-labelledby="cta-heading">
      <Reveal>
        <Surface
          elevation={2}
          className="relative isolate flex flex-col gap-8 overflow-hidden p-8 sm:p-12 md:flex-row md:items-center md:justify-between md:gap-12"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-32 -z-10 size-96 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.18),transparent)]"
          />
          <div className="min-w-0 max-w-prose">
            <p className="t-eyebrow">Next step</p>
            <h2 id="cta-heading" className="t-title mt-3 text-balance">
              Let&apos;s build something that ships.
            </h2>
            <p className="t-lead mt-4 text-pretty text-muted-foreground">
              Have a project, a role, or just a question — my inbox is open.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-4 sm:flex-row sm:items-center md:flex-col md:items-end lg:flex-row lg:items-center">
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
              <a
                href={emailHref}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-200 ease-enter hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mail className="size-4" aria-hidden />
                Email me directly
              </a>
            )}
          </div>
        </Surface>
      </Reveal>
    </Band>
  );
}
