"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { Surface } from "@/components/layout/surface";
import { Reveal } from "@/components/layout/motion";
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
/**
 * The page ends on a statement, not a form row.
 *
 * The headline carries the card, with its closing words in the theme colour —
 * at title size, not display size: a closing card set at display size
 * outweighed the hero it answers. Beneath, one quiet row: the invitation and the owner's availability
 * on the left, the actions on the right. The primary action carries its arrow
 * in its own circle, which turns on hover to point up and out.
 */
export function ContactCta() {
  const { data: identity } = useGetSiteIdentityQuery();
  const email = identity?.social_links.find(
    (social) => social.id.toLowerCase() === "email" && social.is_visible,
  );
  const emailHref = safeLinkUrl(email?.url);
  const availability = identity?.profile_data?.status_panel?.availability?.trim();

  return (
    <Band weight="accent" aria-labelledby="cta-heading">
      <Reveal>
        <Surface
          elevation={2}
          className="relative isolate overflow-hidden p-6 sm:p-8 lg:p-10"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -right-20 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.2),transparent)]"
          />

          <p className="t-eyebrow">Next step</p>
          <h2
            id="cta-heading"
            className="t-title mt-3 max-w-3xl text-balance"
          >
            Let&apos;s build something{" "}
            <span className="text-primary">that ships.</span>
          </h2>

          <div className="mt-6 flex flex-col gap-6 border-t border-border/60 pt-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 max-w-md space-y-2">
              <p className="text-pretty leading-relaxed text-muted-foreground">
                Have a project, a role, or just a question — my inbox is open.
              </p>
              {availability && (
                <p className="inline-flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-chart-2/60 motion-reduce:hidden" />
                    <span className="relative size-2 rounded-full bg-chart-2" />
                  </span>
                  {availability}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/contact"
                className="group inline-flex items-center gap-2.5 rounded-full bg-primary py-1.5 pl-5 pr-1.5 text-sm font-semibold text-primary-foreground shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:hover:translate-y-0"
              >
                Get in touch
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-full bg-primary-foreground text-primary transition-transform duration-300 ease-enter group-hover:-rotate-45 motion-reduce:transition-none"
                >
                  <ArrowRight className="size-4" />
                </span>
              </Link>
              {emailHref && (
                <a
                  href={emailHref}
                  className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-200 ease-enter hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Mail className="size-4" aria-hidden />
                  Email me directly
                </a>
              )}
            </div>
          </div>
        </Surface>
      </Reveal>
    </Band>
  );
}
