import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The opener for a public page.
 *
 * v3: hierarchy is carried by size and a coloured eyebrow. There is no dotted
 * rule underneath — separation between the header and what follows comes from
 * space, and from the fact that the content below sits on its own surfaces.
 */
export function PageHeader({
  kicker,
  title,
  subheading,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  subheading?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-s8 flex flex-col gap-s5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-prose">
        {kicker && <p className="t-eyebrow mb-s2">{kicker}</p>}
        <h1 className="t-title text-balance">{title}</h1>
        {subheading && <p className="t-lead mt-s4 text-pretty">{subheading}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-s2">{actions}</div>
      )}
    </header>
  );
}
