"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinanceAccount, FinancialGoal } from "@/types";
import { useSaveGoalMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getErrorMessage, parseLocalDate } from "@/lib/utils";
import {
  financialGoalSchema,
  type FinancialGoalFormValues,
} from "@/lib/schemas";

interface FinancialGoalFormProps {
  goal: Partial<FinancialGoal> | null;
  accounts?: FinanceAccount[];
  onSuccess: () => void;
}

/** Radix reserves the empty string, so "no account" needs its own value. */
const NO_ACCOUNT = "none";

export function FinancialGoalForm({
  goal,
  accounts = [],
  onSuccess,
}: FinancialGoalFormProps) {
  const [saveGoal, { isLoading }] = useSaveGoalMutation();

  const form = useForm<FinancialGoalFormValues>({
    resolver: zodResolver(financialGoalSchema),
    defaultValues: {
      name: goal?.name ?? "",
      description: goal?.description ?? "",
      target_amount: goal?.target_amount ?? 0,
      target_date: goal?.target_date ?? "",
      // Carried through rather than defaulted: progress is edited via "Add
      // Funds", and the schema's `.default(0)` would otherwise write a zero
      // back over the saved amount every time the goal was edited.
      current_amount: goal?.current_amount ?? 0,
      account_id: goal?.account_id ?? null,
    },
  });

  const handleSubmit = async (values: FinancialGoalFormValues) => {
    try {
      await saveGoal({ ...values, id: goal?.id }).unwrap();
      toast.success(`Goal "${values.name}" saved successfully.`);
      onSuccess();
    } catch (err: unknown) {
      toast.error("Failed to save goal", { description: getErrorMessage(err) });
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4 pt-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Goal Name *</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
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
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kept in</FormLabel>
              <Select
                value={field.value ?? NO_ACCOUNT}
                onValueChange={(value) =>
                  field.onChange(value === NO_ACCOUNT ? null : value)
                }
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>No particular account</SelectItem>
                  {accounts
                    .filter(
                      (account) =>
                        !account.archived_at || account.id === field.value,
                    )
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Where the money sits. Adding or withdrawing starts from this
                account; you can pick another each time.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="target_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Amount *</FormLabel>
                <FormControl>
                  <Input type="number" step="100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="target_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Date</FormLabel>
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
                      selected={
                        field.value ? parseLocalDate(field.value) : undefined
                      }
                      onSelect={(date) =>
                        field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          {/*
            A "Vision Board Image URL" field used to sit here bound to
            `image_url`. `financial_goals` has no such column and `FinancialGoal`
            has no such field, so anything typed into it was either rejected by
            Postgres or silently dropped. Removed rather than wired up, since
            adding the column is a schema change and the owner's call.
          */}
        </div>
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {goal?.id ? "Save Changes" : "Create Goal"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
