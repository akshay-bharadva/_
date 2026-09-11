"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMonths } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinanceAccount, FinanceCategory, FinanceLoan } from "@/types";
import { useSaveFinanceLoanMutation } from "@/store/api/adminApi";
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
import {
  financeLoanSchema,
  LOAN_LIMITS,
  type FinanceLoanFormValues,
} from "@/lib/schemas";
import { CURRENCIES, formatMoney, rateFrom, type RateTable } from "@/lib/money";
import { toLocalISODate } from "@/lib/date-utils";
import { getErrorMessage } from "@/lib/utils";
import { emiFor } from "./loan-schedule";

/** Radix Select cannot hold an empty value, so "none" stands in for null. */
const NONE = "__none";

/** Rupees read in lakh and crore groups; everything else in the module's locale. */
export function loanMoney(amount: number, currency: string, whole = false) {
  return formatMoney(
    { amount, currency },
    { whole, locale: currency === "INR" ? "en-IN" : undefined },
  );
}

export function LoanForm({
  loan,
  accounts,
  categories,
  base,
  rates,
  onDone,
}: {
  loan: FinanceLoan | null;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  base: string;
  rates: RateTable;
  onDone: (savedId?: string) => void;
}) {
  const [saveLoan, { isLoading }] = useSaveFinanceLoanMutation();

  const form = useForm<FinanceLoanFormValues>({
    resolver: zodResolver(financeLoanSchema),
    defaultValues: {
      name: loan?.name ?? "",
      lender: loan?.lender ?? "",
      currency: loan?.currency ?? "INR",
      principal: loan ? Number(loan.principal) : undefined,
      annual_rate: loan ? Number(loan.annual_rate) : undefined,
      tenure_months: loan?.tenure_months ?? 240,
      first_emi_date:
        loan?.first_emi_date ?? toLocalISODate(addMonths(new Date(), 1)),
      rate_type: loan?.rate_type ?? "floating",
      on_rate_change: loan?.on_rate_change ?? "tenure",
      pay_from_account_id: loan?.pay_from_account_id ?? null,
      category_id: loan?.category_id ?? null,
      notes: loan?.notes ?? "",
    },
  });

  const [principal, rate, tenure, currency] = form.watch([
    "principal",
    "annual_rate",
    "tenure_months",
    "currency",
  ]);
  const emi =
    Number(principal) > 0 && Number(tenure) > 0
      ? emiFor(Number(principal), Number(rate) || 0, Number(tenure), currency)
      : null;
  const toBase =
    currency === base ? null : rateFrom(rates, base, currency, base);
  const years = Number(tenure) / 12;

  const submit = async (values: FinanceLoanFormValues) => {
    try {
      const saved = await saveLoan({
        ...values,
        ...(loan?.id ? { id: loan.id } : {}),
        lender: values.lender?.trim() || null,
        notes: values.notes?.trim() || null,
        pay_from_account_id: values.pay_from_account_id ?? null,
        category_id: values.category_id ?? null,
      }).unwrap();
      toast.success(loan ? "Loan updated" : "Loan added");
      onDone(saved?.id);
    } catch (error) {
      toast.error("Could not save the loan", {
        description: getErrorMessage(error),
      });
    }
  };

  const liveAccounts = accounts.filter((account) => !account.archived_at);
  const spending = categories.filter(
    (category) => category.bucket !== "income" && category.bucket !== "transfer",
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={LOAN_LIMITS.NAME}
                  placeholder="Home loan — Pune flat"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="lender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lender</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    maxLength={LOAN_LIMITS.LENDER}
                    placeholder="SBI, HDFC…"
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

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="principal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount borrowed</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder="5000000"
                    className="tabular-nums"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="annual_rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rate (% a year)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="8.5"
                    className="tabular-nums"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tenure_months"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tenure (months)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    className="tabular-nums"
                  />
                </FormControl>
                {years > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {Number.isInteger(years)
                      ? `${years} years`
                      : `${years.toFixed(1)} years`}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/*
          The number the whole form is for. Shown live because the first thing
          anyone does with a loan offer is change the tenure to see what the
          instalment becomes.
        */}
        <div className="rounded-surface bg-secondary/60 p-3 text-sm">
          {emi === null ? (
            <span className="text-muted-foreground">
              Enter the amount and tenure to see the EMI.
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">EMI </span>
              <strong className="font-semibold tabular-nums text-foreground">
                {loanMoney(emi, currency)}
              </strong>
              {currency !== base && (
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {toBase === null
                    ? `no ${currency} rate yet`
                    : `≈ ${formatMoney({ amount: emi * toBase, currency: base })} at today's rate`}
                </span>
              )}
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="first_emi_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First EMI</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rate_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rate</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="floating">Floating</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="on_rate_change"
            render={({ field }) => (
              <FormItem>
                <FormLabel>When the rate moves</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="tenure">Tenure changes</SelectItem>
                    <SelectItem value="emi">EMI changes</SelectItem>
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
            name="pay_from_account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid from</FormLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(value) =>
                    field.onChange(value === NONE ? null : value)
                  }
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {liveAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  An NRO/NRE account, or the Canadian account you remit from.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forecast under</FormLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(value) =>
                    field.onChange(value === NONE ? null : value)
                  }
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Loan repayments</SelectItem>
                    {spending.map((category) => (
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
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={LOAN_LIMITS.NOTES}
                  placeholder="Sanction letter reference, benchmark, reset dates…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {loan ? "Save changes" : "Add loan"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
