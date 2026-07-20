import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PortfolioItem } from "@/types";
import { cn } from "@/lib/utils";

/** Items sorted by display_order (the API orders them, but be defensive). */
export function sortedItems(items?: PortfolioItem[]): PortfolioItem[] {
  return [...(items ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
}

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export function ItemTags({
  tags,
  className,
}: {
  tags?: string[] | null;
  className?: string;
}) {
  if (!tags?.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function ItemDates({
  from,
  to,
  className,
}: {
  from?: string | null;
  to?: string | null;
  className?: string;
}) {
  if (!from && !to) return null;
  return (
    <span className={cn("font-mono text-xs text-muted-foreground", className)}>
      {from}
      {from && (to || !from) ? " — " : ""}
      {to ?? (from ? "Present" : "")}
    </span>
  );
}

/** Renders children as an external link when the item has one. */
export function MaybeLink({
  href,
  className,
  children,
}: {
  href?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("group/link block", className)}
    >
      {children}
    </a>
  );
}

export function ItemImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) return null;
  // Static export runs with images.unoptimized — a plain img avoids remote-domain config.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}
