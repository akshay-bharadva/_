"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AccountKind, FinanceAccount } from "@/types";
import { useSaveFinanceAccountMutation } from "@/store/api/adminApi";
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
import { accountKindLabel } from "./account-card";

const KINDS: AccountKind[] = [
  "chequing",
  "savings",
  "credit",
  "cash",
  "investment",
  "loan",
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Create or reconcile an account.
 *
 * The form is deliberately built around the reconciliation anchor rather than
 * around "starting balance", because that is what it is used for after day one:
 * you open this to say "the statement says 2,431.18 today", and everything
 * after that date is derived from the transactions you have entered.
 *
 * That is the answer to "credit card bills are uncertain" — you are never asked
 * to reconstruct a ledger, only to state what a balance actually was on a date
 * you have evidence for.
 */
export function AccountForm({
  account,
  baseCurrency,
  onDone,
}: {
  account?: FinanceAccount;
  baseCurrency: string;
  onDone: () => void;
}) {
  const [saveAccount, { isLoading }] = useSaveFinanceAccountMutation();

  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "chequing");
  const [currency, setCurrency] = useState(account?.currency ?? baseCurrency);
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [balance, setBalance] = useState(
    String(account?.opening_balance ?? "0"),
  );
  const [asOf, setAsOf] = useState(account?.opening_date ?? today());
  const [creditLimit, setCreditLimit] = useState(
    account?.credit_limit ? String(account.credit_limit) : "",
  );
  const [isLiquid, setIsLiquid] = useState(account?.is_liquid ?? true);

  const isDebt = kind === "credit" || kind === "loan";
  const parsedBalance = Number(balance);
  const validBalance = Number.isFinite(parsedBalance);
  const canSave = name.trim().length > 0 && validBalance && !isLoading;

  const submit = async () => {
    if (!canSave) return;
    try {
      await saveAccount({
        ...(account?.id ? { id: account.id } : {}),
        name: name.trim(),
        kind,
        currency,
        institution: institution.trim() || null,
        // A debt balance is entered as what you owe and stored as negative, so
        // the ledger arithmetic stays uniform: every account sums the same way
        // and net worth does not need to know which kind it is looking at.
        opening_balance: isDebt ? -Math.abs(parsedBalance) : parsedBalance,
        opening_date: asOf,
        credit_limit: creditLimit ? Math.abs(Number(creditLimit)) : null,
        is_liquid: isLiquid,
      }).unwrap();
      toast.success(account ? "Account updated" : "Account added");
      onDone();
    } catch (error) {
      toast.error("Could not save the account", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Everyday chequing"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="account-kind">Type</Label>
          <Select
            value={kind}
            onValueChange={(value) => setKind(value as AccountKind)}
          >
            <SelectTrigger id="account-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {accountKindLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="account-currency">
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
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account-institution">Bank (optional)</Label>
        <Input
          id="account-institution"
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
          placeholder="RBC"
        />
      </div>

      <div className="space-y-3 rounded-surface bg-secondary/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {account ? "Reconcile" : "Starting balance"}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            State what the account really held on a date you have evidence for —
            a statement, or the balance showing in your banking app right now.
            Everything after that is derived from the transactions you enter, so
            you never have to reconstruct a ledger to make this accurate again.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="account-balance">
              {isDebt ? "Amount owed" : "Balance"} ({currency})
            </Label>
            <Input
              id="account-balance"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              aria-invalid={!validBalance}
              className="tabular-nums"
            />
            {isDebt && (
              <p className="text-[11px] text-muted-foreground">
                Enter it as a positive number — 1,200 means you owe 1,200.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-asof">As of</Label>
            <Input
              id="account-asof"
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
            />
          </div>
        </div>
      </div>

      {kind === "credit" && (
        <div className="space-y-1.5">
          <Label htmlFor="account-limit">Credit limit (optional)</Label>
          <Input
            id="account-limit"
            type="number"
            inputMode="decimal"
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            placeholder="5000"
            className="tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            Used to show utilisation, which starts to matter above 30%.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
        <div className="space-y-0.5">
          <Label htmlFor="account-liquid" className="cursor-pointer">
            Reachable money
          </Label>
          <p className="text-xs text-muted-foreground">
            Off for anything locked away — a retirement account is real money
            that will not help you next month, so it counts towards net worth
            but not towards runway.
          </p>
        </div>
        <Switch
          id="account-liquid"
          checked={isLiquid}
          onCheckedChange={setIsLiquid}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={!canSave}>
          {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {account ? "Save" : "Add account"}
        </Button>
      </div>
    </div>
  );
}
