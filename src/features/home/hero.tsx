"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Markdown } from "@/components/ui/markdown";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";
import { StatusPanel } from "./status-panel";

const ROTATE_MS = 3200;

/** Cycles through `title` parts separated by `|`; static when only one. */
function RotatingTitle({ title }: { title: string }) {
  const parts = useMemo(
    () =>
      title
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean),
    [title],
  );
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  // Reset when the title changes so `index` can't point past the new parts.
  useEffect(() => {
    setIndex(0);
  }, [parts.length]);

  useEffect(() => {
    if (parts.length < 2 || prefersReducedMotion) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % parts.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [parts.length, prefersReducedMotion]);

  if (parts.length === 0) return null;

  const current = parts[index] ?? parts[0];

  return (
    <span className="relative inline-block text-primary">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="inline-block"
        >
          {current}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Hero() {
  const { data: identity, isLoading } = useGetSiteIdentityQuery();

  if (isLoading || !identity) {
    return (
      <section aria-busy className="bg-graph-paper">
        <Container className="grid gap-10 py-20 lg:grid-cols-[3fr_2fr] lg:py-28">
          <div className="space-y-5">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-14 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-56 rounded-lg" />
        </Container>
      </section>
    );
  }

  const { profile_data, social_links } = identity;
  const statusPanel = profile_data.status_panel;
  // Swap this for your real visibility flag (e.g. statusPanel?.is_visible) if you have one.
  const showStatusPanel = Boolean(statusPanel);

  const visibleSocials = social_links.filter((social) => social.is_visible);

  return (
    <section className="border-b bg-graph-paper">
      <Container
        className={cn(
          "grid items-center gap-10 py-20 lg:py-28",
          showStatusPanel && "lg:grid-cols-[3fr_2fr]",
        )}
      >
        <div className={cn(!showStatusPanel && "mx-auto w-full max-w-3xl")}>
          <p className="status-line flex items-center gap-2">
            <span aria-hidden className="text-primary">
              ●
            </span>
            {statusPanel?.availability || profile_data.title}
          </p>

          <h1 className="mt-5 font-heading text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {profile_data.name}
            <span aria-hidden className="text-primary">
              .
            </span>
            <span className="mt-2 block text-2xl font-semibold text-muted-foreground sm:text-3xl lg:text-4xl">
              <RotatingTitle title={profile_data.title} />
            </span>
          </h1>

          <Markdown className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            {profile_data.description}
          </Markdown>

          {visibleSocials.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {visibleSocials.map((social) => {
                const Icon = SOCIAL_ICONS[social.id.toLowerCase()];
                return (
                  
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border bg-card px-3.5 py-2 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {Icon && <Icon className="size-3.5" aria-hidden />}
                    {social.label}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {showStatusPanel && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
          >
            <StatusPanel panel={statusPanel} />
          </motion.div>
        )}
      </Container>
    </section>
  );
}