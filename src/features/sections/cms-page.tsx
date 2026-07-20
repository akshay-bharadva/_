"use client";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "./dynamic-page-content";

/** An admin-created page: nav-link title + its CMS sections. */
export function CmsPage({
  pagePath,
  title,
}: {
  pagePath: string;
  title: string;
}) {
  return (
    <Container className="py-16 sm:py-20">
      <PageHeader kicker={pagePath} title={title} />
      <DynamicPageContent pagePath={pagePath} />
    </Container>
  );
}
