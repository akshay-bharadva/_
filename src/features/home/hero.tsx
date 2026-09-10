"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import type { SiteContent } from "@/types";
import { Markdown } from "@/components/ui/markdown";
import { Button } from "@/components/ui/button";
import { socialIcon } from "@/lib/social-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Band } from "@/components/layout/band";
import { EASE } from "@/components/layout/motion";
import { isInternalUrl, safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import { StatusPanel } from "./status-panel";

const ROTATE_MS = 3200;

/**
 * The name, rising word by word out of a mask. The words stay real text
 * separated by real spaces, so the heading's accessible name is the name.
 */
function AnimatedName({ name }: { name: string }) {
  const reduceMotion = useReducedMotion();
  const words = name.split(/\s+/).filter(Boolean);
  if (reduceMotion) return <>{name}</>;

  return (
    <>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {index > 0 && " "}
          <span className="inline-block overflow-hidden pb-[0.1em] align-bottom">
            <motion.span
              className="inline-block"
              initial={{ y: "105%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.85, ease: EASE, delay: 0.1 + index * 0.08 }}
            >
              {word}
            </motion.span>
          </span>
        </Fragment>
      ))}
    </>
  );
}

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

  return (
    <span className="relative inline-block text-primary">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={parts[index]}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : -14, filter: "blur(4px)" }}
          transition={{ duration: 0.3, ease: EASE }}
          className="inline-block"
        >
          {parts[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function AvailabilityPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 py-1.5 pl-2.5 pr-3.5 text-micro font-medium text-foreground">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      {label}
    </span>
  );
}

