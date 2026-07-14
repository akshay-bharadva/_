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

function LogoContent({ item }: { item: PortfolioItem }) {
  return (
    <>
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.title}
          className="h-8 w-auto object-contain opacity-50 group-hover:opacity-90 grayscale group-hover:grayscale-0 transition-all"
        />
      ) : (
        <span className="text-base font-black text-muted-foreground group-hover:text-foreground transition-colors">
          {item.title.slice(0, 2).toUpperCase()}
        </span>
      )}
      {item.subtitle && (
        <span className="text-[10px] font-mono text-muted-foreground/60 text-center leading-tight">
          {item.subtitle}
        </span>
      )}
    </>
  );
}

export default function ClientLogosLayout({ items }: SectionLayoutProps) {
  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={staggerVariants}
    >
      {items.map((item) => (
        <motion.div key={item.id} variants={cardItemVariants}>
          {item.link_url ? (
            <Link
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                CARD,
                CARD_HOVER,
                "flex flex-col items-center justify-center gap-2 p-5 h-full aspect-square",
              )}
            >
              <LogoContent item={item} />
            </Link>
          ) : (
            <div
              className={cn(
                CARD,
                "group flex flex-col items-center justify-center gap-2 p-5 h-full aspect-square",
              )}
            >
              <LogoContent item={item} />
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
