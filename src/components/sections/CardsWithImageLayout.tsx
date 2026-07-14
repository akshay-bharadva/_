import React from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
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

const CardsWithImageLayout = ({ items }: SectionLayoutProps) => (
  <motion.div
    className="grid grid-cols-1 gap-8 md:grid-cols-2"
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
          "hover:shadow-lg hover:-translate-y-1 overflow-hidden flex flex-col",
        )}
      >
        {item.image_url ? (
          <div className="relative aspect-video overflow-hidden bg-secondary">
            <img
              src={item.image_url}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="aspect-video bg-gradient-to-br from-primary/5 via-secondary to-accent/5 flex items-center justify-center">
            <span className="text-muted-foreground/40 font-mono text-sm">
              No image
            </span>
          </div>
        )}
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            {item.link_url && (
              <ExternalLink className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
          </div>
          {item.subtitle && (
            <p className="text-sm font-medium text-primary/80 mb-2">
              {item.subtitle}
            </p>
          )}
          {item.description && (
            <p className="text-sm leading-relaxed text-muted-foreground flex-1">
              {item.description}
            </p>
          )}
          <TagList tags={item.tags} />
        </div>
        <StretchedLink href={item.link_url} label={item.title} />
      </motion.div>
    ))}
  </motion.div>
);

export default CardsWithImageLayout;
