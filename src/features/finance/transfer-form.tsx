"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, Loader2 } from "lucide-react";
import type { FinanceAccount, FinanceCategory } from "@/types";
import { useSaveTransactionMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils";
import { buildTransferLegs, effectiveRate } from "./transfers";
import { toLocalISODate } from "@/lib/date-utils";

/**
 * Move money between your own accounts, including across a border.
 *
 * Both amounts are entered rather than one being computed. Sending 1,000 CAD
 * and having 60,240 INR arrive is a fact you observed — including whatever
 * margin the provider took — not a conversion the app should perform. A figure
 * derived from a mid-market rate would tell you what *should* have arrived,
 * which nobody needs.
 */
export function TransferForm({
  accounts,
  categories,
  onDone,
}: {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onDone: () => void;
}) {
  const [saveTransaction, { isLoading }] = useSaveTransactionMutation();

  const usable = accounts.filter((account) => !account.archived_at);

  const [fromId, setFromId] = useState(usable[0]?.id ?? "");
  const [toId, setToId] = useState(usable[1]?.id ?? "");
  const [amountOut, setAmountOut] = useState("");
  const [amountIn, setAmountIn] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(toLocalISODate());
  const [description, setDescription] = useState("");

  const from = usable.find((account) => account.id === fromId);
  const to = usable.find((account) => account.id === toId);
  const sameCurrency = from && to && from.currency === to.currency;

  const parsedOut = Number(amountOut);
  const parsedIn = sameCurrency ? parsedOut : Number(amountIn);

  const transferCategory = useMemo(
    () => categories.find((category) => category.bucket === "transfer"),
    [categories],
  );

  const rate = effectiveRate(parsedOut, parsedIn);

  const valid =
    from !== undefined &&
    to !== undefined &&
    from.id !== to.id &&
    Number.isFinite(parsedOut) &&
    parsedOut > 0 &&
    Number.isFinite(parsedIn) &&
    parsedIn > 0;

  const submit = async () => {
    if (!valid || !from || !to) return;

    const group =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const legs = buildTransferLegs(
      {
        fromAccount: from,
        toAccount: to,
        amountOut: parsedOut,
        amountIn: parsedIn,
        fee: fee ? Number(fee) : undefined,
        date,
        description: description.trim() || undefined,
        categoryId: transferCategory?.id ?? null,
      },
      group,
    );

    try {
      // Sequential, not parallel. A transfer with only one leg written is a
      // balance that is wrong in both directions, so the second write must not
      // start until the first is known to have succeeded — and if it fails,
      // the error names which half landed.
      await saveTransaction(legs[0]).unwrap();
      try {
        await saveTransaction(legs[1]).unwrap();
      } catch (error) {
        toast.error("Only half the transfer was recorded", {
          description: `The money leaving ${from.name} was saved but the arrival in ${to.name} was not. Add it manually so the two balances agree. (${getErrorMessage(error)})`,
        });
        onDone();
        return;
      }

      toast.success("Transfer recorded", {
        description: rate
          ? `${formatMoney({ amount: parsedOut, currency: from.currency })} → ${formatMoney({ amount: parsedIn, currency: to.currency })} at ${rate.toFixed(4)}`
          : undefined,
      });
      onDone();
    } catch (error) {
      toast.error("Could not record the transfer", {
        description: getErrorMessage(error),
      });
    }
  };

  if (usable.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        A transfer moves money between two accounts, so you need at least two.
        Add another from the Accounts tab.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="transfer-from">From</Label>
        <Select value={fromId} onValueChange={setFromId}>
          <SelectTrigger id="transfer-from">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {usable.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-center">
        <ArrowDown className="size-4 text-muted-foreground" aria-hidden />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-to">To</Label>
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger id="transfer-to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {usable
              .filter((account) => account.id !== fromId)
              .map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-out">
            Amount sent {from ? `(${from.currency})` : ""}
          </Label>
          <Input
            id="transfer-out"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amountOut}
            onChange={(event) => setAmountOut(event.target.value)}
            className="tabular-nums"
          />
        </div>

        {!sameCurrency && (
          <div className="space-y-1.5">
            <Label htmlFor="transfer-in">
              Amount received {to ? `(${to.currency})` : ""}
            </Label>
            <Input
              id="transfer-in"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amountIn}
              onChange={(event) => setAmountIn(event.target.value)}
              className="tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              What actually arrived, from the confirmation.
            </p>
          </div>
        )}
      </div>

      {rate !== null && !sameCurrency && from && to && (
        <p className="rounded-surface bg-secondary/40 p-3 text-sm">
          Effective rate{" "}
          <span className="font-semibold tabular-nums">{rate.toFixed(4)}</span>{" "}
          <span className="text-muted-foreground">
            — 1 {from.currency} became {rate.toFixed(2)} {to.currency}, after
            whatever margin your provider took.
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-fee">
            Fee {from ? `(${from.currency})` : ""}
          </Label>
          <Input
            id="transfer-fee"
            type="number"
            inputMode="decimal"
            step="0.01"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            placeholder="0.00"
            className="tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="transfer-date">Date</Label>
          <Input
            id="transfer-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transfer-note">Note (optional)</Label>
        <Input
          id="transfer-note"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="August — rent at home"
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
          Record transfer
        </Button>
      </div>
    </div>
  );
}
