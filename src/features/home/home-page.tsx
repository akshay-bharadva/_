"use client";

import { Band } from "@/components/layout/band";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { ContactCta } from "./contact-cta";
import { Hero } from "./hero";
import { useVisitNotifier } from "./use-visit-notifier";

/**
 * Home, as a band sequence: feature (identity) → content (CMS sections) →
 * accent (contact).
 *
 * The weights alternate deliberately. Previously every section below the hero
 * rendered inside one uniform container at one weight, which is why the page
 * read as an undifferentiated stack.
 */
export function HomePage() {
  useVisitNotifier();

  return (
    <>
      <Hero />
      <Band weight="content" className="density-comfortable">
        <DynamicPageContent pagePath="/" />
      </Band>
      <ContactCta />
    </>
  );
}
