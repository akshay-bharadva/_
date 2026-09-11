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
  Upload,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import type { FinancialGoal, RecurringTransaction, Transaction } from "@/types";
import {
  useDeleteTransactionMutation,
  useGetAccountBalancesQuery,
  useGetFinanceAccountsQuery,
  useGetFinanceBudgetsQuery,
  useGetFinanceCategoriesQuery,
  useGetFinanceLoansQuery,
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
import { rateFrom, type RateTable } from "@/lib/money";
import { toLocalISODate } from "@/lib/date-utils";
import { cn } from "@/lib/cn";
import { DEFAULT_SECTION, FINANCE_SECTIONS, findSection } from "./finance-nav";
import { useFxSync } from "./use-fx-sync";
import { usePrivateFigures } from "./use-private-figures";
import { OverviewSection } from "./overview-section";
import { LedgerSection } from "./ledger-section";
import { TransactionForm } from "./transaction-form";
import { TransferForm } from "./transfer-form";
import { CurrencySettings } from "./currency-settings";
import type { ExtraFlow } from "./category-forecast";
import {
  buildLoanSchedule,
  eventsOf,
  termsOf,
  upcomingPayments,
} from "./loan-schedule";

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

const GuideSection = dynamic(
  () => import("./guide-section").then((mod) => mod.GuideSection),
  { ssr: false, loading: sectionLoader },
);

const ImportSection = dynamic(
  () => import("./import-section").then((mod) => mod.ImportSection),
  { ssr: false, loading: sectionLoader },
);
const ReportsSection = dynamic(
  () => import("./reports-section").then((mod) => mod.ReportsSection),
  { ssr: false, loading: sectionLoader },
);

const LoansSection = dynamic(
  () => import("./loans-section").then((mod) => mod.LoansSection),
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
  const { data: budgets = [] } = useGetFinanceBudgetsQuery();
  const { data: loans = [], isError: loansFailed } = useGetFinanceLoansQuery();
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
  const { hidden, toggle } = usePrivateFigures();
  const [addingGoal, setAddingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [editingRule, setEditingRule] = useState<RecurringTransaction | null>(
    null,
  );

  const transactions = financialData?.transactions ?? [];
  const recurring = financialData?.recurring ?? [];
  const goals = financialData?.goals ?? [];
  const base = settings?.base_currency ?? "CAD";

  /** Base-quoted rates, one per currency — the table every conversion reads. */
  const rateTable = useMemo(() => {
    const table: RateTable = {};
    for (const row of fxRates) {
      if (row.base === base && !(row.quote in table)) {
        table[row.quote] = Number(row.rate);
      }
    }
    return table;
  }, [fxRates, base]);

  /**
   * Balances converted to base, each at its own currency's rate.
   *
   * Computed here rather than in each section so every figure in the module
   * agrees. Summing raw balances across currencies is arithmetic on
   * incompatible units, and an account with no cached rate is left out rather
   * than counted at parity.
   */
  const balancesInBase = useMemo(() => {
    const converted: Record<string, number> = {};
    for (const account of accounts) {
      const balance = balances[account.id];
      if (balance === undefined) continue;
      if (account.currency === base) {
        converted[account.id] = balance;
        continue;
      }
      const rate = rateFrom(rateTable, base, account.currency, base);
      if (rate !== null) converted[account.id] = balance * rate;
    }
    return converted;
  }, [accounts, balances, rateTable, base]);

  /**
   * Every loan instalment still to come, in the loan's own currency. The
   * forecast converts them, and names a loan whose currency has no rate
   * rather than counting it at parity.
   */
  const loanFlows = useMemo<ExtraFlow[]>(() => {
    const today = toLocalISODate(new Date());
    return loans
      .filter((loan) => !loan.archived_at)
      .flatMap((loan) =>
        upcomingPayments(
          buildLoanSchedule(termsOf(loan), eventsOf(loan)),
          loan.name,
          today,
        ).map((payment) => ({
          ...payment,
          currency: loan.currency,
          categoryId: loan.category_id ?? null,
        })),
      );
  }, [loans]);

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
    <ManagerWrapper className={cn("pb-4", hidden && "figures-hidden")}>
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
              {/*
                A defence against the person standing behind you, and nothing
                more — the figures are one click away. Saying so is the point:
                the Security screen was rewritten because a control that
                overstates what it protects is worse than one that does less.
              */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggle}
                aria-pressed={hidden}
                title={
                  hidden
                    ? "Show the amounts again"
                    : "Blur every amount on screen — for this browser session only"
                }
              >
                {hidden ? (
                  <Eye className="mr-1.5 size-3.5" aria-hidden />
                ) : (
                  <EyeOff className="mr-1.5 size-3.5" aria-hidden />
                )}
                {hidden ? "Show" : "Hide"} amounts
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
                  <DropdownMenuItem onSelect={() => setSectionId("import")}>
                    <Upload className="mr-2 size-4" />
                    Import a statement
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
                onEdit={setEditingRule}
              />
            </div>
          )}

          {sectionId === "plan" && (
            <PlanSection
              categories={categories}
              transactions={transactions}
              goals={goals}
              accounts={accounts}
              settings={settings}
              onEditGoal={setEditingGoal}
            />
          )}

          {sectionId === "reports" && (
            <ReportsSection
              transactions={transactions}
              categories={categories}
              settings={settings}
              onImport={() => setSectionId("import")}
            />
          )}

          {sectionId === "import" && (
            <ImportSection
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              settings={settings}
            />
          )}

          {sectionId === "loans" && (
            <LoansSection
              loans={loans}
              failed={loansFailed}
              accounts={accounts}
              categories={categories}
              settings={settings}
              rates={rateTable}
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
              rates={rateTable}
              loanFlows={loanFlows}
            />
          )}

          {sectionId === "guide" && (
            <GuideSection
              accounts={accounts}
              categories={categories}
              recurring={recurring}
              transactions={transactions}
              budgets={budgets}
              onGo={setSectionId}
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
        open={addingRule || editingRule !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddingRule(false);
            setEditingRule(null);
          }
        }}
        title={
          editingRule ? `Edit ${editingRule.description}` : "New recurring rule"
        }
        description="Something that repeats. You choose whether it records itself or asks first."
      >
        <RecurringTransactionForm
          recurringTransaction={editingRule}
          categories={categories}
          accounts={accounts}
          onSuccess={() => {
            setAddingRule(false);
            setEditingRule(null);
          }}
        />
      </FormSheet>

      <FormSheet
        open={addingGoal || editingGoal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddingGoal(false);
            setEditingGoal(null);
          }
        }}
        title={editingGoal ? `Edit ${editingGoal.name}` : "New goal"}
        description="What the money left over is for."
      >
        <FinancialGoalForm
          goal={editingGoal}
          accounts={accounts}
          onSuccess={() => {
            setAddingGoal(false);
            setEditingGoal(null);
          }}
        />
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
