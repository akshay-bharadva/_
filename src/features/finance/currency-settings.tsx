"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { FinanceSettings } from "@/types";
import {
  useSaveFinanceSettingsMutation,
  useSeedFinanceDefaultsMutation,
} from "@/store/api/adminApi";
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
import { CURRENCIES } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils";
import { isRateAvailable } from "./fx-source";

/**
 * Base currency and the coaching targets.
 *
 * Changing the base currency is safe and reversible, which is the whole payoff
 * of freezing a rate on every transaction: each row already knows what it was
 * worth on the day it happened, so switching what the reports total in
 * re-reads that history rather than rewriting it.
 */
export function CurrencySettings({
  settings,
  onDone,
}: {
  settings: FinanceSettings;
  onDone: () => void;
}) {
  const [saveSettings, { isLoading }] = useSaveFinanceSettingsMutation();
  const [seedDefaults, { isLoading: isSeeding }] =
    useSeedFinanceDefaultsMutation();

  const [base, setBase] = useState(settings.base_currency);
  const [needs, setNeeds] = useState(String(settings.needs_target_pct));
  const [wants, setWants] = useState(String(settings.wants_target_pct));
  const [save, setSave] = useState(String(settings.save_target_pct));
  const [runway, setRunway] = useState(String(settings.runway_target_months));

  const total = Number(needs) + Number(wants) + Number(save);
  // Not enforced — some people deliberately run 40/20/40 — but a split that
  // does not add up is almost always a typo, and saying so beats silently
  // rendering three bars that cannot all be met.
  const totalOff = Number.isFinite(total) && Math.abs(total - 100) > 0.01;

  const submit = async () => {
    try {
      await saveSettings({
        base_currency: base,
        needs_target_pct: Number(needs),
        wants_target_pct: Number(wants),
        save_target_pct: Number(save),
        runway_target_months: Number(runway),
      }).unwrap();
      toast.success("Settings saved");
      onDone();
    } catch (error) {
      toast.error("Could not save", { description: getErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="base-currency">Base currency</Label>
        <Select value={base} onValueChange={setBase}>
          <SelectTrigger id="base-currency">
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
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every report totals in this. Changing it is safe: each transaction
          already stores the rate it happened at, so switching re-reads your
          history rather than re-pricing it at today&apos;s market.
        </p>
        {!isRateAvailable(base) && (
          <p className="text-xs text-chart-3">
            The free rate feed does not publish {base}, so amounts in other
            currencies cannot be converted into it. Everything still records —
            totals will just say which rows they had to leave out.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-surface bg-secondary/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Spending targets
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The classic split is 50/30/20. Adjust it if that is not your life —
            supporting family from abroad usually pushes needs higher.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="target-needs" className="text-xs">
              Needs %
            </Label>
            <Input
              id="target-needs"
              type="number"
              value={needs}
              onChange={(event) => setNeeds(event.target.value)}
              className="h-9 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-wants" className="text-xs">
              Wants %
            </Label>
            <Input
              id="target-wants"
              type="number"
              value={wants}
              onChange={(event) => setWants(event.target.value)}
              className="h-9 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-save" className="text-xs">
              Save %
            </Label>
            <Input
              id="target-save"
              type="number"
              value={save}
              onChange={(event) => setSave(event.target.value)}
              className="h-9 tabular-nums"
            />
          </div>
        </div>

        {totalOff && (
          <p className="text-xs text-chart-3">
            These add up to {total.toFixed(0)}%, not 100. That is allowed, but
            it is usually a typo.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="target-runway">Emergency fund target (months)</Label>
        <Input
          id="target-runway"
          type="number"
          step="0.5"
          value={runway}
          onChange={(event) => setRunway(event.target.value)}
          className="tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          Months of essential spending your reachable savings should cover. Six
          is the usual advice; further from family, further from a spare room,
          it is worth more.
        </p>
      </div>

      <div className="rounded-surface bg-card p-4 shadow-e1">
        <p className="text-sm font-medium text-foreground">
          Starter categories
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Creates nineteen categories already sorted into needs, wants and
          savings, with the essential ones marked — the two fields the 50/30/20
          check and the runway calculation depend on, and the two nobody thinks
          to fill in. Safe to run more than once; it never touches a category
          you already have.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={isSeeding}
          onClick={async () => {
            try {
              await seedDefaults(base).unwrap();
              toast.success("Starter categories added");
            } catch (error) {
              toast.error("Could not add them", {
                description: getErrorMessage(error),
              });
            }
          }}
        >
          {isSeeding && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Add starter categories
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
