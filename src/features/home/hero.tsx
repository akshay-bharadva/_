"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Markdown } from "@/components/ui/markdown";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Band } from "@/components/layout/band";
import { safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import { StatusPanel } from "./status-panel";

const ROTATE_MS = 3200;

/** Cycles through `title` parts separated by `|`; static when only one. */
function RotatingTitle({ title }: { title: string }) {
  const parts = title
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (parts.length < 2) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % parts.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [parts.length]);

  if (parts.length === 0) return null;

  // With reduced motion the rotation still happens — it carries content — but
  // it crossfades in place instead of travelling.
  return (
    <span className="relative inline-block text-primary">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={parts[index]}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -10 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="inline-block"
        >
          {parts[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Availability, as a soft pill on the surface rather than a terminal prompt.
 * The `● open to work — Toronto` status-line motif belongs to v2 and is retired.
 */
function AvailabilityPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-s2 rounded-full bg-primary/10 py-1.5 pl-2.5 pr-3.5 text-micro font-medium text-primary">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      {label}
    </span>
  );
}

function SocialRow({
  links,
}: {
  links: { id: string; label: string; url: string; is_visible?: boolean }[];
}) {
  const visible = links.filter((l) => l.is_visible !== false && l.url);
  if (visible.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-s2">
      {visible.map((link) => {
        const href = safeLinkUrl(link.url);
        if (!href) return null;
        const Icon = SOCIAL_ICONS[link.id as keyof typeof SOCIAL_ICONS];
        const external = !href.startsWith("/") && !href.startsWith("#");
        return (
          <li key={link.id}>
            <a
              href={href}
              {...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className={cn(
                "inline-flex items-center gap-2 rounded-control bg-card px-3 py-2 text-sm font-medium",
                "shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter",
                "hover:-translate-y-0.5 hover:shadow-e2 motion-reduce:hover:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              {Icon && <Icon className="size-4 text-muted-foreground" />}
              {link.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function HeroSkeleton() {
  return (
    <Band weight="feature" aria-busy>
      <div className="grid gap-s9 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <div className="space-y-s5">
          <Skeleton className="h-7 w-40 rounded-full" />
          <Skeleton className="h-20 w-full max-w-xl rounded-control" />
          <Skeleton className="h-12 w-2/3 rounded-control" />
          <Skeleton className="h-20 w-full max-w-prose rounded-control" />
          <div className="flex gap-s2">
            <Skeleton className="h-10 w-28 rounded-control" />
            <Skeleton className="h-10 w-28 rounded-control" />
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-surface" />
      </div>
    </Band>
  );
}

/**
 * The identity band.
 *
 * v3 composition: an asymmetric two-column feature band. The left column is a
 * single descending sequence — availability, name at display size, rotating
 * role, description, channels — so the eye has one path. The right column is a
 * floating surface carrying the status panel, which is deliberately the only
 * elevated object on the band.
 *
 * Nothing here uses the v2 grammar: no graph-paper ground, no dotted rule, no
 * monospace status line.
 */
export function Hero() {
  const { data: identity, isLoading } = useGetSiteIdentityQuery();
  const reduceMotion = useReducedMotion();

  if (isLoading || !identity) return <HeroSkeleton />;

  const { profile_data, social_links } = identity;
  const panel = profile_data.status_panel;

  const rise = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] as const },
      };

  return (
    <Band weight="feature" aria-labelledby="hero-name">
      <div className="grid gap-s9 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <motion.div {...rise} className="flex flex-col items-start gap-s5">
          {panel.availability && (
            <AvailabilityPill label={panel.availability} />
          )}

          <div>
            <h1 id="hero-name" className="t-display text-balance">
              {profile_data.name}
            </h1>
            {profile_data.title && (
              <p className="t-title mt-s2 text-balance">
                <RotatingTitle title={profile_data.title} />
              </p>
            )}
          </div>

          {profile_data.description && (
            <div className="t-lead max-w-prose text-pretty [&_p]:m-0">
              <Markdown>{profile_data.description}</Markdown>
            </div>
          )}

          <SocialRow links={social_links ?? []} />
        </motion.div>

        {panel.show && (
          <motion.div
            {...rise}
            transition={
              reduceMotion
                ? undefined
                : { duration: 0.4, delay: 0.08, ease: [0.32, 0.72, 0, 1] }
            }
          >
            <StatusPanel panel={panel} />
          </motion.div>
        )}
      </div>
    </Band>
  );
}
