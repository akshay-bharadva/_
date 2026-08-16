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
    { label: "Pinned", value: pinned, accent: "text-chart-3" },
    { label: "Total", value: updates.length, accent: "text-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="shadow-e1">
          <CardContent className="flex items-center justify-between p-3">
            <span className="t-micro">{s.label}</span>
            <span className={cn("font-mono text-lg font-bold", s.accent)}>
              {s.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
