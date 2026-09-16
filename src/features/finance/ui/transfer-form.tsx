"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinCategory } from "@/types";
import { useRecordFinTransactionMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toLocalISODate } from "@/lib/date-utils";
import {
  finTransferFormSchema,
  type FinTransferFormInput,
} from "@/lib/schemas";
import { fromDecimal, money } from "../money/minor-units";
import { formatMoney } from "../money/format";
import type { RateTable } from "../money/rates";
import { buildTransfer, effectiveRate } from "../ledger/transfer";
import { priceInBase } from "../ledger/pricing";

/**
 * Move money between your own accounts, including across a border.
 *
 * **There is no "only half of it saved" case here.** v1 wrote one leg, then the
 * other, and when the second failed it told the owner to add the missing half by
 * hand so the balances would agree. `fin_record_transaction` writes the pair in
 * one statement with the balance trigger forced immediate inside it, so that
 * state cannot exist and the form needs no branch for it.
 *
 * **Both amounts are entered when the currencies differ**, never computed.
 * Sending 1,000 CAD and having 60,240 INR arrive is a fact you observed,
 * including whatever margin the provider took; a figure derived from a
 * mid-market rate would tell you what *should* have arrived, which nobody needs.
 * When the currencies match there is only one amount to give, and the arriving
 * leg is derived so the pair balances to the minor unit.
 */
export function TransferForm({
  accounts,
  categories,
  rates,
  base,
  onDone,
}: {
  accounts: FinAccount[];
  categories: FinCategory[];
  rates: RateTable;
  base: string;
  onDone: () => void;
}) {
  const [recordTransaction, { isLoading }] = useRecordFinTransactionMutation();

  const usable = accounts.filter((account) => !account.archived_at);

  const transferCategory = useMemo(
    () => categories.find((category) => category.bucket === "transfer"),
    [categories],
  );

  const form = useForm<FinTransferFormInput>({
    resolver: zodResolver(finTransferFormSchema),
    defaultValues: {
      from_account_id: usable[0]?.id ?? "",
      to_account_id: usable[1]?.id ?? "",
      amount_out: "",
      amount_in: "",
      fee: "",
      date: toLocalISODate(),
      description: "",
    },
  });

  const fromId = form.watch("from_account_id");
  const toId = form.watch("to_account_id");
  const amountOut = form.watch("amount_out");
  const amountIn = form.watch("amount_in");

  const from = usable.find((account) => account.id === fromId);
  const to = usable.find((account) => account.id === toId);
  const sameCurrency = Boolean(from && to && from.currency === to.currency);

  /** Shown live, from the two figures as typed. Null until both are usable. */
  const rate = useMemo(() => {
    if (!from || !to || sameCurrency) return null;
    try {
      return effectiveRate(
        fromDecimal(amountOut || "0", from.currency),
        fromDecimal(amountIn || "0", to.currency),
      );
    } catch {
      // Half-typed input is the normal state of a form, not an error.
      return null;
    }
  }, [from, to, sameCurrency, amountOut, amountIn]);

  const handleSubmit = async (values: FinTransferFormInput) => {
    if (!from || !to) return;

    let payload;
    try {
      const out = fromDecimal(values.amount_out, from.currency);
      const received = values.amount_in
        ? fromDecimal(values.amount_in, to.currency)
        : undefined;
      const fee = values.fee ? fromDecimal(values.fee, from.currency) : null;

      payload = buildTransfer({
        from,
        to,
        out,
        received,
        fee,
        date: values.date,
        description: values.description ?? undefined,
        categoryId: transferCategory?.id ?? null,
      });
    } catch (error) {
      // Everything `buildTransfer` refuses is something the database would
      // refuse too, said in words instead of as a constraint violation.
      toast.error("Check the transfer", {
        description: getErrorMessage(error),
      });
      return;
    }

    // Each leg carries the rate it happened at, so neither re-prices itself
    // later. A leg already in the base currency is priced at its own amount.
    const postings = payload.postings.map((posting) => ({
      ...posting,
      ...priceInBase(
        money(posting.amount_minor ?? 0, posting.currency ?? base),
        rates,
        base,
      ),
    }));

    // Described from what was actually built, not from what was typed. On a
    // same-currency transfer the arriving leg is *derived*, so `amount_in` is
    // blank and re-parsing it would report "→ $0.00". That it currently reads
    // correctly only because `rate` is null in that case is two conditions
    // agreeing by coincidence, which is not a thing to rely on.
    const sent = payload.postings[0];
    const arrived = payload.postings[1];
    const crossed = sent.currency !== arrived.currency;

    const summary =
      crossed && rate !== null
        ? `${formatMoney(
            money(Math.abs(sent.amount_minor ?? 0), sent.currency ?? base),
          )} → ${formatMoney(
            money(arrived.amount_minor ?? 0, arrived.currency ?? base),
          )} at ${rate.toFixed(4)}`
        : undefined;

    try {
      await recordTransaction({ ...payload, postings }).unwrap();
      toast.success("Transfer recorded", { description: summary });
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
        Add another from the Accounts section.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-5 pt-4"
      >
        <FormField
          control={form.control}
          name="from_account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>From</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {usable.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-center">
          <ArrowDown className="size-4 text-muted-foreground" aria-hidden />
        </div>

        <FormField
          control={form.control}
          name="to_account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>To</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
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
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amount_out"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Amount sent {from ? `(${from.currency})` : ""}
                </FormLabel>
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

          {!sameCurrency && (
            <FormField
              control={form.control}
              name="amount_in"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Amount received {to ? `(${to.currency})` : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      inputMode="decimal"
                      className="tabular-nums"
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground">
                    What actually arrived, from the confirmation.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {rate !== null && from && to && (
          <p className="rounded-surface bg-secondary/40 p-3 text-sm">
            Effective rate{" "}
            <span className="font-semibold tabular-nums">
              {rate.toFixed(4)}
            </span>{" "}
            <span className="text-muted-foreground">
              — 1 {from.currency} became {rate.toFixed(2)} {to.currency}, after
              whatever margin your provider took.
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee {from ? `(${from.currency})` : ""}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    inputMode="decimal"
                    placeholder="0.00"
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

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="August — rent at home"
                />
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
            Record transfer
          </Button>
        </div>
      </form>
    </Form>
  );
}
