"use client";

import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import { siteContent } from "@/lib/site-content";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { ContactForm } from "./contact-form";

export function ContactPage() {
  const { data: identity } = useGetSiteIdentityQuery();
  const toggles = identity?.profile_data.contact_page;
  const showForm = toggles?.show_contact_form ?? true;
  const showBadge = toggles?.show_availability_badge ?? true;
  const showServices = toggles?.show_services ?? true;

  const socials = (identity?.social_links ?? []).filter(
    (social) => social.is_visible,
  );

  return (
    <Container className="py-16 sm:py-20">
      <PageHeader
        kicker="Open channel"
        title={siteContent.pages.contact.heading}
        subheading={siteContent.pages.contact.subheading}
      />

      <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
        {showForm && (
          <section aria-label="Contact form">
            <ContactForm />
          </section>
        )}

        <aside className={showForm ? "" : "lg:col-span-2"}>
          {showBadge && (
            <p className="status-line mb-6 flex items-center gap-2.5">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {identity?.profile_data.status_panel.availability ||
                "Available for work"}
            </p>
          )}

          <h2 className="section-label mb-4">Direct lines</h2>
          <ul className="space-y-2.5">
            {socials.map((social) => {
              const Icon = SOCIAL_ICONS[social.id.toLowerCase()];
              return (
                <li key={social.id}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {Icon && <Icon className="size-4" aria-hidden />}
                    {social.label}
                    <span aria-hidden className="ml-auto font-mono text-xs text-muted-foreground">
                      →
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {showServices && (
        <div className="mt-20">
          <DynamicPageContent pagePath="/contact" />
        </div>
      )}
    </Container>
  );
}
