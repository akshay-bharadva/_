import React from "react";
import { motion } from "framer-motion";
import { Wrench } from "lucide-react";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
  CARD_HOVER,
  HoverGlow,
  TagList,
} from "./shared";
import { cn } from "@/lib/utils";

// Rotating accent palette for the service icon tiles (matches the admin
// layout-registry preview, which promises coloured icon tiles).
const SERVICE_ICON_COLORS = [
  "bg-blue-500/10 text-blue-500",
  "bg-violet-500/10 text-violet-500",
  "bg-emerald-500/10 text-emerald-500",
  "bg-amber-500/10 text-amber-500",
  "bg-rose-500/10 text-rose-500",
];

const ServicesLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={staggerVariants}
  >
    {items.map((item, i) => {
      const colorClass = SERVICE_ICON_COLORS[i % SERVICE_ICON_COLORS.length];
      return (
        <motion.div
          key={item.id}
          variants={cardItemVariants}
          className={cn(
            CARD,
            CARD_HOVER,
            "hover:-translate-y-1 p-7 overflow-hidden flex flex-col gap-4",
          )}
        >
          <HoverGlow />
          <div
            className={`relative size-11 rounded-xl ${colorClass} flex items-center justify-center`}
          >
            <Wrench className="size-5" />
          </div>
          <div className="relative">
            <h3 className="text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors mb-1">
              {item.title}
            </h3>
            {item.subtitle && (
              <p className="text-xs font-mono text-muted-foreground mb-3">
                {item.subtitle}
              </p>
            )}
            {item.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            )}
          </div>
          <TagList tags={item.tags} className="mt-auto pt-4" />
        </motion.div>
      );
    })}
  </motion.div>
);

export default ServicesLayout;
