"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus, Tag, Trash2, X } from "lucide-react";
import type { CategoryBucket, FinanceCategory } from "@/types";
import {
  useDeleteFinanceCategoryMutation,
  useSaveFinanceCategoryMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { EmptyState } from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { FINANCE_LIMITS } from "@/lib/schemas";

/**
 * Categories, and the two fields that make the coaching work.
 *
 * There was no interface for this at all, which meant the two most
 * consequential fields in the module were unreachable: `bucket` decides the
 * 50/30/20 split and `is_essential` decides the runway. A default that cannot
 * be corrected is worse than no default — it produces confident advice about a
 * classification you never agreed to.
 *
 * They are deliberately separate. A gym membership can be a `need` in your
 * budgeting shape and still be the first thing cancelled if income stopped;
 * folding them into one field would force a wrong answer to one of the two
 * questions.
 */

const BUCKETS: { id: CategoryBucket; label: string; hint: string }[] = [
  { id: "income", label: "Income", hint: "Money arriving" },
  { id: "need", label: "Need", hint: "Rent, food, transport" },
  { id: "want", label: "Want", hint: "Dining, shopping, travel" },
  { id: "save", label: "Save", hint: "Savings, investments, debt" },
  { id: "transfer", label: "Transfer", hint: "Between your own accounts" },
];

export function CategoriesSection({
  categories,
}: {
  categories: FinanceCategory[];
}) {
  const [saveCategory] = useSaveFinanceCategoryMutation();
  const [deleteCategory] = useDeleteFinanceCategoryMutation();
  const confirm = useConfirm();

  const [newName, setNewName] = useState("");
  const [newBucket, setNewBucket] = useState<CategoryBucket>("want");

  const active = categories.filter((category) => !category.archived_at);

  const patch = async (
    category: FinanceCategory,
    changes: Partial<FinanceCategory>,
  ) => {
    try {
      await saveCategory({ id: category.id, ...changes }).unwrap();
    } catch (error) {
      toast.error("Could not update the category", {
        description: getErrorMessage(error),
      });
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await saveCategory({
        name,
        bucket: newBucket,
        is_essential: newBucket === "need",
        sort_order: active.length * 10 + 1000,
      }).unwrap();
      setNewName("");
      toast.success(`${name} added`);
    } catch (error) {
      toast.error("Could not add it", { description: getErrorMessage(error) });
    }
  };

  const remove = async (category: FinanceCategory) => {
    const ok = await confirm({
      title: `Delete ${category.name}?`,
      description:
        "Transactions filed under it keep their amounts but lose the label, so they move into the uncategorised total until you re-file them.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteCategory(category.id).unwrap();
      toast.success("Category deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <section className="space-y-4" aria-label="Categories">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Tag className="size-4 text-muted-foreground" aria-hidden />
          Categories
        </h2>
        {/*
          What these two fields *buy* you, rather than what they are called.
          
          The previous copy named the outputs — "the 50/30/20 check", "your
          runway" — which only helps a reader who already knows what those are
          and where they appear. Sorting your own categories is tedious, so the
          screen has to be able to answer "and then what?" before you will do
          it.
        */}
        <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Two switches, and they are what make two of the figures on{" "}
          <strong className="font-medium text-foreground">Overview</strong>{" "}
          possible at all.
        </p>
        <ul className="mt-1.5 max-w-prose list-none space-y-1 text-xs leading-relaxed text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Bucket</strong>{" "}
            sorts spending into needs, wants and saving. That grouping is what
            the 50/30/20 line compares against — with everything unsorted, it
            has nothing to compare.
          </li>
          <li>
            <strong className="font-medium text-foreground">Essential</strong>{" "}
            marks what you would still be paying if income stopped tomorrow. It
            is the only input to <em>runway</em> — how many months your money
            would last — so an unmarked list makes that figure meaningless
            rather than merely approximate.
          </li>
        </ul>
        <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-muted-foreground">
          A gym membership can be a <em>need</em> in your budgeting shape and
          still be the first thing cancelled if income stopped. They are
          different questions, which is why they are different switches.
        </p>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No categories yet"
          description="Use “Add starter categories” under Currency & targets for nineteen already sorted into buckets, or add your own below."
        />
      ) : (
        <ul className="space-y-1.5">
          {active.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center gap-3 rounded-surface bg-card p-3 shadow-e1"
            >
              <InlineName
                category={category}
                onRename={(name) => void patch(category, { name })}
              />

              <div
                role="radiogroup"
                aria-label={`${category.name} bucket`}
                className="flex flex-wrap gap-1"
              >
                {BUCKETS.map((bucket) => (
                  <button
                    key={bucket.id}
                    type="button"
                    role="radio"
                    aria-checked={category.bucket === bucket.id}
                    title={bucket.hint}
                    onClick={() => void patch(category, { bucket: bucket.id })}
                    className={cn(
                      "rounded-control px-2 py-1 text-[11px] font-medium transition-colors",
                      category.bucket === bucket.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {bucket.label}
                  </button>
                ))}
              </div>

              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={category.is_essential}
                  onCheckedChange={(next) =>
                    void patch(category, { is_essential: next })
                  }
                  aria-label={`${category.name} is essential`}
                />
                Essential
              </label>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void remove(category)}
                aria-label={`Delete ${category.name}`}
                className="ml-auto size-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-surface bg-card p-4 shadow-e1">
        <div className="min-w-44 flex-1 space-y-1.5">
          <label
            htmlFor="new-category"
            className="text-xs text-muted-foreground"
          >
            New category
          </label>
          <Input
            id="new-category"
            maxLength={FINANCE_LIMITS.CATEGORY_NAME}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
            placeholder="Language classes"
            className="h-9"
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Bucket for the new category"
          className="flex flex-wrap gap-1"
        >
          {BUCKETS.map((bucket) => (
            <button
              key={bucket.id}
              type="button"
              role="radio"
              aria-checked={newBucket === bucket.id}
              onClick={() => setNewBucket(bucket.id)}
              className={cn(
                "rounded-control px-2 py-1 text-[11px] font-medium transition-colors",
                newBucket === bucket.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {bucket.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void add()}
          disabled={!newName.trim()}
        >
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </div>
    </section>
  );
}

/**
 * Rename in place.
 *
 * A sheet to change one word is three interactions and a context switch, and
 * renaming is the most common edit a category ever gets.
 */
function InlineName({
  category,
  onRename,
}: {
  category: FinanceCategory;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(category.name);
          setEditing(true);
        }}
        className="min-w-32 flex-1 truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {category.name}
      </button>
    );
  }

  const commit = () => {
    const name = draft.trim();
    if (name && name !== category.name) onRename(name);
    setEditing(false);
  };

  return (
    <span className="flex min-w-32 flex-1 items-center gap-1">
      <Input
        value={draft}
        maxLength={FINANCE_LIMITS.CATEGORY_NAME}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        className="h-8"
        aria-label={`Rename ${category.name}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={commit}
      >
        <Check className="size-3.5" />
        <span className="sr-only">Save</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setEditing(false)}
      >
        <X className="size-3.5" />
        <span className="sr-only">Cancel</span>
      </Button>
    </span>
  );
}
