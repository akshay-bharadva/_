"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinanceCategory } from "@/types";
import { useSaveFinanceCategoryMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { financeCategorySchema } from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import { SUGGESTED_CATEGORIES } from "./import-classify";

/**
 * Categories the classifier recognised lines for, that the owner does not
 * have. Without this a correct guess still lands as a blank row — which is
 * how a year of fuel, phone bills and insurance came through uncategorised:
 * Shell was recognised as Transport, and there was no Transport to put it in.
 */
export function MissingCategories({
  missing,
  categories,
}: {
  missing: { name: string; count: number }[];
  categories: FinanceCategory[];
}) {
  const [saveCategory] = useSaveFinanceCategoryMutation();
  const [busy, setBusy] = useState(false);

  if (missing.length === 0) return null;

  const create = async () => {
    setBusy(true);
    const last = categories.reduce((max, c) => Math.max(max, c.sort_order ?? 0), 0);
    let made = 0;
    for (let i = 0; i < missing.length; i += 1) {
      const meta = SUGGESTED_CATEGORIES[missing[i].name];
      const checked = financeCategorySchema.safeParse({
        name: missing[i].name,
        bucket: meta?.bucket ?? "want",
        is_essential: meta?.essential ?? false,
      });
      if (!checked.success) continue;
      try {
        await saveCategory({ ...checked.data, sort_order: last + (i + 1) * 10 }).unwrap();
        made += 1;
      } catch (error) {
        toast.error(`Could not create ${missing[i].name}`, {
          description: getErrorMessage(error),
        });
        break;
      }
    }
    setBusy(false);
    if (made > 0) {
      toast.success(`Created ${made} ${made === 1 ? "category" : "categories"}`, {
        description: "The lines waiting for them are filed now.",
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-surface bg-chart-3/10 p-4 text-sm">
      <p className="min-w-0 flex-1 text-foreground">
        <strong className="font-semibold">
          Recognised, but you have no category for {missing.length === 1 ? "it" : "these"} yet:
        </strong>{" "}
        <span className="text-muted-foreground">
          {missing.map((entry) => `${entry.name} (${entry.count})`).join(", ")}.
        </span>
      </p>
      <Button type="button" size="sm" onClick={() => void create()} disabled={busy}>
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        Create {missing.length === 1 ? "it" : `these ${missing.length}`}
      </Button>
    </div>
  );
}
