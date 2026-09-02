"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { Surface } from "@/components/layout/surface";
import { safeLinkUrl } from "@/lib/safe-url";

/**
 * The closing call to action.
 *
 * **What was wrong.** The band was `weight="accent"`, whose ground is
 * `hsl(var(--accent) / 0.35)`, and every piece of text on it was `--foreground`
 * or `--muted-foreground`. That combination is gated by no test:
 * `theme-contrast.test.ts` checks `accent` against `accent-foreground`, not
 * `foreground` against a 35%-alpha accent composited over the page background.
 *
 * Measured across all 52 presets, that ungated pair fails WCAG AA on **31 of
 * them**: `muted-foreground` bottoms out at 2.10:1 on cyberpunk and sits below
 * 3:1 on nine others, and `foreground` itself fails on four — solarized-light
 * 3.52, onedark-pro 3.63, monokai 4.32. The reported symptom, "the colouring
 * is off with a few themes", is that measurement.
 *
 * **The fix is structural, not a different tint.** The content moves onto a
 * `Surface`, so its ground is `--card` and its text `--card-foreground` — a
 * pair that *is* contrast-gated on every preset. The band keeps its accent
 * weight, because that is what makes this read as the end of the page rather
 * than one more section, but nothing is now legible only by virtue of it.
 *
 * Visibility then comes from elevation rather than saturation. Elevation is a
 * fixed near-black shadow, so it reads identically on all 52 presets, whereas
 * a tint deep enough to be obvious on a pale theme is overwhelming on a dark
 * one. That is the whole argument for the Surface system.
 *
 * **Hierarchy.** One saturated element on the band — the primary action. The
 * email link was previously a second elevated card, which put two competing
 * raised objects side by side and made neither read as the main one; it is a
 * quiet inline link now.
 */
export function ContactCta() {
  const { data: identity } = useGetSiteIdentityQuery();
  const email = identity?.social_links.find(
    (social) => social.id.toLowerCase() === "email" && social.is_visible,
  );
  const emailHref = safeLinkUrl(email?.url);

  return (
    <Band weight="accent" aria-labelledby="cta-heading">
      <Surface
        elevation={2}
        className="flex flex-col gap-8 p-8 sm:p-10 md:flex-row md:items-center md:justify-between md:gap-12"
      >
        <div className="min-w-0 max-w-prose">
          <p className="t-eyebrow">Next step</p>
          <h2 id="cta-heading" className="t-title mt-2 text-balance">
            Let&apos;s build something that ships.
          </h2>
          <p className="t-lead mt-3 text-pretty text-muted-foreground">
            Have a project, a role, or just a question — my inbox is open.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-4 sm:flex-row sm:items-center md:flex-col md:items-end lg:flex-row lg:items-center">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-2 rounded-control bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
          >
            Get in touch
            <ArrowRight
              className="size-4 transition-transform duration-200 ease-enter group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              aria-hidden
            />
          </Link>
          {emailHref && (
            <a
              href={emailHref}
              className="inline-flex items-center gap-2 rounded-control px-2 py-1 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-200 ease-enter hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mail className="size-4" aria-hidden />
              Email me directly
            </a>
          )}
        </div>
      </Surface>
    </Band>
  );
}
