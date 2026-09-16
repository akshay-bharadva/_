"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinCategory } from "@/types";
import { useSaveFinCategoryMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { finCategorySchema } from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import { SUGGESTED_CATEGORIES } from "../import/classify";

/**
 * Categories the classifier recognised lines for, that the owner does not have.
 *
 * Without this a correct guess still lands as a blank row — which is how a year
 * of fuel, phone bills and insurance came through uncategorised: Shell was
 * recognised as Transport, and there was no Transport to put it in.
 *
 * Each one is created with the bucket and essential flag the classifier suggests,
 * so a recovered category arrives already sorted rather than as a `want` the
 * owner has to re-file. An unrecognised name falls back to `want` and
 * not-essential, which is the conservative pair: a wrongly-essential category
 * inflates the runway, and a runway that flatters you is worse than one that
 * needs correcting.
 */
export function MissingCategories({
  missing,
  categories,
}: {
  missing: { name: string; count: number }[];
  categories: FinCategory[];
}) {
  const [saveCategory] = useSaveFinCategoryMutation();
  const [busy, setBusy] = useState(false);

  if (missing.length === 0) return null;

  const create = async () => {
    setBusy(true);
    const last = categories.reduce(
      (max, category) => Math.max(max, category.sort_order ?? 0),
      0,
    );

    let made = 0;
    for (let index = 0; index < missing.length; index += 1) {
      const suggestion = SUGGESTED_CATEGORIES[missing[index].name];
      const checked = finCategorySchema.safeParse({
        name: missing[index].name,
        bucket: suggestion?.bucket ?? "want",
        is_essential: suggestion?.essential ?? false,
      });
      // Skipped rather than sent: a name the schema refuses is one the column
      // would refuse too, and one bad entry must not abandon the rest.
      if (!checked.success) continue;

      try {
        await saveCategory({
          ...checked.data,
          sort_order: last + (index + 1) * 10,
        }).unwrap();
        made += 1;
      } catch (error) {
        toast.error(`Could not create ${missing[index].name}`, {
          description: getErrorMessage(error),
        });
        // Stop at the first real failure. Continuing would pile up one toast per
        // remaining name for what is almost certainly the same cause.
        break;
      }
    }

    setBusy(false);
    if (made > 0) {
      toast.success(
        `Created ${made} ${made === 1 ? "category" : "categories"}`,
        { description: "The lines waiting for them are filed now." },
      );
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-surface bg-chart-3/10 p-4 text-sm">
      <p className="min-w-0 flex-1 text-foreground">
        <strong className="font-semibold">
          Recognised, but you have no category for{" "}
          {missing.length === 1 ? "it" : "these"} yet:
        </strong>{" "}
        <span className="text-muted-foreground">
          {missing.map((entry) => `${entry.name} (${entry.count})`).join(", ")}.
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        onClick={() => void create()}
        disabled={busy}
      >
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        Create {missing.length === 1 ? "it" : `these ${missing.length}`}
      </Button>
    </div>
  );
}
