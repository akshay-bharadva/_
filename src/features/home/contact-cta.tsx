"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { Container } from "@/components/layout/container";

export function ContactCta() {
  const { data: identity } = useGetSiteIdentityQuery();
  const email = identity?.social_links.find(
    (social) => social.id.toLowerCase() === "email" && social.is_visible,
  );

  return (
    <section className="border-t bg-graph-paper">
      <Container className="py-16 text-center sm:py-20">
        <p className="section-label text-primary">Next step</p>
        <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Let&apos;s build something that ships.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Have a project, a role, or just a question — my inbox is open.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get in touch
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          {email && (
            <a
              href={email.url}
              className="inline-flex items-center gap-2 rounded-md border bg-card px-5 py-2.5 text-sm transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Mail className="size-4" aria-hidden />
              Email me
            </a>
          )}
        </div>
      </Container>
    </section>
  );
}
