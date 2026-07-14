import React from "react";
import { motion } from "framer-motion";
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

const Grid3ColLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={staggerVariants}
  >
    {items.map((item) => (
      <motion.div
        key={item.id}
        variants={cardItemVariants}
        className={cn(CARD, CARD_HOVER, "overflow-hidden flex flex-col h-full")}
      >
        <HoverGlow />
        <div className="relative p-6 flex-1 flex flex-col">
          <h3 className="text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors mb-2">
            {item.title}
          </h3>
          {item.subtitle && (
            <p className="text-xs font-medium text-primary/80 mb-2">
              {item.subtitle}
            </p>
          )}
          {item.description && (
            <p className="text-sm leading-relaxed text-muted-foreground flex-1">
              {item.description}
            </p>
          )}
          <TagList tags={item.tags} max={3} />
        </div>
        <StretchedLink href={item.link_url} label={item.title} />
      </motion.div>
    ))}
  </motion.div>
);

export default Grid3ColLayout;
