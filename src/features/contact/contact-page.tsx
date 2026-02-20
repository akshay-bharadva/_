"use client";

import type { ReactNode } from "react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { socialIcon } from "@/lib/social-icons";
import { siteContent } from "@/lib/site-content";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { safeLinkUrl } from "@/lib/safe-url";
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

  const socials = (identity?.social_links ?? []).filter(
    (social) => social.is_visible,
  );

  return (
    <Band weight="content">
      <PageHeader
        kicker="Open channel"
        title={siteContent.pages.contact.heading}
        subheading={siteContent.pages.contact.subheading}
      />

      <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
        {showForm && <section aria-label="Contact form">{form}</section>}

        <aside className={showForm ? "" : "lg:col-span-2"}>
          {showBadge && (
            <p className="t-micro mb-6 flex items-center gap-2.5">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {identity?.profile_data.status_panel.availability ||
                "Available for work"}
            </p>
          )}

          <h2 className="t-eyebrow mb-4">Direct lines</h2>
          <ul className="space-y-2.5">
            {socials.map((social) => {
              const Icon = socialIcon(social.id);
              const href = safeLinkUrl(social.url);
              if (!href) return null;
              return (
                <li key={social.id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    // Was `hover:border-primary/50` on a surface with no border
                    // — a dead class. A surface is a fill plus an elevation, so
                    // the hover has to move the elevation.
                    className="flex items-center gap-3 rounded-surface bg-card px-4 py-3 text-sm shadow-e1 transition-[box-shadow,color] duration-200 ease-enter hover:text-primary hover:shadow-e2"
                  >
                    <Icon className="size-4" aria-hidden />
                    {social.label}
                    <span
                      aria-hidden
                      className="ml-auto font-mono text-xs text-muted-foreground"
                    >
                      →
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {showServices && <div className="mt-20">{services}</div>}
    </Band>
  );
}
