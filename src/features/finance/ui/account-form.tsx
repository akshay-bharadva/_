"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinAccountKind } from "@/types";
import {
  useDeleteFinAccountMutation,
  useSaveFinAccountMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import {
  FIN_ACCOUNT_KINDS,
  finAccountFormSchema,
  finAccountSchema,
  type FinAccountFormInput,
} from "@/lib/schemas";
import { CURRENCIES } from "../money/currency";
import { fromDecimal, money } from "../money/minor-units";
import { toInputValue } from "../money/format";
import { accountKindLabel } from "./account-card";

/**
 * Create or reconcile an account.
 *
 * Built around the **reconciliation anchor** rather than a "starting balance",
 * because that is what it is used for after day one: you open this to say "the
 * statement says 2,431.18 today", and everything after that date is derived from
 * the transactions you have entered. That is the answer to "a credit card bill is
 * unknown until it lands" — you are never asked to reconstruct a ledger, only to
 * state what a balance actually was on a date you have evidence for.
 *
 * **Where the decimal becomes an integer.** The form collects text; the column
 * stores minor units. `fromDecimal` does that conversion, because it is the only
 * thing that knows a currency's exponent (¥ has none, KWD has three) and reads
 * the digits rather than the float — `1.005` is really 1.00499999999999989, so
 * `Math.round(x * 100)` rounds it *down*. The assembled row is then checked
 * against `finAccountSchema`, so the column's own bounds are enforced at the
 * write and not merely at the keyboard.
 *
 * v1's version of this form validated nothing but a non-empty name and a finite
 * number — no bound on the name, no currency check — while
 * `accountReconcileSchema` covered those same two money fields a few lines away
 * in `schemas.ts` and was used by `balance-check-panel.tsx` but not here.
 */
export function AccountForm({
  account,
  initial,
  baseCurrency,
  hasHistory = true,
  onDone,
}: {
  account?: FinAccount;
  /** Pre-filled values for a new account — "add the investments you hold". */
  initial?: Partial<FinAccount>;
  baseCurrency: string;
  /**
   * Whether anything in the ledger touches this account.
   *
   * Defaults to `true`, which is the safe assumption: a caller that has not
   * checked gets the archive-only behaviour rather than an offer to delete.
   */
  hasHistory?: boolean;
  onDone: () => void;
}) {
  const [saveAccount, { isLoading }] = useSaveFinAccountMutation();
  const [deleteAccount] = useDeleteFinAccountMutation();
  const confirm = useConfirm();

  const openingMinor =
    account?.opening_balance_minor ?? initial?.opening_balance_minor ?? 0;
  const startingCurrency =
    account?.currency ?? initial?.currency ?? baseCurrency;
  const startingKind = account?.kind ?? initial?.kind ?? "chequing";
  const startsAsDebt = startingKind === "credit" || startingKind === "loan";

  const form = useForm<FinAccountFormInput>({
    resolver: zodResolver(finAccountFormSchema),
    defaultValues: {
      name: account?.name ?? initial?.name ?? "",
      kind: startingKind,
      currency: startingCurrency,
      institution: account?.institution ?? "",
      // Shown as a positive figure for a debt; the sign is reapplied on submit.
      balance: toInputValue(
        money(
          startsAsDebt ? Math.abs(openingMinor) : openingMinor,
          startingCurrency,
        ),
      ),
      opening_date: account?.opening_date ?? toLocalISODate(),
      credit_limit: account?.credit_limit_minor
        ? toInputValue(money(account.credit_limit_minor, startingCurrency))
        : "",
      statement_day: account?.statement_day ?? null,
      payment_due_day: account?.payment_due_day ?? null,
      is_liquid: account?.is_liquid ?? true,
    },
  });

  const kind = form.watch("kind");
  const currency = form.watch("currency");
  const isDebt = kind === "credit" || kind === "loan";

  const handleSubmit = async (values: FinAccountFormInput) => {
    let row: Partial<FinAccount>;

    try {
      const typed = fromDecimal(values.balance, values.currency).minor;
      const limit = values.credit_limit
        ? fromDecimal(values.credit_limit, values.currency).minor
        : null;

      row = {
        ...(account?.id ? { id: account.id } : {}),
        name: values.name.trim(),
        kind: values.kind,
        currency: values.currency,
        institution: values.institution?.trim() || null,
        // A debt is entered as what you owe and stored negative, so the ledger
        // arithmetic stays uniform: every account sums the same way, and net
        // worth does not need to know which kind it is looking at.
        opening_balance_minor: isDebt ? -Math.abs(typed) : typed,
        opening_date: values.opening_date,
        credit_limit_minor: limit === null ? null : Math.abs(limit),
        statement_day: values.statement_day ?? null,
        payment_due_day: values.payment_due_day ?? null,
        is_liquid: values.is_liquid,
      };

      // The column contract, checked before the write rather than after it. A
      // value Postgres rejects surfaces as an opaque failed save, by which point
      // the form has already told the reader everything was fine.
      finAccountSchema.parse({
        ...row,
        institution: row.institution ?? undefined,
      });
    } catch (error) {
      toast.error("That balance does not look like an amount", {
        description: getErrorMessage(error),
      });
      return;
    }

    try {
      await saveAccount(row).unwrap();
      toast.success(account ? "Account updated" : "Account added");
      onDone();
    } catch (error) {
      toast.error("Could not save the account", {
        description: getErrorMessage(error),
      });
    }
  };

  /**
   * Archive rather than delete.
   *
   * A closed account still holds the history of everything that went through it.
   * Deleting it would orphan those postings and silently change every past
   * total; archiving takes it out of the pickers and the balances while leaving
   * the ledger intact.
   */
  const archive = async () => {
    if (!account) return;
    const restoring = Boolean(account.archived_at);

    if (!restoring) {
      const ok = await confirm({
        title: `Archive ${account.name}?`,
        description:
          "It leaves the account list and stops counting towards net worth. Every transaction against it is kept, and you can restore it later.",
        confirmText: "Archive",
      });
      if (!ok) return;
    }

    try {
      await saveAccount({
        id: account.id,
        archived_at: restoring ? null : new Date().toISOString(),
      }).unwrap();
      toast.success(restoring ? "Account restored" : "Account archived");
      onDone();
    } catch (error) {
      toast.error("Could not archive it", {
        description: getErrorMessage(error),
      });
    }
  };

  /**
   * Delete, but only an account nothing has ever touched.
   *
   * The escape hatch for an account added by mistake — archiving one of those
   * leaves a permanent tombstone for something that never existed. The moment a
   * single posting references it, deleting would orphan history and silently
   * change past totals, so the offer disappears and archiving is the only route.
   * The database would refuse it anyway; this decides what to *offer*, and the
   * offer is the honest part.
   */
  const destroy = async () => {
    if (!account || hasHistory) return;

    const ok = await confirm({
      title: `Delete ${account.name}?`,
      description:
        "Nothing in the ledger touches this account, so there is no history to lose. It goes permanently.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteAccount(account.id).unwrap();
      toast.success("Account deleted");
      onDone();
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Everyday chequing" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(value as FinAccountKind)
                  }
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FIN_ACCOUNT_KINDS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {accountKindLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select value={field.value} onValueChange={field.onChange}>
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

        <FormField
          control={form.control}
          name="institution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="RBC" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3 rounded-surface bg-secondary/40 p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {account ? "Reconcile" : "Starting balance"}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              State what the account really held on a date you have evidence for
              — a statement, or the balance showing in your banking app right
              now. Everything after that is derived from the transactions you
              enter, so you never have to reconstruct a ledger to make this
              accurate again.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="balance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isDebt ? "Amount owed" : "Balance"} ({currency})
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="decimal"
                      className="tabular-nums"
                    />
                  </FormControl>
                  {isDebt && (
                    <p className="text-[11px] text-muted-foreground">
                      Enter it as a positive number — 1,200 means you owe 1,200.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="opening_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>As of</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {kind === "credit" && (
          <FormField
            control={form.control}
            name="credit_limit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Credit limit (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    inputMode="decimal"
                    placeholder="5000"
                    className="tabular-nums"
                  />
                </FormControl>
                <p className="text-[11px] text-muted-foreground">
                  Used to show utilisation, which starts to matter above 30%.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="is_liquid"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
              <div className="space-y-0.5">
                <Label htmlFor="account-liquid" className="cursor-pointer">
                  Reachable money
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off for anything locked away — a retirement account is real
                  money that will not help you next month, so it counts towards
                  net worth but not towards runway.
                </p>
              </div>
              <FormControl>
                <Switch
                  id="account-liquid"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {account && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void archive()}
              className="mr-auto text-muted-foreground hover:text-destructive"
            >
              {account.archived_at ? "Restore" : "Archive"}
            </Button>
          )}
          {/*
            Only for an account with nothing behind it. Once anything references
            it, archiving is the only route and this is not offered at all —
            better than offering a delete that would be refused.
          */}
          {account && !hasHistory && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void destroy()}
              className="text-muted-foreground hover:text-destructive"
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {account ? "Save" : "Add account"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
