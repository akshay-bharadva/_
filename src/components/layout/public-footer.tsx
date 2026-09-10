"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The font size that makes a line of text exactly fill a box, from one
 * measurement taken at a known size. A hair under the exact fit, so sub-pixel
 * rounding never clips the last glyph.
 */
export function fitFontSize(
  textWidth: number,
  boxWidth: number,
  measuredAt: number,
): number | null {
  if (textWidth <= 0 || boxWidth <= 0) return null;
  return Math.floor(((measuredAt * boxWidth) / textWidth) * 0.985 * 100) / 100;
}

/** First paint, before measurement: small enough never to clip. */
function wordmarkFallback(text: string): string {
  return `min(14rem, ${(110 / Math.max(text.length, 4)).toFixed(2)}vw)`;
}

/**
 * The closing wordmark, fitted to the band by measurement.
 *
 * Sizing it from its character count was a guess, and it guessed wrong both
 * ways: a bold display face has wide glyphs, so "akshay.dev" overran and lost
 * its last letter, while a short name stopped at the ceiling and filled only
 * part of the band. Measuring the rendered text once, at a known size, gives
 * the exact size for this face and this width; it is refitted when the band
 * resizes and again once web fonts finish loading.
 */
function Wordmark({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;

    const MEASURE_AT = 100;
    const fit = () => {
      const previous = el.style.fontSize;
      el.style.fontSize = `${MEASURE_AT}px`;
      const next = fitFontSize(
        el.getBoundingClientRect().width,
        box.clientWidth,
        MEASURE_AT,
      );
      el.style.fontSize = previous;
      if (next !== null) setSize(next);
    };

    fit();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(fit);
      observer.observe(box);
    }
    void document.fonts?.ready.then(fit);
    return () => observer?.disconnect();
  }, [text]);

  return (
    <div ref={boxRef} className="w-full">
      <span
        ref={textRef}
        aria-hidden
        data-wordmark
        className="pointer-events-none inline-block select-none whitespace-nowrap bg-gradient-to-b from-foreground/[0.14] via-foreground/[0.07] to-transparent bg-clip-text pb-[0.12em] font-heading font-bold leading-none tracking-tighter text-transparent"
        style={{ fontSize: size !== null ? `${size}px` : wordmarkFallback(text) }}
      >
        {text}
      </span>
    </div>
  );
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
        <Wordmark text={wordmark} />
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
