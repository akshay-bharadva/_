import type { Metadata } from "next";
import { config as appConfig } from "@/lib/config";
import { HomePage } from "@/features/home/home-page";

export const metadata: Metadata = {
  // site.title already reads "{name} | Portfolio" — bypass the "%s | {author}"
  // root template so the home tab isn't doubled.
  title: { absolute: appConfig.site.title },
  description: appConfig.site.description,
  openGraph: {
    title: appConfig.site.title,
    description: appConfig.site.description,
    url: appConfig.site.url,
    siteName: appConfig.site.title,
    locale: "en_US",
    type: "website",
  },
};

export default function Page() {
  return <HomePage />;
}
