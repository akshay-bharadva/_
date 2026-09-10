"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { socialIcon } from "@/lib/social-icons";
import type { SiteContent } from "@/types";
import {
  useGetNavLinksQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { Reveal } from "@/components/layout/motion";
import { isInternalUrl, safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Footer.
 *
 * Kept: the markdown copyright and the 5-tap "©" easter egg that opens
 * /admin — both are behaviour, not decoration.
 */
export default function PublicFooter() {
  const router = useRouter();
  const { data: identity, isLoading } = useGetSiteIdentityQuery();
  const { data: links } = useGetNavLinksQuery();
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    if (clickCount === 0) return;
    const timer = setTimeout(() => setClickCount(0), 1000);
    if (clickCount === 5) {
      toast.success("Initializing Admin Sequence...");
      router.push("/admin");
      setClickCount(0);
    }
    return () => clearTimeout(timer);
  }, [clickCount, router]);

  if (isLoading || !identity) {
    return (
      <Band as="footer" weight="content" className="border-t border-border/60 !pt-16">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-16 w-64" />
        </div>
        <Skeleton className="mt-16 h-24 w-full rounded-control" />
      </Band>
    );
  }

  return (
    <FooterView
      identity={identity}
      links={links}
      onSecretTap={() => setClickCount((count) => count + 1)}
    />
  );
}

/**
 * The size of the closing wordmark, from its length.
 *
 * The name is set to run nearly the full width of the band whatever its
 * length — a short one would otherwise float small in the middle and a long
 * one would be cropped. A glyph is roughly 0.6em wide in a bold display face,
 * so `140 / length` vw lands it close to the band's measure; the ceiling
 * keeps a very short name from turning into a poster.
 */
export function wordmarkSize(text: string): string {
  const length = Math.max(text.length, 6);
  return `min(11rem, ${(140 / length).toFixed(2)}vw)`;
}

/**
 * The footer over identity passed in rather than fetched.
 *
 * The same view/container split as `HeroView`, `AboutView` and `ContactView`:
 * the settings preview renders the *real* footer against unsaved form values.
 * `links` is optional for the same reason — the preview has no navigation to
 * pass, and the footer composes from what it is given. The five-tap shortcut
 * is a prop so the preview never wires a gesture that would navigate away
 * from unsaved settings.
 *
 * Composition: an open sign-off on the page ground rather than a boxed panel.
 * A fine rule, then who and where — identity on the left, the site's pages and
 * the owner's channels on the right — then the name set very large across the
 * band, fading into the page, as a signature. One quiet row closes it.
 */
export function FooterView({
  identity,
  links,
  onSecretTap,
}: {
  identity: SiteContent;
  links?: { label: string; href: string }[];
  onSecretTap?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const currentYear = new Date().getFullYear();
  const { profile_data, social_links, footer_data } = identity;

  const logo = profile_data.logo;
  const wordmark =
    `${logo?.main ?? ""}${logo?.highlight ?? ""}`.trim() || profile_data.name;
  const role = profile_data.title?.split("|")[0]?.trim();
  const availability = profile_data.status_panel?.availability?.trim();
  const pages = (links ?? []).filter((link) => safeLinkUrl(link.href));
  const socials = social_links
    .filter((social) => social.is_visible)
    .map((social) => ({ ...social, href: safeLinkUrl(social.url) }))
    .filter((social): social is typeof social & { href: string } =>
      Boolean(social.href),
    );

  return (
    <Band
      as="footer"
      weight="content"
      // Footer follows a same-ground band, whose shared padding collapses; the
      // rule needs its own room above the content.
      className="relative overflow-hidden border-t border-border/60 !pb-0 !pt-16"
    >
      <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-sm space-y-3">
          <p className="font-heading text-lg font-bold tracking-tight">
            <span className="text-foreground">{logo?.main}</span>
            <span className="text-primary">{logo?.highlight}</span>
          </p>
          {role && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {role}
            </p>
          )}
          {availability && (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-chart-2/60 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-chart-2" />
              </span>
              {availability}
            </p>
          )}
        </div>

        {(pages.length > 0 || socials.length > 0) && (
          <div className="flex flex-col gap-10 sm:flex-row sm:gap-20">
            {pages.length > 0 && (
              <nav aria-label="Footer">
                <ul className="grid grid-cols-2 gap-x-12 gap-y-3">
                  {pages.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn(
                          // An underline that draws itself from the left.
                          "bg-gradient-to-r from-primary to-primary bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 text-sm text-foreground/80",
                          "transition-[background-size,color] duration-300 ease-enter hover:bg-[length:100%_1px] hover:text-foreground motion-reduce:transition-none",
                          "rounded-sm",
                          FOCUS,
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {socials.length > 0 && (
              <ul className="-ml-2 flex flex-wrap gap-1 sm:ml-0">
                {socials.map((social) => {
                  const Icon = socialIcon(social.id);
                  const external = !isInternalUrl(social.href);
                  return (
                    <li key={social.url}>
                      <a
                        href={social.href}
                        {...(external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        aria-label={social.label}
                        title={social.label}
                        className={cn(
                          "flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground",
                          FOCUS,
                        )}
                      >
                        <Icon className="size-[1.125rem]" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* The sign-off: the name across the band, fading into the ground. */}
      <Reveal className="mt-16 sm:mt-20">
        <p
          aria-hidden
          data-wordmark
          className="pointer-events-none select-none whitespace-nowrap bg-gradient-to-b from-foreground/[0.14] via-foreground/[0.07] to-transparent bg-clip-text pb-2 font-heading font-bold leading-[0.85] tracking-tighter text-transparent"
          style={{ fontSize: wordmarkSize(wordmark) }}
        >
          {wordmark}
        </p>
      </Reveal>

      <div className="flex flex-col gap-4 border-t border-border/60 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p>
            <span onClick={onSecretTap} className="cursor-default select-none">
              &copy; {currentYear}
            </span>{" "}
            <span className="font-medium text-foreground">
              {profile_data.name}
            </span>
          </p>
          {footer_data.copyright_text && (
            <Markdown className="max-w-none text-sm text-muted-foreground [&_a]:text-primary [&_a]:no-underline [&_a]:underline-offset-4 [&_a:hover]:underline [&_p]:m-0">
              {footer_data.copyright_text}
            </Markdown>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
          }
          className={cn(
            "group inline-flex shrink-0 items-center gap-2 self-start rounded-full py-1 font-medium text-foreground/80 transition-colors duration-200 hover:text-foreground sm:self-auto",
            FOCUS,
          )}
        >
          Back to top
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowUp
              className="size-4 transition-transform duration-200 ease-enter group-hover:-translate-y-0.5 motion-reduce:transition-none"
              aria-hidden
            />
          </span>
        </button>
      </div>
    </Band>
  );
}