/** The owner's channels, as named round icon buttons. */
function SocialRow({
  links,
  className,
}: {
  links: { id: string; label: string; url: string; is_visible?: boolean }[];
  className?: string;
}) {
  const visible = links
    .filter((link) => link.is_visible !== false)
    .map((link) => ({ ...link, href: safeLinkUrl(link.url) }))
    .filter((link): link is typeof link & { href: string } => Boolean(link.href));
  if (visible.length === 0) return null;

  return (
    <ul
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="Elsewhere"
    >
      {visible.map((link) => {
        const Icon = socialIcon(link.id);
        const external = !isInternalUrl(link.href);
        return (
          <li key={link.id}>
            <a
              href={link.href}
              {...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              aria-label={link.label}
              title={link.label}
              className={cn(
                "flex size-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-e1",
                "transition-[box-shadow,transform,color] duration-200 ease-enter",
                "hover:-translate-y-0.5 hover:text-primary hover:shadow-e2 motion-reduce:hover:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <Icon className="size-[1.125rem]" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Actions({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button asChild size="lg" className="group rounded-full px-7">
        <Link href="/contact">
          Get in touch
          <ArrowRight
            aria-hidden
            className="ml-2 size-4 transition-transform duration-200 ease-enter group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="rounded-full px-7">
        <Link href="/projects">See my work</Link>
      </Button>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <Band weight="feature" aria-busy>
      <div className="grid gap-16 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <div className="space-y-6">
          <Skeleton className="h-7 w-40 rounded-full" />
          <Skeleton className="h-20 w-full max-w-xl rounded-control" />
          <Skeleton className="h-12 w-2/3 rounded-control" />
          <Skeleton className="h-20 w-full max-w-prose rounded-control" />
          <div className="flex gap-3">
            <Skeleton className="h-12 w-36 rounded-full" />
            <Skeleton className="h-12 w-36 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-surface" />
      </div>
    </Band>
  );
}

/** The identity band. */
export function Hero() {
  const { data: identity, isLoading } = useGetSiteIdentityQuery();

  if (isLoading || !identity) return <HeroSkeleton />;
  return <HeroView identity={identity} />;
}

/**
 * The band itself, over identity passed in rather than fetched, so the
 * settings preview renders the real hero against unsaved form values.
 *
 * **Two compositions, chosen by what exists** — never one composition with a
 * hole in it.
 *
 *  - **With the status panel**: the asymmetric two-column band. One descending
 *    path on the left; the panel, the only raised object on the band, beside
 *    it.
 *  - **Without it**: one centred column — the hero standing alone as a
 *    composition. It is the one centred block on the site; everywhere else
 *    runs down the left edge. A left column beside a void and a split row
 *    were both tried and rejected by the owner.
 *
 * **The light.** It rises from above the band, behind the header, to the top
 * of the page. It used to start at the band's own top edge with its brightest
 * point on that edge, which drew a hard line under the header.
 */
export function HeroView({ identity }: { identity: SiteContent }) {
  const reduceMotion = useReducedMotion();
  const { profile_data, social_links } = identity;
  const panel = profile_data.status_panel;

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  const showPanel = Boolean(panel.show);

  const availability = panel.availability && (
    <motion.div {...rise(0)}>
      <AvailabilityPill label={panel.availability} />
    </motion.div>
  );
  const role = Boolean(profile_data.title?.trim()) && (
    <motion.p {...rise(0.3)} className="t-title text-balance">
      <RotatingTitle title={profile_data.title} />
    </motion.p>
  );
  const details = (
    <>
      {profile_data.description && (
        <motion.div
          {...rise(0.4)}
          className="t-lead max-w-prose text-pretty [&_p]:m-0"
        >
          <Markdown>{profile_data.description}</Markdown>
        </motion.div>
      )}
      <motion.div {...rise(0.5)}>
        <Actions />
      </motion.div>
      <motion.div {...rise(0.6)}>
        <SocialRow links={social_links ?? []} />
      </motion.div>
    </>
  );

  return (
    <Band
      weight="feature"
      aria-labelledby="hero-name"
      className="relative isolate"
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-48 -z-10 h-[52rem]",
          showPanel
            ? "bg-[radial-gradient(55%_50%_at_20%_30%,hsl(var(--primary)/0.13),transparent_72%)]"
            : "bg-[radial-gradient(50%_50%_at_50%_30%,hsl(var(--primary)/0.14),transparent_72%)]",
        )}
      />

      {showPanel ? (
        <div
          data-composition="panel"
          className="grid gap-16 lg:grid-cols-[1.35fr_1fr] lg:items-center"
        >
          <div className="flex min-w-0 flex-col items-start gap-7">
            {availability}
            <div className="min-w-0">
              <h1
                id="hero-name"
                className="t-display text-balance [overflow-wrap:anywhere]"
              >
                <AnimatedName name={profile_data.name} />
              </h1>
              {role && <div className="mt-3">{role}</div>}
            </div>
            {details}
          </div>
          <motion.div
            className="min-w-0"
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 24, scale: 0.98 },
                  animate: { opacity: 1, y: 0, scale: 1 },
                  transition: { duration: 0.8, ease: EASE, delay: 0.35 },
                })}
          >
            <StatusPanel panel={panel} />
          </motion.div>
        </div>
      ) : (
        /*
          Without the panel the hero stands alone, so it centres — the one
          place on the site that does. Everything else runs down the left
          edge; a standalone opener with nothing beside it reads as a
          composition rather than as a column with a void.
        */
        <div
          data-composition="centered"
          className="mx-auto flex max-w-4xl flex-col items-center gap-7 text-center"
        >
          {availability}
          <div className="min-w-0">
            <h1
              id="hero-name"
              className="font-heading text-[clamp(2.75rem,1.6rem+5vw,6rem)] font-bold leading-[1.02] tracking-tighter text-balance [overflow-wrap:anywhere]"
            >
              <AnimatedName name={profile_data.name} />
            </h1>
            {role && <div className="mt-4">{role}</div>}
          </div>
          {profile_data.description && (
            <motion.div
              {...rise(0.4)}
              className="t-lead mx-auto max-w-prose text-pretty [&_p]:m-0"
            >
              <Markdown>{profile_data.description}</Markdown>
            </motion.div>
          )}
          <motion.div {...rise(0.5)}>
            <Actions className="justify-center" />
          </motion.div>
          <motion.div {...rise(0.6)}>
            <SocialRow links={social_links ?? []} className="justify-center" />
          </motion.div>
        </div>
      )}
    </Band>
  );
}
