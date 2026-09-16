"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinCategory, FinTransaction } from "@/types";
import {
  useRecordFinTransactionMutation,
  useUpdateFinTransactionMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/cn";
import { toLocalISODate } from "@/lib/date-utils";
import {
  finTransactionFormSchema,
  type FinTransactionFormInput,
} from "@/lib/schemas";
import { CURRENCIES } from "../money/currency";
import { fromDecimal, toDecimal } from "../money/minor-units";
import type { RateTable } from "../money/rates";
import { postingsOf } from "../ledger/flows";
import { priceInBase } from "../ledger/pricing";

/** Radix reserves the empty string, so "no category" needs its own value. */
const NO_CATEGORY = "none";

/**
 * Add or edit one transaction.
 *
 * **One posting, signed.** v1 stored a `type` of earning-or-expense and every
 * reader had to remember which way it meant; here the direction *is* the sign of
 * the amount, and the `kind` that gets stored is for display and the calendar
 * only — no arithmetic reads it. So this form's `direction` field decides a sign
 * and then stops existing.
 *
 * **The rate is frozen at entry.** A foreign posting carries the rate it happened
 * at, so a report over last February says what February cost rather than what
 * those rupees are worth this morning. When no rate is cached for the currency,
 * the posting is written unpriced rather than at parity, and the totals say so.
 *
 * Editing goes through `fin_update_transaction`, which replaces the postings
 * wholesale inside one statement — patching them individually is how two legs of
 * a transfer stop agreeing.
 */
export function TransactionForm({
  transaction,
  accounts,
  categories,
  rates,
  base,
  onDone,
}: {
  transaction?: FinTransaction;
  accounts: FinAccount[];
  categories: FinCategory[];
  rates: RateTable;
  base: string;
  onDone: () => void;
}) {
  const [recordTransaction, { isLoading: recording }] =
    useRecordFinTransactionMutation();
  const [updateTransaction, { isLoading: updating }] =
    useUpdateFinTransactionMutation();
  const isLoading = recording || updating;

  const usable = accounts.filter((account) => !account.archived_at);
  const existing = transaction ? postingsOf(transaction)[0] : undefined;

  const defaultAccount = existing?.account_id ?? usable[0]?.id ?? null;
  const defaultCurrency =
    existing?.currency ??
    usable.find((account) => account.id === defaultAccount)?.currency ??
    base;

  const form = useForm<FinTransactionFormInput>({
    resolver: zodResolver(finTransactionFormSchema),
    defaultValues: {
      // A stored posting's sign is the truth about its direction.
      direction: existing && existing.amount_minor > 0 ? "in" : "out",
      description: transaction?.description ?? "",
      amount: existing
        ? Math.abs(
            toDecimal({
              minor: existing.amount_minor,
              currency: existing.currency,
            }),
          ).toString()
        : "",
      date: transaction?.date ?? toLocalISODate(),
      account_id: defaultAccount,
      category_id: existing?.category_id ?? null,
      currency: defaultCurrency,
      notes: transaction?.notes ?? "",
      is_pending: transaction?.is_pending ?? false,
    },
  });

  const direction = form.watch("direction");
  const accountId = form.watch("account_id");
  const currency = form.watch("currency");

  const account = usable.find((entry) => entry.id === accountId);
  const accountCurrency = account?.currency ?? base;
  const [foreign, setForeign] = useState(
    Boolean(existing && existing.currency !== accountCurrency),
  );

  /**
   * Income categories for money in, everything else for money out. Offering
   * "Salary" as a place to file groceries is a list nobody reads past.
   */
  const relevant = useMemo(
    () =>
      categories.filter(
        (category) =>
          !category.archived_at &&
          category.bucket !== "transfer" &&
          (direction === "in"
            ? category.bucket === "income"
            : category.bucket !== "income"),
      ),
    [categories, direction],
  );

  const handleSubmit = async (values: FinTransactionFormInput) => {
    let amount;
    try {
      amount = fromDecimal(values.amount, values.currency);
    } catch (error) {
      toast.error("That amount does not look like a number", {
        description: getErrorMessage(error),
      });
      return;
    }

    if (amount.minor === 0) {
      // The column rejects a zero posting, and rightly: a movement of nothing
      // describes nothing.
      toast.error("An amount of nothing is not a transaction");
      return;
    }

    const signed = {
      minor:
        values.direction === "out"
          ? -Math.abs(amount.minor)
          : Math.abs(amount.minor),
      currency: amount.currency,
    };

    const payload = {
      transaction: {
        date: values.date,
        description: values.description.trim(),
        // Display only. Direction lives in the sign above.
        kind:
          values.direction === "out" ? ("spend" as const) : ("earn" as const),
        notes: values.notes?.trim() || null,
        is_pending: values.is_pending,
      },
      postings: [
        {
          account_id: values.account_id,
          category_id: values.category_id,
          amount_minor: signed.minor,
          currency: signed.currency,
          ...priceInBase(signed, rates, base),
        },
      ],
    };

    try {
      if (transaction?.id) {
        await updateTransaction({ id: transaction.id, ...payload }).unwrap();
      } else {
        await recordTransaction(payload).unwrap();
      }
      toast.success(transaction ? "Transaction updated" : "Transaction added");
      onDone();
    } catch (error) {
      toast.error("Could not save it", { description: getErrorMessage(error) });
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-5 pt-4"
      >
        <FormField
          control={form.control}
          name="direction"
          render={({ field }) => (
            <FormItem>
              <div
                role="radiogroup"
                aria-label="Direction"
                className="grid grid-cols-2 gap-2"
              >
                {(["out", "in"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={field.value === option}
                    onClick={() => {
                      field.onChange(option);
                      // The category list changes underneath, so a stale choice
                      // would be one the new list does not contain.
                      form.setValue("category_id", null);
                    }}
                    className={cn(
                      "rounded-surface px-3 py-2.5 text-sm font-medium transition-shadow duration-200 ease-enter",
                      field.value === option
                        ? "bg-card shadow-e3 ring-2 ring-primary"
                        : "bg-card text-muted-foreground shadow-e1 hover:shadow-e2",
                    )}
                  >
                    {option === "out" ? "Money out" : "Money in"}
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={direction === "out" ? "Groceries" : "Salary"}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ({currency})</FormLabel>
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
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {usable.length > 0 && (
          <FormField
            control={form.control}
            name="account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account</FormLabel>
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const next = usable.find((entry) => entry.id === value);
                    if (next && !foreign)
                      form.setValue("currency", next.currency);
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {usable.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name} ({entry.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Balances are derived from this, so an unassigned transaction
                  shows in the ledger but moves nothing.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {relevant.length > 0 && (
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  value={field.value ?? NO_CATEGORY}
                  onValueChange={(value) =>
                    field.onChange(value === NO_CATEGORY ? null : value)
                  }
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
                    {relevant.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="space-y-3 rounded-surface bg-card p-3.5 shadow-e1">
          <div className="flex items-center justify-between gap-6">
            <div className="space-y-0.5">
              <Label htmlFor="txn-foreign" className="cursor-pointer">
                Spent in another currency
              </Label>
              <p className="text-xs text-muted-foreground">
                A card issued here, used abroad.
              </p>
            </div>
            <Switch
              id="txn-foreign"
              checked={foreign}
              onCheckedChange={(next) => {
                setForeign(next);
                if (!next) form.setValue("currency", accountCurrency);
              }}
            />
          </div>

          {foreign && (
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Currency</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-9">
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
                  <p className="text-[11px] text-muted-foreground">
                    The rate on this date is stored with the posting, so this
                    figure never changes when the market does.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="is_pending"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
              <div className="space-y-0.5">
                <Label htmlFor="txn-pending" className="cursor-pointer">
                  Not cleared yet
                </Label>
                <p className="text-xs text-muted-foreground">
                  Kept out of balances until it lands.
                </p>
              </div>
              <FormControl>
                <Switch
                  id="txn-pending"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {transaction ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
