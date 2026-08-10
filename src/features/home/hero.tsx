"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/layout/container";
import { StatusPanel } from "./status-panel";

const ROTATE_MS = 3200;

/** Cycles through `title` parts separated by `|`; static when only one. */
function RotatingTitle({ title }: { title: string }) {
  const parts = title
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const [index, setIndex] = useState(0);

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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="inline-block"
        >
          {parts[index]}
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

  return (
    <section className="border-b bg-graph-paper">
      <Container className="grid items-center gap-10 py-20 lg:grid-cols-[3fr_2fr] lg:py-28">
        <div>
          <p className="status-line flex items-center gap-2">
            <span aria-hidden className="text-primary">
              ●
            </span>
            {profile_data.status_panel.availability || profile_data.title}
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

          <div className="markdown mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            <ReactMarkdown>{profile_data.description}</ReactMarkdown>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {social_links
              .filter((social) => social.is_visible)
              .map((social) => {
                const Icon = SOCIAL_ICONS[social.id.toLowerCase()];
                return (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border bg-card px-3.5 py-2 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {Icon && <Icon className="size-3.5" aria-hidden />}
                    {social.label}
                  </a>
                );
              })}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
        >
          <StatusPanel panel={profile_data.status_panel} />
        </motion.div>
      </Container>
    </section>
  );
}
