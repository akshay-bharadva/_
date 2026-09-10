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
import { isInternalUrl, safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

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
      <Band as="footer" weight="content">
        <div className="rounded-surface bg-card p-8 shadow-e1 sm:p-10">
          <div className="grid gap-8 md:grid-cols-3">
            <Skeleton className="h-16 w-48" />
            <Skeleton className="h-20 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
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
 * The footer over identity passed in rather than fetched.
 *
 * The same view/container split as `HeroView`, `AboutView` and `ContactView`:
 * the settings preview renders the *real* footer against unsaved form values.
 * `links` is optional for the same reason — the preview has no navigation to
 * pass, and the footer composes from what it is given rather than reserving a
 * column for it. The five-tap shortcut is a prop so the preview never wires a
 * gesture that would navigate away from unsaved settings.
 *
 * Composition: a floating panel that answers the floating header pill, so the
 * page opens and closes on the same object. Identity on the left, the site's
 * pages and the owner's channels to the right, and one quiet row beneath for
 * the copyright and a way back up.
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
    <Band as="footer" weight="content">
      <div className="rounded-surface bg-card p-8 shadow-e1 sm:p-10">
        <div
          className={cn(
            "grid gap-10",
            pages.length > 0 && socials.length > 0
              ? "md:grid-cols-[1.5fr_1fr_1fr]"
              : pages.length > 0 || socials.length > 0
                ? "md:grid-cols-[2fr_1fr]"
                : undefined,
          )}
        >
          <div className="min-w-0 space-y-3">
            <p className="font-heading text-xl font-bold tracking-tight">
              <span className="text-foreground">{profile_data.logo?.main}</span>
              <span className="text-primary">
                {profile_data.logo?.highlight}
              </span>
            </p>
            {role && (
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                {role}
              </p>
            )}
            {availability && (
              <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {availability}
              </p>
            )}
          </div>

          {pages.length > 0 && (
            <nav aria-label="Footer" className="min-w-0">
              <p className="t-micro">Explore</p>
              <ul className="mt-4 space-y-2.5">
                {pages.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "rounded-control text-sm text-foreground/80 transition-colors duration-200 hover:text-primary",
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
            <div className="min-w-0">
              <p className="t-micro">Elsewhere</p>
              <ul className="mt-4 flex flex-wrap gap-2">
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
                          "flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground",
                          "transition-[background-color,color,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground motion-reduce:hover:translate-y-0",
                          FOCUS,
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
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
              "group inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors duration-200 hover:bg-secondary/70 sm:self-auto",
              FOCUS,
            )}
          >
            <ArrowUp
              className="size-4 transition-transform duration-200 ease-enter group-hover:-translate-y-0.5 motion-reduce:transition-none"
              aria-hidden
            />
            Back to top
          </button>
        </div>
      </div>
    </Band>
  );
}
