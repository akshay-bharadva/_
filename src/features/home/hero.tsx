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
import { CountUp, EASE } from "@/components/layout/motion";
import { isInternalUrl, safeImageUrl, safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import { StatusPanel } from "./status-panel";

const ROTATE_MS = 3200;

/** The largest type on the site, for the one centred composition. */
const CENTERED_NAME =
  "font-heading text-[clamp(2.75rem,1.6rem+5vw,6rem)] font-bold leading-[1.02] tracking-tighter";
/** A headline is a sentence, not a name, so it runs a step smaller. */
const CENTERED_HEADLINE =
  "font-heading text-[clamp(2.25rem,1.3rem+3.8vw,4.75rem)] font-bold leading-[1.04] tracking-tight";

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
                "flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-e1",
                "transition-[box-shadow,transform,color] duration-200 ease-enter",
                "hover:-translate-y-0.5 hover:text-primary hover:shadow-e2 motion-reduce:hover:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Two ways forward, in the order a buyer takes them: start the conversation,
 * or look at the evidence first.
 */
function Actions({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button asChild size="lg" className="group rounded-full px-7">
        <Link href="/contact">
          Start a project
          <ArrowRight
            aria-hidden
            className="ml-2 size-4 transition-transform duration-200 ease-enter group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="rounded-full px-7">
        <Link href="/showcase">See case studies</Link>
      </Button>
    </div>
  );
}

/** Who is making the promise in the headline — the founder line of a SaaS hero. */
function Byline({
  name,
  title,
  picture,
  centered,
}: {
  name: string;
  title: string;
  picture: string | null;
  centered: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", centered && "justify-center")}>
      {picture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          className="size-10 shrink-0 rounded-full object-cover shadow-e1"
        />
      )}
      <p className="min-w-0 text-base leading-snug text-muted-foreground sm:text-lg">
        <span className="font-semibold text-foreground">{name}</span>
        {title.trim() && (
          <>
            <span aria-hidden className="mx-2 text-muted-foreground/60">
              ·
            </span>
            <RotatingTitle title={title} />
          </>
        )}
      </p>
    </div>
  );
}

const PROOF_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

/**
 * Results, set as large figures across the foot of the hero — the proof a
 * SaaS page puts right under its promise. Each figure counts up once; under
 * reduced motion it is simply there. Only what the owner entered appears:
 * there is no default row of flattering numbers.
 */
function ProofStrip({
  items,
  centered,
}: {
  items: { value: string; label: string }[];
  centered: boolean;
}) {
  return (
    <ul
      aria-label="Results"
      className={cn(
        "mt-16 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-border/60 pt-10 sm:mt-20",
        PROOF_COLUMNS[items.length] ?? "lg:grid-cols-4",
        centered && "text-center",
      )}
    >
      {items.map((item, index) => (
        <li key={`${item.value}-${index}`} className="min-w-0">
          <CountUp
            value={item.value}
            className="block font-heading text-3xl font-semibold tracking-tight tabular-nums text-foreground [overflow-wrap:anywhere] sm:text-4xl"
          />
          <p className="mt-2 text-pretty text-sm leading-snug text-muted-foreground">
            {item.label}
          </p>
        </li>
      ))}
    </ul>
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
 * The opening of the home page, built like the top of a product page.
 *
 * **It leads with the promise, not the name.** A visitor decides in a few
 * seconds whether this person solves their problem; "Ada Lovelace" answers a
 * question they have not asked yet. When the owner writes a headline it is the
 * `h1`, the name and role become the byline under it, and the results strip
 * closes the band with evidence. Without a headline the name leads, as before.
 *
 * **Two compositions, chosen by what exists** — never one with a hole in it:
 * beside the status panel the copy runs down the left; without it, the hero
 * is the one centred composition on the site.
 *
 * Takes identity rather than fetching it, so the settings preview renders the
 * real hero against unsaved values.
 */
export function HeroView({ identity }: { identity: SiteContent }) {
  const reduceMotion = useReducedMotion();
  const { profile_data, social_links } = identity;
  const panel = profile_data.status_panel;
  const showPanel = Boolean(panel.show);
  const centered = !showPanel;
  const headline = profile_data.headline?.trim() ?? "";
  const proof = (profile_data.proof ?? []).filter((item) => item.value?.trim());
  const picture = profile_data.show_profile_picture
    ? safeImageUrl(profile_data.profile_picture_url)
    : null;

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  const heading = headline ? (
    <div className="min-w-0 space-y-6">
      <motion.h1
        id="hero-name"
        {...rise(0.05)}
        className={cn(
          centered ? CENTERED_HEADLINE : "t-display",
          "text-balance [overflow-wrap:anywhere]",
        )}
      >
        {headline}
      </motion.h1>
      <motion.div {...rise(0.2)}>
        <Byline
          name={profile_data.name}
          title={profile_data.title ?? ""}
          picture={picture}
          centered={centered}
        />
      </motion.div>
    </div>
  ) : (
    <div className="min-w-0">
      <h1
        id="hero-name"
        className={cn(
          centered ? CENTERED_NAME : "t-display",
          "text-balance [overflow-wrap:anywhere]",
        )}
      >
        <AnimatedName name={profile_data.name} />
      </h1>
      {profile_data.title?.trim() && (
        <motion.p
          {...rise(0.3)}
          className={cn("t-title text-balance", centered ? "mt-4" : "mt-3")}
        >
          <RotatingTitle title={profile_data.title} />
        </motion.p>
      )}
    </div>
  );

  const copy = (
    <>
      {panel.availability && (
        <motion.div {...rise(0)}>
          <AvailabilityPill label={panel.availability} />
        </motion.div>
      )}
      {heading}
      {profile_data.description && (
        <motion.div
          {...rise(0.35)}
          className={cn(
            "t-lead max-w-prose text-pretty [&_p]:m-0",
            centered && "mx-auto",
          )}
        >
          <Markdown>{profile_data.description}</Markdown>
        </motion.div>
      )}
      <motion.div {...rise(0.45)}>
        <Actions className={centered ? "justify-center" : undefined} />
      </motion.div>
      <motion.div {...rise(0.55)}>
        <SocialRow
          links={social_links ?? []}
          className={centered ? "justify-center" : undefined}
        />
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
          <div className="flex min-w-0 flex-col items-start gap-7">{copy}</div>
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
        <div
          data-composition="centered"
          className="mx-auto flex max-w-4xl flex-col items-center gap-7 text-center"
        >
          {copy}
        </div>
      )}

      {proof.length > 0 && <ProofStrip items={proof} centered={centered} />}
    </Band>
  );
}
