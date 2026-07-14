import React from "react";
import { motion } from "framer-motion";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
  CARD_HOVER,
  TagList,
  StretchedLink,
} from "./shared";
import { cn } from "@/lib/utils";

const MasonryLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="columns-1 gap-4 sm:columns-2 lg:columns-3"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={staggerVariants}
  >
    {items.map((item) => (
      <motion.div
        key={item.id}
        variants={cardItemVariants}
        className="break-inside-avoid mb-4"
      >
        <div className={cn(CARD, CARD_HOVER, "overflow-hidden")}>
          {item.image_url && (
            <div className="overflow-hidden">
              <img
                src={item.image_url}
                alt={item.title}
                className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          )}
          <div className="p-5">
            <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors mb-1.5">
              {item.title}
            </h3>
            {item.subtitle && (
              <p className="text-xs font-medium text-primary/80 mb-2">
                {item.subtitle}
              </p>
            )}
            {item.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            )}
            <TagList tags={item.tags} max={4} className="mt-3" />
          </div>
          <StretchedLink href={item.link_url} label={item.title} />
        </div>
      </motion.div>
    ))}
  </motion.div>
);

export default MasonryLayout;
