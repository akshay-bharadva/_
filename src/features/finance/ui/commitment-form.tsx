"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinCategory, FinCommitment } from "@/types";
import { useSaveFinCommitmentMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormDescription,
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
  FIN_COMMITMENT_KINDS,
  FIN_FREQUENCIES,
  finCommitmentFormSchema,
  type FinCommitmentFormInput,
} from "@/lib/schemas";
import { fromDecimal, money } from "../money/minor-units";
import { toInputValue } from "../money/format";

/** Radix reserves the empty string, so "none" needs a value of its own. */
const NONE = "none";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Something that repeats — a subscription, a salary, a mortgage.
 *
 * **One form for what v1 split in two.** A recurring rule and a loan were
 * separate tables with separate screens, so the same mortgage could be entered
 * as both and the forecast would count it twice; the Loans screen asked the
 * owner to *remember* to archive the duplicate. Here `kind` picks which half of
 * the form applies, and the row cannot hold both shapes — migration 026's
 * `fin_commitment_shape` sees to that, and the schema mirrors it so a mistake is
 * a message rather than a failed save.
 *
 * **Direction comes from the accounts.** Naming a source is money out, naming a
 * destination is money in, and naming both is a recurring transfer — the case v1
 * could not express at all, which is why its forecast watched money leave for
 * savings every fortnight and never arrive.
 */
