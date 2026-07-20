import type { Metadata } from "next";
import { siteContent } from "@/lib/site-content";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { RepoGrid } from "@/features/github/repo-grid";

export const metadata: Metadata = {
  title: siteContent.pages.projects.title,
  description: siteContent.pages.projects.description,
};

export default function Page() {
  return (
    <Container className="py-16 sm:py-20">
      <PageHeader
        kicker="Build log"
        title={siteContent.pages.projects.heading}
        subheading={siteContent.pages.projects.description}
      />
      <DynamicPageContent pagePath="/projects" />
      <section aria-label="GitHub repositories" className="mt-16">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          <span aria-hidden className="section-label mr-3 align-middle text-primary">
            gh /
          </span>
          Open source & experiments
        </h2>
        <hr className="rule-dotted mb-8 mt-4" aria-hidden />
        <RepoGrid />
      </section>
    </Container>
  );
}
