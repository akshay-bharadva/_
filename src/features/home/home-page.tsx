"use client";

import { Band } from "@/components/layout/band";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { ContactCta } from "./contact-cta";
import { Hero } from "./hero";

/**
 * Home, as a band sequence: feature (identity) → content (CMS sections) →
 * accent (contact).
 *
 * The weights alternate deliberately. Previously every section below the hero
 * rendered inside one uniform container at one weight, which is why the page
 * read as an undifferentiated stack.
 */
export function HomePage() {
  return (
    <>
      <Hero />
      <Band weight="content">
        <DynamicPageContent pagePath="/" />
      </Band>
      <ContactCta />
    </>
  );
}
