import type { Metadata } from "next";
import { siteContent } from "@/lib/site-content";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";

export const metadata: Metadata = {
  title: siteContent.pages.showcase.title,
  description: siteContent.pages.showcase.description,
};

export default function Page() {
  return (
    <Band weight="content" className="density-comfortable">
      <PageHeader
        kicker="Selected work"
        title={siteContent.pages.showcase.heading}
        subheading={siteContent.pages.showcase.subheading}
      />
      <DynamicPageContent pagePath="/showcase" />
    </Band>
  );
}
