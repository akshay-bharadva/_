"use client";

import type { FinCategory } from "@/types";
import { CategoriesSection } from "./categories-section";

/**
 * Budgets & goals — the part of it that exists so far.
 *
 * Categories live here because that is where v1 kept them, and moving them would
 * be an information-architecture change dressed up as a rewrite. They are not
 * obviously a *planning* concern, but they are the thing budgets attach to, so
 * the pairing has a logic to it.
 *
 * The notice is deliberate. This section is reachable and partially rebuilt, so
 * the nav cannot usefully mark the whole thing "soon" — the precise truth belongs
 * on the screen, where someone looking for a budget will actually read it.
 */
export function PlanSection({ categories }: { categories: FinCategory[] }) {
  return (
    <div className="space-y-8">
      <CategoriesSection categories={categories} />

      <div className="rounded-surface bg-card p-6 shadow-e1">
        <h2 className="text-sm font-semibold text-foreground">
          Budgets and goals are still being rebuilt
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Monthly caps and what you are saving towards still run on the previous
          finance module, on the old ledger. They arrive here once the new one
          carries them — goals in particular change shape, because an earmark no
          longer writes a transaction it never made.
        </p>
      </div>
    </div>
  );
}
