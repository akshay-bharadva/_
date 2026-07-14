import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
  CARD_HOVER,
  HoverGlow,
  TagList,
  StretchedLink,
} from "./shared";
import { cn } from "@/lib/utils";

const Grid2ColLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="grid grid-cols-1 gap-6 md:grid-cols-2"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={staggerVariants}
  >
    {items.map((item) => (
      <motion.div
        key={item.id}
        variants={cardItemVariants}
        className={cn(
          CARD,
          CARD_HOVER,
          "p-6 flex flex-col h-full overflow-hidden",
        )}
      >
        <HoverGlow />
        <div className="relative flex-1">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            {item.link_url && (
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
            )}
          </div>
          {item.subtitle && (
            <p className="text-sm font-medium text-primary/80 mb-2">
              {item.subtitle}
            </p>
          )}
          {item.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>
        <TagList tags={item.tags} className="mt-5 pt-4" />
        <StretchedLink href={item.link_url} label={item.title} />
      </motion.div>
    ))}
  </motion.div>
);

export default Grid2ColLayout;
