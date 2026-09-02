"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { socialIcon } from "@/lib/social-icons";
import type { SiteContent } from "@/types";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { safeLinkUrl } from "@/lib/safe-url";

/**
 * Footer.
 *
 * v3: a quiet closing band. The v2 terminal status line and dotted rule are
 * gone; separation from the page above is space plus the band's own ground.
 *
 * Kept: the markdown copyright and the 5-click "©" easter egg that opens
 * /admin — both are behaviour, not decoration.
 */
export default function PublicFooter() {
  const router = useRouter();
  const { data: identity, isLoading } = useGetSiteIdentityQuery();
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
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>
      </Band>
    );
  }

  return (
    <FooterView
      identity={identity}
      onSecretTap={() => setClickCount((count) => count + 1)}
    />
  );
}

/**
 * The footer over identity passed in rather than fetched.
 *
 * The same view/container split as `HeroView`, `AboutView` and `ContactView`,
 * and for the same reason: the settings preview has to render the *real*
 * footer against unsaved form values, or the footer you are editing is not the
 * one you are looking at. A lookalike would be a second copy of the design to
 * keep in step, and the copy you judged your changes against would be the one
 * that never shipped.
 *
 * The five-tap admin shortcut is a prop, so the preview can render the footer
 * without wiring a gesture that would navigate out of the settings screen and
 * lose whatever was unsaved.
 */
export function FooterView({
  identity,
  onSecretTap,
}: {
  identity: SiteContent;
  onSecretTap?: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const { profile_data, social_links, footer_data } = identity;

  return (
    <Band as="footer" weight="content">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <span onClick={onSecretTap} className="cursor-default select-none">
              &copy; {currentYear}
            </span>{" "}
            <span className="font-medium text-foreground">
              {profile_data.name}
            </span>
          </p>
          {footer_data.copyright_text && (
            // Opts out of the `.markdown` defaults it shouldn't inherit: the
            // copyright line stays muted, full-width, and underlines its
            // links on hover only.
            <Markdown className="max-w-none text-sm text-muted-foreground [&_a]:text-primary [&_a]:no-underline [&_a]:underline-offset-4 [&_a:hover]:underline [&_p]:m-0">
              {footer_data.copyright_text}
            </Markdown>
          )}
        </div>

        <ul className="flex items-center gap-2">
          {social_links
            .filter((social) => social.is_visible)
            .map((social) => {
              const Icon = socialIcon(social.id);
              const href = safeLinkUrl(social.url);
              if (!href) return null;
              const external = !href.startsWith("/") && !href.startsWith("#");
              return (
                <li key={social.url}>
                  <a
                    href={href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    aria-label={social.label}
                    title={social.label}
                    className="flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground shadow-e1 transition-[box-shadow,transform,color] duration-200 ease-enter hover:-translate-y-0.5 hover:text-primary hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                </li>
              );
            })}
        </ul>
      </div>
    </Band>
  );
}
