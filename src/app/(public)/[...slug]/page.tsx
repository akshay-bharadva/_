import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/config";
import { supabase } from "@/supabase/client";
import { MOCK_NAV_LINKS } from "@/lib/fallback-data";
import { CmsPage } from "@/features/sections/cms-page";

// Static pages that have dedicated routes and must never be generated here.
const RESERVED_SEGMENTS = [
  "admin",
  "blog",
  "projects",
  "about",
  "contact",
  "showcase",
  "experience",
  "updates",
  "404",
  "500",
];

// Static export: only build-time params exist; anything else 404s.
export const dynamicParams = false;

async function getNavLinks(): Promise<{ label: string; href: string }[]> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from("navigation_links")
      .select("label, href")
      .eq("is_visible", true);
    return data ?? [];
  }
  return MOCK_NAV_LINKS;
}

function toSlug(href: string): string[] | null {
  const clean = href.replace(/^\//, "");
  const root = clean.split("/")[0];
  if (href === "/" || !clean || RESERVED_SEGMENTS.includes(root)) return null;
  return clean.split("/");
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const links = await getNavLinks();
  const params = links
    .map((link) => toSlug(link.href))
    .filter((slug): slug is string[] => slug !== null)
    .map((slug) => ({ slug }));
  // `output: export` rejects an empty result as "missing generateStaticParams";
  // when no custom CMS pages exist, emit one unlinked sentinel path instead.
  return params.length > 0 ? params : [{ slug: ["_"] }];
}

async function pageTitle(slug: string[]): Promise<string> {
  const pagePath = `/${slug.join("/")}`;
  const links = await getNavLinks();
  const label = links.find((link) => link.href === pagePath)?.label;
  if (label) return label;
  const last = slug[slug.length - 1] ?? "";
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] };
}): Promise<Metadata> {
  return { title: await pageTitle(params.slug) };
}

export default async function Page({
  params,
}: {
  params: { slug: string[] };
}) {
  const title = await pageTitle(params.slug);
  return <CmsPage pagePath={`/${params.slug.join("/")}`} title={title} />;
}
