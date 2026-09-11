"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceCategory,
  RecurringTransaction,
} from "@/types";
import { useSaveRecurringMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getErrorMessage, parseLocalDate } from "@/lib/utils";
import {
  recurringTransactionSchema,
  type RecurringTransactionFormValues,
} from "@/lib/schemas";
import { toLocalISODate } from "@/lib/date-utils";

interface RecurringTransactionFormProps {
  recurringTransaction: Partial<RecurringTransaction> | null;
  categories: FinanceCategory[];
  /** Accounts the rule can move money through. */
  accounts?: FinanceAccount[];
  onSuccess: () => void;
}

/** A select needs a value for "no category"; Radix reserves the empty string. */
const NO_CATEGORY = "none";
/** The same, for "no account". */
const NO_ACCOUNT = "no-account";

export function RecurringTransactionForm({
  recurringTransaction,
  categories,
  accounts = [],
  onSuccess,
}: RecurringTransactionFormProps) {
  const [saveRecurring, { isLoading }] = useSaveRecurringMutation();
  const form = useForm<RecurringTransactionFormValues>({
    resolver: zodResolver(recurringTransactionSchema),
    defaultValues: {
      description: recurringTransaction?.description ?? "",
      amount: recurringTransaction?.amount ?? 0,
      type: recurringTransaction?.type ?? "expense",
      category: recurringTransaction?.category ?? "",
      frequency: recurringTransaction?.frequency ?? "monthly",
      start_date: recurringTransaction?.start_date ?? toLocalISODate(),
      end_date: recurringTransaction?.end_date ?? null,
      // `?? null` rather than leaving it undefined: day-of-week 0 (Sunday) is a
      // real value, and an undefined here made the field uncontrolled.
      occurrence_day: recurringTransaction?.occurrence_day ?? null,
      account_id: recurringTransaction?.account_id ?? null,
      category_id: recurringTransaction?.category_id ?? null,
      currency: recurringTransaction?.currency ?? null,
      auto_post: recurringTransaction?.auto_post ?? false,
      is_estimate: recurringTransaction?.is_estimate ?? false,
    },
  });

  const frequency = form.watch("frequency");
  const type = form.watch("type");
  const currency = form.watch("currency");
  const accountId = form.watch("account_id");

  // An archived account stays listed only for a rule already pointing at it,
  // so editing that rule does not silently blank the field.
  const liveAccounts = accounts.filter(
    (account) => !account.archived_at || account.id === accountId,
  );

  /**
   * Income categories for income, spending categories for spending — the same
   * rule the transaction form applies, and the reason it is worth sharing the
   * control rather than the markup: offering "Salary" on an expense rule is
   * how a ledger ends up with figures nobody can explain.
   */
  const relevantCategories = categories.filter(
    (category) =>
      !category.archived_at &&
      category.bucket !== "transfer" &&
      (type === "earning"
        ? category.bucket === "income"
        : category.bucket !== "income"),
  );

  useEffect(() => {
    if (frequency === "daily" || frequency === "yearly") {
      form.setValue("occurrence_day", null);
    } else if (frequency === "weekly" || frequency === "bi-weekly") {
      const current = form.getValues("occurrence_day");
      if (current == null || current > 6) {
        // Reset to start_date's day of week
        const sd = form.getValues("start_date");
        if (sd)
          form.setValue("occurrence_day", new Date(sd + "T00:00:00").getDay());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  const handleSubmit = async (values: RecurringTransactionFormValues) => {
    try {
      await saveRecurring({
        ...values,
        id: recurringTransaction?.id,
      }).unwrap();
      toast.success(`Recurring rule "${values.description}" saved.`);
      onSuccess();
    } catch (err: unknown) {
      toast.error("Failed to save rule", { description: getErrorMessage(err) });
    }
  };

  const renderDateField = (
    field: {
      value: string | null | undefined;
      onChange: (value: string | null) => void;
    },
    clearTo: string | null,
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !field.value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {field.value ? (
              format(parseLocalDate(field.value), "PPP")
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={field.value ? parseLocalDate(field.value) : undefined}
          onSelect={(date) =>
            field.onChange(date ? format(date, "yyyy-MM-dd") : clearTo)
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4 pt-4"
      >
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description *</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Amount{currency ? ` (${currency})` : ""} *
                </FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/*
            The same picker the transaction form uses, over the same rows,
            filtered the same way.

            It was a free-text `<Input>`. Two consequences: the same field was
            two different controls depending on which form you happened to
            open, and a rule could carry a category name that matched no
            category — so it never set `category_id`, and every derived figure
            that groups by category silently omitted it.
          */}
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  value={field.value ?? NO_CATEGORY}
                  onValueChange={(value) => {
                    const id = value === NO_CATEGORY ? null : value;
                    field.onChange(id);
                    // `category` is the denormalised name the ledger displays;
                    // keeping the two in step here is what stops a rule
                    // showing one category and counting toward another.
                    form.setValue(
                      "category",
                      categories.find((entry) => entry.id === id)?.name ?? "",
                    );
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Uncategorised" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
                    {relevantCategories.map((category) => (
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
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type *</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex items-center gap-4 pt-2"
                >
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <RadioGroupItem value="expense" />
                    </FormControl>
                    <FormLabel className="font-normal">Expense</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <RadioGroupItem value="earning" />
                    </FormControl>
                    <FormLabel className="font-normal">Earning</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/*
          Which account the money moves through. The rule takes that
          account's currency, so a payment from a rupee account is projected
          in rupees and converted — not counted as if it were dollars.
        */}
        <FormField
          control={form.control}
          name="account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{type === "earning" ? "Paid into" : "Paid from"}</FormLabel>
              <Select
                value={field.value ?? NO_ACCOUNT}
                onValueChange={(value) => {
                  const id = value === NO_ACCOUNT ? null : value;
                  field.onChange(id);
                  form.setValue(
                    "currency",
                    accounts.find((entry) => entry.id === id)?.currency ?? null,
                  );
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="No account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-72">
                  <SelectItem value={NO_ACCOUNT}>No account</SelectItem>
                  {liveAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {currency
                  ? `The rule is in ${currency}, this account's currency.`
                  : "With no account, the rule is in your base currency."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 items-end gap-4">
          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frequency *</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="bi-weekly">
                      Bi-weekly (Every 2 Weeks)
                    </SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <AnimatePresence>
            {(frequency === "weekly" || frequency === "bi-weekly") && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <FormField
                  control={form.control}
                  name="occurrence_day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Week</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        defaultValue={
                          field.value !== null && field.value !== undefined
                            ? String(field.value)
                            : undefined
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">Sunday</SelectItem>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                          <SelectItem value="6">Saturday</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>
            )}
            {frequency === "monthly" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <FormField
                  control={form.control}
                  name="occurrence_day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Month</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          placeholder="e.g., 15"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? parseInt(e.target.value) : null,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date *</FormLabel>
                {renderDateField(field, "")}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date (Optional)</FormLabel>
                {renderDateField(field, null)}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/*
          The two switches that decide how this rule behaves, and the reason the
          module has a confirm queue at all. `auto_post` off is the default and
          the safe answer: a rule that posts itself produces a ledger that is
          confidently wrong the first time reality differs from the plan.
        */}
        <div className="space-y-3 pt-2">
          <FormField
            control={form.control}
            name="auto_post"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
                <div className="space-y-0.5">
                  <FormLabel className="cursor-pointer">
                    Record it automatically
                  </FormLabel>
                  <FormDescription>
                    Off by default, so each occurrence waits for you to confirm
                    the real amount. Turn this on only for genuinely fixed
                    amounts — rent, a subscription.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_estimate"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
                <div className="space-y-0.5">
                  <FormLabel className="cursor-pointer">
                    The amount varies
                  </FormLabel>
                  <FormDescription>
                    Marks this as a typical figure rather than a fixed one — a
                    utility bill, a variable paycheque.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {recurringTransaction?.id ? "Save Changes" : "Create Rule"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
