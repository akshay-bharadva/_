"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { safeLinkUrl } from "@/lib/safe-url";

/**
 * The closing accent band.
 *
 * This is the only tinted band on the home page — accent weight is what makes
 * it read as an ending rather than as one more content section. Left-aligned
 * and asymmetric: v3 does not centre a full-width block of text.
 */
export function ContactCta() {
  const { data: identity } = useGetSiteIdentityQuery();
  const email = identity?.social_links.find(
    (social) => social.id.toLowerCase() === "email" && social.is_visible,
  );
  const emailHref = safeLinkUrl(email?.url);

  return (
    <Band weight="accent" aria-labelledby="cta-heading">
      <div className="flex flex-col gap-s6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-prose">
          <p className="t-eyebrow">Next step</p>
          <h2 id="cta-heading" className="t-title mt-s2 text-balance">
            Let&apos;s build something that ships.
          </h2>
          <p className="t-lead mt-s3 text-pretty">
            Have a project, a role, or just a question — my inbox is open.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-s3">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-2 rounded-control bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
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
              className="inline-flex items-center gap-2 rounded-control bg-card px-5 py-3 text-sm font-medium shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
            >
              <Mail className="size-4" aria-hidden />
              Email me
            </a>
          )}
        </div>
      </div>
    </Band>
  );
}
