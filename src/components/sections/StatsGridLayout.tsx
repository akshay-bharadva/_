import React from "react";
import { motion } from "framer-motion";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
  CARD_HOVER,
  HoverGlow,
} from "./shared";
import { cn } from "@/lib/utils";

const StatsGridLayout = ({ items }: SectionLayoutProps) => (
  <motion.div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={staggerVariants}>
    {items.map(item => (
      <motion.div key={item.id} variants={cardItemVariants}
        className={cn(CARD, CARD_HOVER, "p-6 text-center overflow-hidden")}>
        <HoverGlow />
        <div className="relative">
          <div className="text-3xl md:text-4xl font-black text-foreground mb-1 tracking-tight">{item.title}</div>
          <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{item.subtitle || item.description}</div>
        </div>
      </motion.div>
    ))}
  </motion.div>
);

export default StatsGridLayout;
