"use client";

import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { socialIcon } from "@/lib/social-icons";
import { siteContent } from "@/lib/site-content";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import type { SiteContent } from "@/types";
import { ContactForm } from "./contact-form";

export function ContactPage() {
  const { data: identity } = useGetSiteIdentityQuery();

  return (
    <ContactView
      identity={identity}
      form={<ContactForm />}
      services={<DynamicPageContent pagePath="/contact" />}
    />
  );
}

/**
 * The contact page over identity passed in rather than fetched, with the two
 * blocks that carry their own data supplied as slots.
 *
 * Split this way for the settings preview. The three switches in settings
 * decide whether the form, the badge and the services block appear — so the
 * preview has to render the same layout and the same conditions, but must not
 * render a *working* submit button or fire the CMS sections query. Slots let
 * the real page pass the real components and the preview pass inert
 * stand-ins, with one copy of the arrangement between them.
 */
export function ContactView({
  identity,
  form,
  services,
}: {
  identity: SiteContent | undefined;
  form: ReactNode;
  services: ReactNode;
}) {
  const toggles = identity?.profile_data.contact_page;
  const showForm = toggles?.show_contact_form ?? true;
  const showBadge = toggles?.show_availability_badge ?? true;
  const showServices = toggles?.show_services ?? true;

  /**
   * Only links that are visible *and* have a usable URL. `safeLinkUrl` was
   * previously applied inside the map, which meant a link with an unsafe or
   * empty URL still counted toward "are there any socials" and rendered as an
   * invisible list item — so a page with one broken link showed a heading over
   * nothing.
   */
  const socials = (identity?.social_links ?? [])
    .filter((social) => social.is_visible)
    .map((social) => ({ ...social, href: safeLinkUrl(social.url) }))
    .filter((social): social is typeof social & { href: string } =>
      Boolean(social.href),
    );

  const hasSocials = socials.length > 0;

  /**
   * The information architecture, decided by what exists.
   *
   * Three fixes in one arrangement:
   *
   *  1. **Availability moved out of the aside.** It is context for the whole
   *     page — whether writing at all is worth it — not a footnote beside the
   *     links. In the old order a phone reader met the entire form before
   *     learning the answer, because the aside came second in the source.
   *  2. **No heading over an empty list.** "Direct lines" rendered whether or
   *     not there was a single link under it.
   *  3. **The grid is chosen, not assumed.** `lg:grid-cols-[3fr_2fr]` was
   *     unconditional, so with no links and no badge the form sat at 60% width
   *     beside an empty column. With one side absent the other takes the band.
   */
  const twoColumn = showForm && hasSocials;

  return (
    <Band weight="content">
      <PageHeader
        kicker="Open channel"
        title={siteContent.pages.contact.heading}
        subheading={siteContent.pages.contact.subheading}
      />

      {showBadge && (
        <p className="t-micro mb-10 flex items-center gap-2.5">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {identity?.profile_data.status_panel.availability ||
            "Available for work"}
        </p>
      )}

      <div className={cn("grid gap-12", twoColumn && "lg:grid-cols-[3fr_2fr]")}>
        {showForm && (
          <section aria-label="Contact form" className="min-w-0">
            {form}
          </section>
        )}

        {hasSocials && (
          <aside className="min-w-0">
            <h2 className="t-eyebrow mb-4">Direct lines</h2>
            <ul
              className={cn(
                "space-y-2.5",
                // With no form beside them the links would otherwise run the
                // full band width as one very wide row each.
                !showForm && "sm:grid sm:grid-cols-2 sm:gap-2.5 sm:space-y-0",
              )}
            >
              {socials.map((social) => {
                const Icon = socialIcon(social.id);
                return (
                  <li key={social.id}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Was `hover:border-primary/50` on a surface with no
                      // border — a dead class. A surface is a fill plus an
                      // elevation, so the hover has to move the elevation.
                      className="flex items-center gap-3 rounded-surface bg-card px-4 py-3 text-sm shadow-e1 transition-[box-shadow,color] duration-200 ease-enter hover:text-primary hover:shadow-e2"
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{social.label}</span>
                      <ArrowUpRight
                        className="ml-auto size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>

      {showServices && <div className="mt-20">{services}</div>}
    </Band>
  );
}
