"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRightLeft,
  Plus,
  Receipt,
  Repeat,
  Settings2,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import type { FinanceAccount, Transaction } from "@/types";
import {
  useDeleteTransactionMutation,
  useGetAccountBalancesQuery,
  useGetFinanceAccountsQuery,
  useGetFinanceCategoriesQuery,
  useGetFinanceSettingsQuery,
  useGetFinancialDataQuery,
  useGetFxRatesQuery,
  useGetRecurringSkipsQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  FormSheet,
  LoadingState,
  ManagerWrapper,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { rateFrom } from "@/lib/money";
import { cn } from "@/lib/cn";
import { DEFAULT_SECTION, FINANCE_SECTIONS, findSection } from "./finance-nav";
import { useFxSync } from "./use-fx-sync";
import { OverviewSection } from "./overview-section";
import { LedgerSection } from "./ledger-section";
import { TransactionForm } from "./transaction-form";
import { TransferForm } from "./transfer-form";
import { CurrencySettings } from "./currency-settings";

/**
 * The finance module.
 *
 * Rebuilt from eight tabs to a section rail — the same shape the Settings
 * rebuild landed on, for the same reason. Eight tabs is past the point where a
 * tab bar is navigation: it becomes a strip you read left to right hunting for
 * a word, and on a phone it wrapped to three rows. A rail has room to say what
 * each section is for, names where you are, and collapses to a sheet rather
 * than to a scrolling strip.
 *
 * The heavy sections are all behind `next/dynamic`. Three of them pull Recharts
 * and none of them is the one you land on.
 */

const sectionLoader = () => <LoadingState variant="section" />;

const AccountsSection = dynamic(
  () => import("./accounts-tab").then((mod) => mod.AccountsTab),
  { ssr: false, loading: sectionLoader },
);
const PlanSection = dynamic(
  () => import("./plan-section").then((mod) => mod.PlanSection),
  { ssr: false, loading: sectionLoader },
);
const ForecastSection = dynamic(
  () => import("./forecast-tab").then((mod) => mod.ForecastTab),
  { ssr: false, loading: sectionLoader },
);
const ExchangeSection = dynamic(
  () => import("./fx-tab").then((mod) => mod.FxTab),
  { ssr: false, loading: sectionLoader },
);
/**
 * Both of these pull the calendar picker (react-day-picker), and both only ever
 * appear inside a sheet you opened deliberately. Imported eagerly they put
 * ~90 kB into the first load of a page whose default section does not use them.
 */
const RecurringTransactionForm = dynamic(
  () =>
    import("./recurring-transaction-form").then(
      (mod) => mod.RecurringTransactionForm,
    ),
  { ssr: false, loading: sectionLoader },
);
const FinancialGoalForm = dynamic(
  () => import("./financial-goal-form").then((mod) => mod.FinancialGoalForm),
  { ssr: false, loading: sectionLoader },
);

const RecurringSection = dynamic(
  () => import("./recurring-section").then((mod) => mod.RecurringSection),
  { ssr: false, loading: sectionLoader },
);

export default function FinancePage() {
  const { data: financialData, isLoading } = useGetFinancialDataQuery();
  const { data: settings } = useGetFinanceSettingsQuery();
  const { data: accounts = [] } = useGetFinanceAccountsQuery();
  const { data: categories = [] } = useGetFinanceCategoriesQuery();
  const { data: balances = {} } = useGetAccountBalancesQuery();
  const { data: skips = [] } = useGetRecurringSkipsQuery();
  const { data: fxRates = [] } = useGetFxRatesQuery(
    settings?.base_currency ?? "CAD",
    { skip: !settings },
  );
  const [deleteTransaction] = useDeleteTransactionMutation();
  const confirm = useConfirm();

  useFxSync(settings?.base_currency, fxRates);

  const [sectionId, setSectionId] = useState(DEFAULT_SECTION);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [adding, setAdding] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);

  const transactions = financialData?.transactions ?? [];
  const recurring = financialData?.recurring ?? [];
  const goals = financialData?.goals ?? [];
  const base = settings?.base_currency ?? "CAD";

  /**
   * Balances converted to base, each at its own currency's rate.
   *
   * Computed here rather than in each section so every figure in the module
   * agrees. Summing raw balances across currencies is arithmetic on
   * incompatible units, and an account with no cached rate is left out rather
   * than counted at parity.
   */
  const balancesInBase = useMemo(() => {
    const table: Record<string, number> = {};
    for (const row of fxRates) {
      if (row.base === base && !(row.quote in table)) {
        table[row.quote] = Number(row.rate);
      }
    }

    const converted: Record<string, number> = {};
    for (const account of accounts) {
      const balance = balances[account.id];
      if (balance === undefined) continue;
      if (account.currency === base) {
        converted[account.id] = balance;
        continue;
      }
      const rate = rateFrom(table, base, account.currency, base);
      if (rate !== null) converted[account.id] = balance * rate;
    }
    return converted;
  }, [accounts, balances, fxRates, base]);

  const removeTransaction = async (id: string, description: string) => {
    const ok = await confirm({
      title: "Delete this transaction?",
      description: `"${description}" is removed permanently, and every balance it affected moves.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteTransaction(id).unwrap();
      toast.success("Transaction deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  if (isLoading || !settings) {
    return <LoadingState variant="page" label="Loading finance" />;
  }

  const section = findSection(sectionId);

  const nav = (
    <nav aria-label="Finance sections" className="space-y-1">
      {FINANCE_SECTIONS.map((entry) => {
        const Icon = entry.icon;
        const active = entry.id === sectionId;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSectionId(entry.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm transition-[box-shadow,color,background-color] duration-200 ease-enter",
              active
                ? "bg-card font-medium text-foreground shadow-e1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <ManagerWrapper className="pb-4">
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">{nav}</aside>

        <div className="min-w-0 space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">
                {section.label}
              </h1>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {section.description}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="lg:hidden"
                  >
                    Sections
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64">
                  <SheetHeader>
                    <SheetTitle>Finance</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">{nav}</div>
                </SheetContent>
              </Sheet>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfiguring(true)}
              >
                <Settings2 className="mr-1.5 size-3.5" />
                <span className="hidden sm:inline">Currency</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm">
                    <Plus className="mr-1.5 size-3.5" />
                    Add
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setAdding(true)}>
                    <Receipt className="mr-2 size-4" />
                    Transaction
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTransferring(true)}>
                    <ArrowRightLeft className="mr-2 size-4" />
                    Transfer
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAddingRule(true)}>
                    <Repeat className="mr-2 size-4" />
                    Recurring rule
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAddingGoal(true)}>
                    <Target className="mr-2 size-4" />
                    Goal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {sectionId === "overview" && (
            <OverviewSection
              accounts={accounts}
              balances={balances}
              balancesInBase={balancesInBase}
              transactions={transactions}
              recurring={recurring}
              skips={skips}
              categories={categories}
              settings={settings}
              onGoToAccounts={() => setSectionId("accounts")}
            />
          )}

          {sectionId === "accounts" && (
            <AccountsSection
              settings={settings}
              rates={fxRates}
              recurring={recurring}
              transactions={transactions}
            />
          )}

          {sectionId === "activity" && (
            <div className="space-y-8">
              <LedgerSection
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                settings={settings}
                onEdit={setEditing}
                onDelete={removeTransaction}
                onAdd={() => setAdding(true)}
                onTransfer={() => setTransferring(true)}
              />
              <RecurringSection
                recurring={recurring}
                accounts={accounts}
                settings={settings}
              />
            </div>
          )}

          {sectionId === "plan" && (
            <PlanSection
              categories={categories}
              transactions={transactions}
              goals={goals}
              settings={settings}
            />
          )}

          {sectionId === "forecast" && (
            <ForecastSection
              startingBalance={Object.values(balancesInBase).reduce(
                (sum, value) => sum + value,
                0,
              )}
              rules={recurring}
              transactions={transactions}
              categories={categories}
              settings={settings}
            />
          )}

          {sectionId === "exchange" && (
            <ExchangeSection settings={settings} transactions={transactions} />
          )}
        </div>
      </div>

      <FormSheet
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        title={editing ? "Edit transaction" : "Add transaction"}
      >
        <TransactionForm
          transaction={editing ?? undefined}
          accounts={accounts}
          categories={categories}
          settings={settings}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      </FormSheet>

      <FormSheet
        open={transferring}
        onOpenChange={setTransferring}
        title="Record a transfer"
        description="Move money between your own accounts, including across a border."
      >
        <TransferForm
          accounts={accounts}
          categories={categories}
          onDone={() => setTransferring(false)}
        />
      </FormSheet>

      <FormSheet
        open={addingRule}
        onOpenChange={setAddingRule}
        title="New recurring rule"
        description="Something that repeats. You choose whether it records itself or asks first."
      >
        <RecurringTransactionForm
          recurringTransaction={null}
          onSuccess={() => setAddingRule(false)}
        />
      </FormSheet>

      <FormSheet
        open={addingGoal}
        onOpenChange={setAddingGoal}
        title="New goal"
        description="What the money left over is for."
      >
        <FinancialGoalForm goal={null} onSuccess={() => setAddingGoal(false)} />
      </FormSheet>

      <FormSheet
        open={configuring}
        onOpenChange={setConfiguring}
        title="Currency & targets"
        description="What every report totals in, and what you are aiming for."
      >
        <CurrencySettings
          settings={settings}
          onDone={() => setConfiguring(false)}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}
