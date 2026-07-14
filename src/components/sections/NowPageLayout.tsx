import { motion } from "framer-motion";
import {
  SectionLayoutProps,
  cardItemVariants,
  staggerVariants,
  CARD,
} from "./shared";
import { cn } from "@/lib/utils";

// Category → colour mapping. Keep in sync with the categories documented in
// the item editor hints: Work · Reading · Learning · Travel · Health ·
// Thinking (plus Building for legacy content).
const CATEGORY_STYLES: Record<string, { dot: string; badge: string }> = {
  work:     { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  reading:  { dot: "bg-blue-500",    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  learning: { dot: "bg-violet-500",  badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  travel:   { dot: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  health:   { dot: "bg-rose-500",    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  building: { dot: "bg-orange-500",  badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  thinking: { dot: "bg-cyan-500",    badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
};

export default function NowPageLayout({ items }: SectionLayoutProps) {
  const updatedDate = items[0]?.date_from;
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={staggerVariants}
    >
      {updatedDate && (
        <motion.div
          variants={cardItemVariants}
          className="flex items-center gap-2 mb-8"
        >
          <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-xs text-muted-foreground">
            {updatedDate}
          </span>
        </motion.div>
      )}
      <div className="space-y-3">
        {items.map((item) => {
          const cat = (item.subtitle || "work").toLowerCase();
          const style = CATEGORY_STYLES[cat] || {
            dot: "bg-primary",
            badge: "bg-primary/10 text-primary",
          };
          return (
            <motion.div
              key={item.id}
              variants={cardItemVariants}
              className={cn(
                CARD,
                "flex items-start gap-4 p-5 hover:border-border hover:shadow-sm",
              )}
            >
              <div
                className={`size-2.5 rounded-full mt-1.5 shrink-0 ${style.dot}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded capitalize ${style.badge}`}
                  >
                    {item.subtitle}
                  </span>
                </div>
                <p className="text-sm text-foreground mt-1 leading-relaxed">
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.description}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
