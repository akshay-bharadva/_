import { Pin } from "lucide-react";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import type { LifeUpdateCategory } from "@/types";

export function categoryOption(category: LifeUpdateCategory) {
  return (
    LIFE_UPDATE_CATEGORY_OPTIONS.find((option) => option.value === category) ??
    LIFE_UPDATE_CATEGORY_OPTIONS[3] // thought
  );
}

/** "today" / "yesterday" / "Nd ago" / short date beyond 30 days. */
export function relativeDate(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days}d ago`;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PinBadge() {
  return (
    <span
      title="Pinned"
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-medium text-foreground"
    >
      <Pin className="size-3 text-primary" aria-hidden />
      pinned
    </span>
  );
}
