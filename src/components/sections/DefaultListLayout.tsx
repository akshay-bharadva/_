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
  DateRange,
  StretchedLink,
} from "./shared";
import { cn } from "@/lib/utils";

const DefaultListLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="space-y-3"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={staggerVariants}
  >
    {items.map((item) => (
      <motion.div key={item.id} variants={cardItemVariants}>
        <div
          className={cn(
            CARD,
            CARD_HOVER,
            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 overflow-hidden",
          )}
        >
          <HoverGlow direction="r" />
          <div className="relative space-y-1 flex-1 min-w-0">
            <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors flex items-center gap-2">
              {item.title}
              {item.link_url && (
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
            </h3>
            {item.subtitle && (
              <p className="text-sm text-muted-foreground truncate">
                {item.subtitle}
              </p>
            )}
          </div>
          <div className="relative flex items-center gap-3 shrink-0">
            <TagList
              tags={item.tags}
              max={3}
              bordered={false}
              className="hidden md:flex"
            />
            <DateRange from={item.date_from} to={item.date_to} />
          </div>
          <StretchedLink href={item.link_url} label={item.title} />
        </div>
      </motion.div>
    ))}
  </motion.div>
);

export default DefaultListLayout;
