import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
  CARD_HOVER,
} from "./shared";
import { cn } from "@/lib/utils";

const CompactCardsLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="flex flex-wrap gap-3"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.1 }}
    variants={staggerVariants}
  >
    {items.map((item) => {
      const chipContent = (
        <>
          <span
            className={cn(
              "text-sm font-medium text-foreground",
              item.link_url && "group-hover:text-primary transition-colors",
            )}
          >
            {item.title}
          </span>
          {item.subtitle && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · {item.subtitle}
            </span>
          )}
        </>
      );
      return (
        <motion.div key={item.id} variants={cardItemVariants}>
          {item.link_url ? (
            <a
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                CARD,
                CARD_HOVER,
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5",
              )}
            >
              {chipContent}
              <ArrowUpRight className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </a>
          ) : (
            <div
              className={cn(
                CARD,
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5",
              )}
            >
              {chipContent}
            </div>
          )}
        </motion.div>
      );
    })}
  </motion.div>
);

export default CompactCardsLayout;
