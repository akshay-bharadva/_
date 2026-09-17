"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinGoal } from "@/types";
import { useSaveFinGoalMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/utils";
import {
  FIN_GOAL_KINDS,
  finGoalFormSchema,
  type FinGoalFormInput,
} from "@/lib/schemas";
import { CURRENCIES } from "../money/currency";
import { fromDecimal, money } from "../money/minor-units";
import { toInputValue } from "../money/format";

/**
 * A goal's terms. The money that goes into it is recorded on the card, not here.
 *
 * The account matters more than it looks: a goal names **where the money is
 * kept**, so progress is observed against a real balance rather than remembered.
 * It is nullable because a goal can be set before you have decided, and closing
 * an account sets it null rather than erasing the record of what was set aside.
 */

const KIND_LABELS: Record<(typeof FIN_GOAL_KINDS)[number], string> = {
  save: "Saving up for something",
  payoff: "Paying something off",
  buffer: "A cushion to keep topped up",
};

const NO_ACCOUNT = "none";

export function GoalForm({
  goal,
  accounts,
  base,
  onDone,
}: {
  goal?: FinGoal;
  accounts: FinAccount[];
  base: string;
  onDone: () => void;
}) {
  const [saveGoal, { isLoading }] = useSaveFinGoalMutation();

  const currency = goal?.currency ?? base;

  const form = useForm<FinGoalFormInput>({
    resolver: zodResolver(finGoalFormSchema),
    defaultValues: {
      name: goal?.name ?? "",
      description: goal?.description ?? "",
      target: goal ? toInputValue(money(goal.target_minor, goal.currency)) : "",
      currency,
      target_date: goal?.target_date ?? null,
      account_id: goal?.account_id ?? null,
      kind: goal?.kind ?? null,
    },
  });

  const selectedCurrency = form.watch("currency");

  const handleSubmit = async (values: FinGoalFormInput) => {
    let targetMinor: number;
    try {
      targetMinor = fromDecimal(values.target, values.currency).minor;
    } catch (error) {
      form.setError("target", { message: getErrorMessage(error) });
      return;
    }

    // Asserted again on the integer, not only on the text. `target_minor > 0`
    // is the column's CHECK, and a target of 0.004 in a two-decimal currency
    // passes the text check and rounds to zero.
    if (targetMinor <= 0) {
      form.setError("target", { message: "A goal of nothing is not a goal" });
      return;
    }

    try {
      await saveGoal({
        id: goal?.id,
        name: values.name,
        description: values.description || null,
        target_minor: targetMinor,
        currency: values.currency,
        target_date: values.target_date,
        account_id: values.account_id,
        kind: values.kind,
      }).unwrap();
      toast.success(goal ? "Goal updated" : "Goal added");
      onDone();
    } catch (error) {
      toast.error("Could not save it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Six months of expenses" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="target"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target ({selectedCurrency})</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="decimal"
                    className="tabular-nums"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-72">
                    {CURRENCIES.map((entry) => (
                      <SelectItem key={entry.code} value={entry.code}>
                        {entry.code} — {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="target_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>By when</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What kind</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? undefined}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FIN_GOAL_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kept in</FormLabel>
              <Select
                onValueChange={(value) =>
                  field.onChange(value === NO_ACCOUNT ? null : value)
                }
                value={field.value ?? NO_ACCOUNT}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>Not decided yet</SelectItem>
                  {accounts
                    .filter((account) => !account.archived_at)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.currency})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The money stays in this account. Naming it records where what
                you set aside is actually held — nothing is moved.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {goal ? "Save changes" : "Add goal"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