export function CommitmentForm({
  commitment,
  commitments,
  accounts,
  categories,
  base,
  onDone,
}: {
  commitment?: FinCommitment;
  /** The rest, for the supersession picker. */
  commitments: FinCommitment[];
  accounts: FinAccount[];
  categories: FinCategory[];
  base: string;
  onDone: () => void;
}) {
  const [saveCommitment, { isLoading }] = useSaveFinCommitmentMutation();

  const currency = commitment?.currency ?? base;

  const form = useForm<FinCommitmentFormInput>({
    resolver: zodResolver(finCommitmentFormSchema),
    defaultValues: {
      name: commitment?.name ?? "",
      kind: commitment?.kind ?? "fixed",
      currency,
      from_account_id: commitment?.from_account_id ?? null,
      to_account_id: commitment?.to_account_id ?? null,
      category_id: commitment?.category_id ?? null,
      amount: commitment?.amount_minor
        ? toInputValue(money(commitment.amount_minor, currency))
        : "",
      principal: commitment?.principal_minor
        ? toInputValue(money(commitment.principal_minor, currency))
        : "",
      annual_rate:
        commitment?.annual_rate == null ? null : Number(commitment.annual_rate),
      tenure_months: commitment?.tenure_months ?? null,
      rate_type: commitment?.rate_type ?? null,
      on_rate_change: commitment?.on_rate_change ?? null,
      lender: commitment?.lender ?? "",
      frequency: commitment?.frequency ?? "monthly",
      start_date: commitment?.start_date ?? toLocalISODate(),
      end_date: commitment?.end_date ?? null,
      // `?? null`, not left undefined: Sunday is `0`, and an undefined here
      // makes the field uncontrolled and the value quietly unsubmittable.
      occurrence_day: commitment?.occurrence_day ?? null,
      auto_post: commitment?.auto_post ?? false,
      is_estimate: commitment?.is_estimate ?? false,
      supersedes_id: commitment?.supersedes_id ?? null,
      notes: commitment?.notes ?? "",
    },
  });

  const kind = form.watch("kind");
  const frequency = form.watch("frequency");
  const chosenCurrency = form.watch("currency");
  const fromId = form.watch("from_account_id");
  const toId = form.watch("to_account_id");

  /**
   * A day that its frequency cannot produce is rejected by the column, so the
   * field is cleared when the frequency changes rather than left carrying a
   * value the new frequency has no meaning for.
   */
  useEffect(() => {
    if (frequency === "daily" || frequency === "yearly") {
      form.setValue("occurrence_day", null);
      return;
    }
    const current = form.getValues("occurrence_day");
    if (
      (frequency === "weekly" || frequency === "bi-weekly") &&
      current !== null &&
      current > 6
    ) {
      form.setValue("occurrence_day", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  const live = (id: string | null) =>
    accounts.filter((account) => !account.archived_at || account.id === id);

  const relevant = categories.filter(
    (category) => !category.archived_at && category.bucket !== "transfer",
  );

  /** Anything else that could be the thing this one replaces. */
  const supersedable = commitments.filter(
    (entry) => entry.id !== commitment?.id && !entry.archived_at,
  );

  const handleSubmit = async (values: FinCommitmentFormInput) => {
    let row: Partial<FinCommitment>;

    try {
      const fixed = values.kind === "fixed";

      row = {
        ...(commitment?.id ? { id: commitment.id } : {}),
        name: values.name.trim(),
        kind: values.kind,
        currency: values.currency,
        from_account_id: values.from_account_id,
        to_account_id: values.to_account_id,
        category_id: values.category_id,

        // Each kind carries its own fields and explicitly nulls the other's.
        // Sending both would be refused by `fin_commitment_shape`.
        amount_minor: fixed
          ? fromDecimal(values.amount, values.currency).minor
          : null,
        principal_minor: fixed
          ? null
          : fromDecimal(values.principal, values.currency).minor,
        annual_rate: fixed ? null : values.annual_rate,
        tenure_months: fixed ? null : values.tenure_months,
        rate_type: fixed ? null : (values.rate_type ?? "fixed"),
        on_rate_change: fixed ? null : (values.on_rate_change ?? "tenure"),
        lender: fixed ? null : values.lender?.trim() || null,

        frequency: values.frequency,
        start_date: values.start_date,
        end_date: values.end_date,
        occurrence_day: values.occurrence_day,
        auto_post: values.auto_post,
        is_estimate: values.is_estimate,
        supersedes_id: values.supersedes_id,
        notes: values.notes?.trim() || null,
      };
    } catch (error) {
      toast.error("That amount does not look like a number", {
        description: getErrorMessage(error),
      });
      return;
    }

    try {
      await saveCommitment(row).unwrap();
      toast.success(commitment ? "Commitment updated" : "Commitment added");
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Rent" />
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
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-wrap items-center gap-4 pt-1"
                >
                  {FIN_COMMITMENT_KINDS.map((option) => (
                    <FormItem
                      key={option}
                      className="flex items-center space-x-2 space-y-0"
                    >
                      <FormControl>
                        <RadioGroupItem value={option} id={`kind-${option}`} />
                      </FormControl>
                      <FormLabel
                        htmlFor={`kind-${option}`}
                        className="font-normal capitalize"
                      >
                        {option === "fixed"
                          ? "A fixed amount"
                          : "A loan that amortises"}
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormDescription>
                A subscription or rent is fixed. A loan derives its instalment
                from what was borrowed, the rate and the term — so it is entered
                once and the schedule is worked out rather than typed in.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {kind === "fixed" ? (
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ({chosenCurrency})</FormLabel>
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
        ) : (
          <div className="space-y-4 rounded-surface bg-secondary/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="principal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Borrowed ({chosenCurrency})</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
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
                name="annual_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate (% a year)</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                        inputMode="decimal"
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="tenure_months"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Over (months)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={600}
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lender (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="on_rate_change"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>When the rate changes</FormLabel>
                  <Select
                    value={field.value ?? "tenure"}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="tenure">
                        Keep the instalment, change the term
                      </SelectItem>
                      <SelectItem value="emi">
                        Keep the term, change the instalment
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Indian lenders usually hold the instalment and move the
                    tenure; some do the reverse. It decides what a rate rise
                    actually does to you.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="from_account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid from</FormLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(value) => {
                    const id = value === NONE ? null : value;
                    field.onChange(id);
                    const account = accounts.find((entry) => entry.id === id);
                    if (account) form.setValue("currency", account.currency);
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>Nowhere in particular</SelectItem>
                    {live(fromId).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
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
            name="to_account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid into</FormLabel>
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
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>Nowhere in particular</SelectItem>
                    {live(toId).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Both set means money moving between your own accounts.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
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
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Uncategorised</SelectItem>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>How often</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FIN_FREQUENCIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "bi-weekly" ? "Every two weeks" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {(frequency === "weekly" || frequency === "bi-weekly") && (
            <FormField
              control={form.control}
              name="occurrence_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Which day</FormLabel>
                  <Select
                    value={field.value === null ? NONE : String(field.value)}
                    onValueChange={(value) =>
                      field.onChange(value === NONE ? null : Number(value))
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>From the start date</SelectItem>
                      {WEEKDAYS.map((label, index) => (
                        <SelectItem key={label} value={String(index)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {frequency === "monthly" && (
            <FormField
              control={form.control}
              name="occurrence_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Day of the month</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                        )
                      }
                      placeholder="e.g. 15"
                      className="tabular-nums"
                    />
                  </FormControl>
                  <FormDescription>
                    The 31st falls back to the last day of shorter months, and
                    returns to the 31st afterwards rather than drifting.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends (optional)</FormLabel>
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
        </div>

        {supersedable.length > 0 && (
          <FormField
            control={form.control}
            name="supersedes_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Replaces (optional)</FormLabel>
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
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>Nothing</SelectItem>
                    {supersedable.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The one this takes over from — a mortgage replacing a tenancy.
                  Whatever you pick stops the day before this starts, so you do
                  not have to remember to end it yourself. This is the single
                  thing that caused the forecast to fall for months on end.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="space-y-3">
          <FormField
            control={form.control}
            name="auto_post"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
                <div className="space-y-0.5">
                  <FormLabel className="cursor-pointer">
                    Record it automatically
                  </FormLabel>
                  <FormDescription>
                    Off by default, so each occurrence waits for the real
                    amount. Turn it on only for genuinely fixed figures — a
                    rent, a subscription.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
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
              <FormItem className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
                <div className="space-y-0.5">
                  <FormLabel className="cursor-pointer">
                    The amount varies
                  </FormLabel>
                  <FormDescription>
                    A typical figure rather than a fixed one — a utility bill, a
                    variable paycheque.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {commitment ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
