import type { LifeUpdate } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatsRow({ updates }: { updates: LifeUpdate[] }) {
  const published = updates.filter((u) => u.is_published).length;
  const drafts = updates.filter((u) => !u.is_published).length;
  const pinned = updates.filter((u) => u.is_pinned).length;

  const stats = [
    { label: "Published", value: published, accent: "text-primary" },
    { label: "Drafts", value: drafts, accent: "text-muted-foreground" },
    { label: "Pinned", value: pinned, accent: "text-amber-500" },
    { label: "Total", value: updates.length, accent: "text-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <Card key={s.label} className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className={cn("text-lg font-bold", s.accent)}>
              {s.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
