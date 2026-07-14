import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import {
  SectionLayoutProps,
  CARD,
  TagList,
  DateRange,
  ItemMarkdown,
} from "./shared";
import { cn } from "@/lib/utils";

const TimelineLayout = ({ items }: SectionLayoutProps) => (
  <div className="relative ml-3 md:ml-6 space-y-12">
    <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-primary/50 via-border to-transparent" />
    {items.map((item, index) => (
      <motion.div
        key={item.id}
        className="relative pl-8 md:pl-12"
        initial={{ opacity: 0, x: -20, filter: "blur(6px)" }}
        whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay: index * 0.08 }}
      >
        <div className="absolute -left-[5px] top-2 size-2.5 rounded-full bg-primary ring-4 ring-background shadow-sm shadow-primary/20" />
        <div className={cn(CARD, "p-6 hover:shadow-md")}>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-3">
            <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            <DateRange from={item.date_from} to={item.date_to} />
          </div>
          {item.subtitle && (
            <p className="text-sm font-medium text-primary/80 mb-3">
              {item.subtitle}
            </p>
          )}
          {item.description && <ItemMarkdown>{item.description}</ItemMarkdown>}
          <TagList tags={item.tags} />
          {item.link_url && (
            <Link
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mt-4"
            >
              View Details <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </motion.div>
    ))}
  </div>
);

export default TimelineLayout;
