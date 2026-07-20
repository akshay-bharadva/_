"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";

/**
 * Footer — status-line motif, markdown copyright, social icons, and the
 * 5-click "©" easter egg that opens /admin.
 */
export default function PublicFooter() {
  const router = useRouter();
  const { data: identity, isLoading } = useGetSiteIdentityQuery();
  const currentYear = new Date().getFullYear();
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
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-4">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="size-4 rounded-full" />
          </div>
        </div>
      </footer>
    );
  }

  const { profile_data, social_links, footer_data } = identity;
  const availability = profile_data.status_panel?.availability;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {availability && (
          <p className="status-line mb-6 flex items-center gap-2">
            <span aria-hidden className="text-primary">
              ●
            </span>
            {availability}
          </p>
        )}

        <hr className="rule-dotted mb-6" aria-hidden />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span
                onClick={() => setClickCount((count) => count + 1)}
                className="cursor-default select-none"
              >
                &copy; {currentYear}
              </span>{" "}
              <span className="font-medium text-foreground">
                {profile_data.name}
              </span>
            </p>
            {footer_data.copyright_text && (
              <div className="text-sm [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_p]:m-0">
                <ReactMarkdown>{footer_data.copyright_text}</ReactMarkdown>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {social_links
              .filter((social) => social.is_visible)
              .map((social) => {
                const Icon = SOCIAL_ICONS[social.id.toLowerCase()];
                if (!Icon) return null;
                return (
                  <a
                    key={social.url}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    title={social.label}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                );
              })}
          </div>
        </div>
      </div>
    </footer>
  );
}
