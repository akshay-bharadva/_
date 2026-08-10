"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PortfolioSection } from "@/types";
import { sortedItems } from "./shared";
import {
  CardsWithImageLayout,
  CompactCardsLayout,
  DefaultListLayout,
  FeatureAlternatingLayout,
  Grid2ColLayout,
  Grid3ColLayout,
  MasonryLayout,
  StatsGridLayout,
  TimelineLayout,
} from "./layouts-basic";
import {
  CaseStudyLayout,
  ImpactNumbersLayout,
  ServicesLayout,
  TestimonialsLayout,
  WorkExperienceLayout,
} from "./layouts-showcase";
import {
  ClientLogosLayout,
  NowPageLayout,
  OpenSourceLayout,
  PressAwardsLayout,
  SpeakingLayout,
  UsesLayout,
} from "./layouts-creative";
import { RepoGrid } from "@/features/github/repo-grid";

function SectionBody({ section }: { section: PortfolioSection }) {
  const items = sortedItems(section.portfolio_items);

  switch (section.layout_style) {
    case "timeline":
      return <TimelineLayout items={items} />;
    case "grid-2-col":
      return <Grid2ColLayout items={items} />;
    case "grid-3-col":
      return <Grid3ColLayout items={items} />;
    case "cards-with-image":
      return <CardsWithImageLayout items={items} />;
    case "compact-cards":
      return <CompactCardsLayout items={items} />;
    case "stats-grid":
      return <StatsGridLayout items={items} />;
    case "masonry":
      return <MasonryLayout items={items} />;
    case "feature-alternating":
      return <FeatureAlternatingLayout items={items} />;
    case "github-grid":
      return <RepoGrid />;
    case "case-study":
      return <CaseStudyLayout items={items} />;
    case "services":
      return <ServicesLayout items={items} />;
    case "work-experience":
      return <WorkExperienceLayout items={items} />;
    case "testimonials":
      return <TestimonialsLayout items={items} />;
    case "impact-numbers":
      return <ImpactNumbersLayout items={items} />;
    case "open-source":
      return <OpenSourceLayout items={items} />;
    case "speaking":
      return <SpeakingLayout items={items} />;
    case "press-awards":
      return <PressAwardsLayout items={items} />;
    case "client-logos":
      return <ClientLogosLayout items={items} />;
    case "now-page":
      return <NowPageLayout items={items} />;
    case "uses":
      return <UsesLayout items={items} />;
    default:
      if (section.type === "markdown" && section.content) {
        return (
          <div className="markdown leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.content}
            </ReactMarkdown>
          </div>
        );
      }
      return <DefaultListLayout items={items} />;
  }
}

/**
 * Renders one CMS section: numbered mono label, heading, dotted rule, then the
 * layout body. `index` drives the "01 /" ordinal; omit for standalone use.
 */
export default function SectionRenderer({
  section,
  index,
}: {
  section: PortfolioSection;
  index?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      aria-label={section.title}
    >
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          {typeof index === "number" && (
            <span
              aria-hidden
              className="section-label mr-3 align-middle text-primary"
            >
              {String(index + 1).padStart(2, "0")} /
            </span>
          )}
          {section.title}
        </h2>
        <hr className="rule-dotted mt-4" aria-hidden />
      </div>
      <div>
        <SectionBody section={section} />
      </div>
    </motion.section>
  );
}
