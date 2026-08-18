"use client";

import { useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import type { DateRange } from "react-day-picker";
import { addDays, format, startOfMonth } from "date-fns";
import {
  ArrowRightLeft,
  Calendar as CalendarIcon,
  Plus,
  Repeat,
  Settings2,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import type { FinancialGoal, RecurringTransaction, Transaction } from "@/types";
import {
  useAddFundsToGoalMutation,
  useDeleteGoalMutation,
  useDeleteRecurringMutation,
  useDeleteTransactionMutation,
  useGetFinancialDataQuery,
  useGetFinanceSettingsQuery,
  useGetFxRatesQuery,
  useGetFinanceCategoriesQuery,
  useGetFinanceAccountsQuery,
  useSaveRecurringMutation,
  useSaveTransactionMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { buildForecastData } from "@/lib/finance-utils";
import { useFxSync } from "./use-fx-sync";
import { TransferForm } from "./transfer-form";
import { CurrencySettings } from "./currency-settings";
import type { DialogState } from "./finance-types";
import { TransactionsTab } from "./transactions-tab";
import { RecurringTab } from "./recurring-tab";
import { GoalCard } from "./goal-card";
import { TransactionForm } from "./transaction-form";
import { RecurringTransactionForm } from "./recurring-transaction-form";
import { FinancialGoalForm } from "./financial-goal-form";
import { AddNewDrawer, MobileBottomNav, MoreDrawer } from "./mobile-nav";

const Calendar = dynamic(
  () => import("@/components/ui/calendar").then((mod) => mod.Calendar),
  { ssr: false },
);

// Both chart tabs pull in Recharts; the transaction and recurring tabs don't.
// Splitting them keeps the table-only views light, and the analytics chunk is
// only fetched once that tab is actually opened.
const chartTabLoader = () => <LoadingState variant="section" />;

const BudgetsTab = dynamic(
  () => import("./budgets-tab").then((mod) => mod.BudgetsTab),
  { ssr: false, loading: chartTabLoader },
);

const ForecastTab = dynamic(
  () => import("./forecast-tab").then((mod) => mod.ForecastTab),
  { ssr: false, loading: chartTabLoader },
);

const FxTab = dynamic(() => import("./fx-tab").then((mod) => mod.FxTab), {
  ssr: false,
  loading: chartTabLoader,
});

const AccountsTab = dynamic(
  () => import("./accounts-tab").then((mod) => mod.AccountsTab),
  { ssr: false, loading: chartTabLoader },
);

const DashboardTab = dynamic(
  () => import("./dashboard-tab").then((mod) => mod.DashboardTab),
  { ssr: false, loading: chartTabLoader },
);

const AnalyticsTab = dynamic(
  () => import("./analytics-tab").then((mod) => mod.AnalyticsTab),
  { ssr: false, loading: chartTabLoader },
);

export default function FinancePage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [sheetState, setSheetState] = useState<DialogState>({ type: null });
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { data: financialData, isLoading, error } = useGetFinancialDataQuery();
  const { data: financeSettings } = useGetFinanceSettingsQuery();
  // Rates for the base currency only; the accounts tab crosses pairs from
  // this single-base table rather than fetching each pair separately.
  const { data: fxRates = [] } = useGetFxRatesQuery(
    financeSettings?.base_currency ?? "CAD",
    { skip: !financeSettings },
  );

  // Tops up the rate cache when the module opens, and does nothing the rest of
  // the time — the ECB publishes once per working day, so polling buys nothing.
  useFxSync(financeSettings?.base_currency, fxRates);

  const { data: financeCategories = [] } = useGetFinanceCategoriesQuery();
  const { data: financeAccounts = [] } = useGetFinanceAccountsQuery();

  const [deleteTransaction] = useDeleteTransactionMutation();
  const [deleteRecurring] = useDeleteRecurringMutation();
  const [deleteGoal] = useDeleteGoalMutation();
  const [addFundsToGoal] = useAddFundsToGoalMutation();
  const [saveTransaction] = useSaveTransactionMutation();
  const [saveRecurring] = useSaveRecurringMutation();

  const { transactions = [], goals = [], recurring = [] } = financialData || {};

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const transactionDate = parseLocalDate(t.date);
      const descriptionMatch = t.description
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      if (!date?.from) return descriptionMatch;
      const toDate = date.to ? addDays(date.to, 1) : new Date(8640000000000000);
      const dateMatch =
        transactionDate >= date.from && transactionDate < toDate;
      return descriptionMatch && dateMatch;
    });
  }, [transactions, searchTerm, date]);

  const { totalEarnings, totalExpenses, netIncome } = useMemo(() => {
    let earnings = 0,
      expenses = 0;
    for (const t of filteredTransactions) {
      if (t.type === "earning") earnings += t.amount;
      else expenses += t.amount;
    }
    return {
      totalEarnings: earnings,
      totalExpenses: expenses,
      netIncome: earnings - expenses,
    };
  }, [filteredTransactions]);

  const allCategories = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .filter((t) => t.type === "expense" && t.category)
          .map((t) => t.category!),
      ),
    ).sort();
  }, [transactions]);

  const allYearsWithData = useMemo(() => {
    const years = new Set(
      transactions.map((t) => parseLocalDate(t.date).getFullYear()),
    );
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  const forecastData = useMemo(() => buildForecastData(recurring), [recurring]);

  const handleOpenSheet = (
    type: NonNullable<DialogState["type"]>,
    data?: DialogState["data"],
  ) => {
    setSheetState({ type, data });
    setIsAddDrawerOpen(false);
  };
  const handleCloseSheet = () => setSheetState({ type: null });

  const handleDelete = async (
    type: "transactions" | "recurring_transactions" | "financial_goals",
    id: string,
    message: string,
  ) => {
    const ok = await confirm({
      title: "Confirm Deletion",
      description: message,
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const mutation =
        type === "transactions"
          ? deleteTransaction
          : type === "recurring_transactions"
            ? deleteRecurring
            : deleteGoal;
      await mutation(id).unwrap();
      toast.success("Item deleted.");
    } catch (err: unknown) {
      toast.error(`Failed to delete: ${getErrorMessage(err)}`);
    }
  };

  const handleAddFunds = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get("amount") as string);
    const goal = sheetState.data as FinancialGoal;
    if (!amount || amount <= 0 || !goal) {
      toast.error("Invalid amount.");
      return;
    }
    try {
      await addFundsToGoal({ goal, amount }).unwrap();
      toast.success(`$${amount.toFixed(2)} added.`);
      handleCloseSheet();
    } catch (err: unknown) {
      toast.error("Failed to add funds", { description: getErrorMessage(err) });
    }
  };

  const handleConfirmRecurring = async (
    rule: RecurringTransaction,
    date: Date,
  ) => {
    try {
      await saveTransaction({
        date: format(date, "yyyy-MM-dd"),
        description: rule.description,
        amount: rule.amount,
        type: rule.type,
        category: rule.category,
        recurring_transaction_id: rule.id,
      }).unwrap();
      await saveRecurring({
        id: rule.id,
        last_processed_date: format(date, "yyyy-MM-dd"),
      }).unwrap();
      toast.success("Transaction logged.");
    } catch (err: unknown) {
      toast.error("Failed to log", { description: getErrorMessage(err) });
    }
  };

  if (isLoading) return <LoadingState />;
  if (error) return <p>Error loading data.</p>;

  return (
    <ManagerWrapper className="pb-20 md:pb-4">
      <PageHeader
        sticky
        title="Finance"
        description={
          date?.from
            ? date.to
              ? `${format(date.from, "MMM d")} - ${format(date.to, "MMM d, yyyy")}`
              : format(date.from, "MMMM d, yyyy")
            : "Select a date range"
        }
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Filter..."
        filters={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <CalendarIcon className="mr-2 size-4" /> Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>
        }
        actions={
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9">
                  <Plus className="mr-2 size-4" /> Add New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => handleOpenSheet("transaction")}
                >
                  <ArrowRightLeft className="mr-2 size-4" /> Transaction
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleOpenSheet("recurring")}>
                  <Repeat className="mr-2 size-4" /> Recurring Rule
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsSettingsOpen(true)}>
                  <Settings2 className="mr-2 size-4" />
                  Currency & targets
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsTransferOpen(true)}>
                  <ArrowRightLeft className="mr-2 size-4" />
                  Transfer
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleOpenSheet("goal")}>
                  <Target className="mr-2 size-4" /> Goal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="mt-6 space-y-6"
      >
        <div className="hidden md:block">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 lg:inline-grid lg:w-auto">
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="fx">Exchange</TabsTrigger>
          </TabsList>
        </div>

        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onAddNew={() => setIsAddDrawerOpen(true)}
          onMore={() => setIsMoreDrawerOpen(true)}
        />

        <TabsContent value="accounts">
          {financeSettings && (
            <AccountsTab
              settings={financeSettings}
              rates={fxRates}
              recurring={recurring}
              transactions={transactions}
            />
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <DashboardTab
            netIncome={netIncome}
            totalEarnings={totalEarnings}
            totalExpenses={totalExpenses}
            forecastData={forecastData}
            recurring={recurring}
            onConfirmRecurring={handleConfirmRecurring}
          />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab
            transactions={filteredTransactions}
            onEdit={(t) => handleOpenSheet("transaction", t)}
            onDelete={(id, desc) =>
              handleDelete("transactions", id, `Delete transaction "${desc}"?`)
            }
          />
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringTab
            recurring={recurring}
            onEdit={(r) => handleOpenSheet("recurring", r)}
            onDelete={(id) =>
              handleDelete("recurring_transactions", id, "Delete rule?")
            }
          />
        </TabsContent>

        <TabsContent value="goals">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onAddFunds={() => handleOpenSheet("addFunds", goal)}
                onEdit={() => handleOpenSheet("goal", goal)}
                onDelete={() =>
                  handleDelete("financial_goals", goal.id, `Delete goal?`)
                }
              />
            ))}
            {goals.length === 0 && (
              <div className="col-span-full rounded-surface border border-dashed py-12 text-center text-muted-foreground">
                No goals yet.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="budgets">
          {financeSettings && (
            <BudgetsTab
              categories={financeCategories}
              transactions={transactions}
              settings={financeSettings}
            />
          )}
        </TabsContent>

        <TabsContent value="forecast">
          {financeSettings && (
            <ForecastTab
              startingBalance={netIncome}
              rules={recurring}
              transactions={transactions}
              categories={financeCategories}
              settings={financeSettings}
            />
          )}
        </TabsContent>

        <TabsContent value="fx">
          {financeSettings && (
            <FxTab settings={financeSettings} transactions={transactions} />
          )}
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsTab
            transactions={transactions}
            allYears={allYearsWithData}
            allCategories={allCategories}
            recurring={recurring}
          />
        </TabsContent>
      </Tabs>

      <FormSheet
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        title="Currency & targets"
        description="What every report totals in, and what you are aiming for."
      >
        {financeSettings && (
          <CurrencySettings
            settings={financeSettings}
            onDone={() => setIsSettingsOpen(false)}
          />
        )}
      </FormSheet>

      <FormSheet
        open={isTransferOpen}
        onOpenChange={setIsTransferOpen}
        title="Record a transfer"
        description="Move money between your own accounts, including across a border."
      >
        <TransferForm
          accounts={financeAccounts}
          categories={financeCategories}
          onDone={() => setIsTransferOpen(false)}
        />
      </FormSheet>

      <AddNewDrawer
        open={isAddDrawerOpen}
        onOpenChange={setIsAddDrawerOpen}
        onSelect={handleOpenSheet}
      />

      <MoreDrawer
        open={isMoreDrawerOpen}
        onOpenChange={setIsMoreDrawerOpen}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setIsMoreDrawerOpen(false);
        }}
      />

      {/* Was a hand-rolled Sheet with its own header, close button and scroll
          container. FormSheet is the same shape and additionally becomes a
          bottom drawer on mobile, which every other module already did. */}
      <FormSheet
        open={!!sheetState.type}
        onOpenChange={(open) => !open && handleCloseSheet()}
        title={
          sheetState.type === "addFunds"
            ? "Add Funds"
            : `${sheetState.data ? "Edit" : "New"} ${sheetState.type ?? ""}`
        }
      >
        {sheetState.type === "transaction" && (
          <TransactionForm
            transaction={(sheetState.data as Transaction) ?? null}
            onSuccess={handleCloseSheet}
            categories={allCategories}
          />
        )}
        {sheetState.type === "recurring" && (
          <RecurringTransactionForm
            recurringTransaction={
              (sheetState.data as RecurringTransaction) ?? null
            }
            onSuccess={handleCloseSheet}
          />
        )}
        {sheetState.type === "goal" && (
          <FinancialGoalForm
            goal={(sheetState.data as FinancialGoal) ?? null}
            onSuccess={handleCloseSheet}
          />
        )}
        {sheetState.type === "addFunds" && (
          <form onSubmit={handleAddFunds} className="space-y-4">
            <div>
              <Label htmlFor="add-funds-amount">Amount</Label>
              <Input
                id="add-funds-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                className="text-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={handleCloseSheet}>
                Cancel
              </Button>
              <Button type="submit">Confirm</Button>
            </div>
          </form>
        )}
      </FormSheet>
    </ManagerWrapper>
  );
}
