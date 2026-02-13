import type { Metadata } from "next";
import { siteContent } from "@/lib/site-content";
import { AboutPage } from "@/features/about/about-page";

export const metadata: Metadata = {
  title: siteContent.pages.about.title,
  description: siteContent.pages.about.description,
};

export default function Page() {
  return <AboutPage />;
}
