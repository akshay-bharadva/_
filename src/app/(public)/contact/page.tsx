import type { Metadata } from "next";
import { siteContent } from "@/lib/site-content";
import { ContactPage } from "@/features/contact/contact-page";

export const metadata: Metadata = {
  title: siteContent.pages.contact.title,
  description: siteContent.pages.contact.description,
};

export default function Page() {
  return <ContactPage />;
}
