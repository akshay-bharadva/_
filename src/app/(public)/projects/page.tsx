import type { Metadata } from "next";
import { siteContent } from "@/lib/site-content";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { RepoGrid } from "@/features/github/repo-grid";

export const metadata: Metadata = {
  title: siteContent.pages.projects.title,
  description: siteContent.pages.projects.description,
};

/** Bands: content (featured work) → content (repos), per the v3 IA. */
export default function Page() {
  return (
    <>
      <Band weight="content" className="density-comfortable pb-s6">
        <PageHeader
          kicker="Build log"
          title={siteContent.pages.projects.heading}
          subheading={siteContent.pages.projects.description}
        />
        <div className="mt-s8">
          <DynamicPageContent pagePath="/projects" />
        </div>
      </Band>

      <Band weight="content" aria-labelledby="repos-heading" className="pt-0">
        <h2 id="repos-heading" className="t-heading">
          Open source &amp; experiments
        </h2>
        <div className="mt-s6">
          <RepoGrid />
        </div>
      </Band>
    </>
  );
}
