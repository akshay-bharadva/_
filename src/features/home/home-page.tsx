"use client";

import { Container } from "@/components/layout/container";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { ContactCta } from "./contact-cta";
import { Hero } from "./hero";
import { useVisitNotifier } from "./use-visit-notifier";

export function HomePage() {
  useVisitNotifier();

  return (
    <>
      <Hero />
      <Container className="py-16 sm:py-20">
        <DynamicPageContent pagePath="/" />
      </Container>
      <ContactCta />
    </>
  );
}
