"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import { useSaveTransactionMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";

/**
 * Add or edit one transaction.
 *
 * Gains the two fields the previous form had nowhere to put, because the
 * columns did not exist: **which account** it came out of, and **what currency**
 * it was in. Without the first there is no such thing as a balance; without the
 * second every figure in a two-country life is ambiguous.
 *
 * The currency defaults to the account's and is only worth changing for a
 * foreign purchase — a card issued in one country used in another — so it is
 * tucked behind a toggle rather than sitting in the way of the common case.
 */
export function TransactionForm({
  transaction,
  accounts,
  categories,
  settings,
  onDone,
}: {
  transaction?: Transaction;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  settings: FinanceSettings;
  onDone: () => void;
}) {
  const [saveTransaction, { isLoading }] = useSaveTransactionMutation();

  const usable = accounts.filter((account) => !account.archived_at);

  const [type, setType] = useState<"expense" | "earning">(
    transaction?.type ?? "expense",
  );
  const [description, setDescription] = useState(
    transaction?.description ?? "",
  );
  const [amount, setAmount] = useState(
    transaction ? String(transaction.amount) : "",
  );
  const [date, setDate] = useState(
    transaction?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [accountId, setAccountId] = useState(
    transaction?.account_id ?? usable[0]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [isPending, setIsPending] = useState(transaction?.is_pending ?? false);

  const account = usable.find((entry) => entry.id === accountId);
  const accountCurrency = account?.currency ?? settings.base_currency;

  const [foreign, setForeign] = useState(
    Boolean(transaction?.currency && transaction.currency !== accountCurrency),
  );
  const [currency, setCurrency] = useState(
    transaction?.currency ?? accountCurrency,
  );

  const relevant = useMemo(
    () =>
      categories.filter(
        (category) =>
          !category.archived_at &&
          category.bucket !== "transfer" &&
          // Income categories for income, spending categories for spending —
          // offering "Salary" as a place to file groceries is a list nobody
          // wants to read past.
          (type === "earning"
            ? category.bucket === "income"
            : category.bucket !== "income"),
      ),
    [categories, type],
  );

  const parsedAmount = Number(amount);
  const valid =
    description.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const submit = async () => {
    if (!valid) return;
    try {
      await saveTransaction({
        ...(transaction?.id ? { id: transaction.id } : {}),
        date,
        description: description.trim(),
        amount: parsedAmount,
        type,
        account_id: accountId || null,
        category_id: categoryId || null,
        // Left null when it matches the account, so the database trigger fills
        // it — one place decides, rather than the form and the trigger both
        // having an opinion.
        currency: foreign ? currency : null,
        notes: notes.trim() || null,
        is_pending: isPending,
      }).unwrap();
      toast.success(transaction ? "Transaction updated" : "Transaction added");
      onDone();
    } catch (error) {
      toast.error("Could not save it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label="Direction"
        className="grid grid-cols-2 gap-2"
      >
        {(["expense", "earning"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={type === option}
            onClick={() => {
              setType(option);
              setCategoryId("");
            }}
            className={cn(
              "rounded-surface px-3 py-2.5 text-sm font-medium transition-shadow duration-200 ease-enter",
              type === option
                ? "bg-card shadow-e3 ring-2 ring-primary"
                : "bg-card text-muted-foreground shadow-e1 hover:shadow-e2",
            )}
          >
            {option === "expense" ? "Money out" : "Money in"}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="txn-description">Description</Label>
        <Input
          id="txn-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={type === "expense" ? "Groceries" : "Salary"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="txn-amount">
            Amount ({foreign ? currency : accountCurrency})
          </Label>
          <Input
            id="txn-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="txn-date">Date</Label>
          <Input
            id="txn-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      {usable.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="txn-account">Account</Label>
          <Select
            value={accountId}
            onValueChange={(value) => {
              setAccountId(value);
              const next = usable.find((entry) => entry.id === value);
              if (next && !foreign) setCurrency(next.currency);
            }}
          >
            <SelectTrigger id="txn-account">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {usable.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name} ({entry.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Balances are derived from this, so an unassigned transaction shows
            in the ledger but moves nothing.
          </p>
        </div>
      )}

      {relevant.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="txn-category">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="txn-category">
              <SelectValue placeholder="Uncategorised" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {relevant.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              if (!next) setCurrency(accountCurrency);
            }}
          />
        </div>

        {foreign && (
          <div className="space-y-1.5">
            <Label htmlFor="txn-currency" className="text-xs">
              Currency
            </Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="txn-currency" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {CURRENCIES.map((entry) => (
                  <SelectItem key={entry.code} value={entry.code}>
                    {entry.code} — {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The rate on this date is stored with the row, so this figure never
              changes when the market does.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
        <div className="space-y-0.5">
          <Label htmlFor="txn-pending" className="cursor-pointer">
            Not cleared yet
          </Label>
          <p className="text-xs text-muted-foreground">
            Kept out of balances until it lands.
          </p>
        </div>
        <Switch
          id="txn-pending"
          checked={isPending}
          onCheckedChange={setIsPending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="txn-notes">Note (optional)</Label>
        <Input
          id="txn-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!valid || isLoading}
        >
          {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {transaction ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
