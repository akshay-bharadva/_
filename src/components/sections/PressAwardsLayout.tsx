import { motion } from "framer-motion";
import Link from "next/link";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
  CARD_HOVER,
} from "./shared";
import { cn } from "@/lib/utils";
import type { PortfolioItem } from "@/types";

function AwardContent({ item }: { item: PortfolioItem }) {
  return (
    <>
      {item.image_url && (
        <img
          src={item.image_url}
          alt={item.title}
          className="h-7 w-auto object-contain opacity-60 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0"
        />
      )}
      <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors text-center">
        {item.title}
      </span>
      {item.subtitle && (
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {item.subtitle}
        </span>
      )}
    </>
  );
}

export default function PressAwardsLayout({ items }: SectionLayoutProps) {
  return (
    <motion.div
      className="flex flex-wrap gap-3 items-center"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={staggerVariants}
    >
      {items.map((item) => (
        <motion.div
          key={item.id}
          variants={cardItemVariants}
          // Surface the optional context note as a native tooltip
          title={item.description || undefined}
        >
          {item.link_url ? (
            <Link
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                CARD,
                CARD_HOVER,
                "flex flex-col items-center gap-1.5 px-6 py-4",
              )}
            >
              <AwardContent item={item} />
            </Link>
          ) : (
            <div
              className={cn(CARD, "flex flex-col items-center gap-1.5 px-6 py-4")}
            >
              <AwardContent item={item} />
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
