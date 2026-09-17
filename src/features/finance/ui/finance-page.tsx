"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRightLeft,
  Eye,
  EyeOff,
  Plus,
  Receipt,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import type { FinCommitment, FinTransaction } from "@/types";
import {
  useDeleteFinTransactionMutation,
  useGetFinAccountBalancesQuery,
  useGetFinAccountsQuery,
  useGetFinCategoriesQuery,
  useGetFinBudgetsQuery,
  useGetFinCommitmentSkipsQuery,
  useGetFinCommitmentsQuery,
  useGetFinGoalContributionsQuery,
  useGetFinGoalsQuery,
  useGetFinLedgerQuery,
  useGetFinRatesQuery,
  useGetFinSettingsQuery,
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
import { cn } from "@/lib/cn";
import { getErrorMessage } from "@/lib/utils";
import { FINANCE_SECTIONS, findSection } from "../finance-nav";
import { usePrivateFigures } from "../use-private-figures";
import { tableFrom } from "../money/rates";
import { netWorth } from "../ledger/balance";

import { AccountsSection } from "./accounts-section";
import { ActivitySection } from "./activity-section";
import { CommitmentForm } from "./commitment-form";
import { CommitmentsSection } from "./commitments-section";
import { ExchangeSection } from "./exchange-section";
import { LoansSection } from "./loans-section";
import { OverviewSection } from "./overview-section";
import { PlanSection } from "./plan-section";
import { ReportsSection } from "./reports-section";
import { TransactionForm } from "./transaction-form";
import { TransferForm } from "./transfer-form";

/**
 * Behind a dynamic boundary because it pulls Recharts, and the module does not
 * open on it. A static import would put a charting library into the first load
 * of a route that lands on Accounts.
 */
const ForecastSection = dynamic(
  () => import("./forecast-section").then((mod) => mod.ForecastSection),
  { ssr: false, loading: () => <LoadingState variant="section" /> },
);

/**
 * The finance module, rebuilt.
 *
 * **This is the one place the module talks to the database.** Every section
 * below receives what it needs as props, already converted. v1 spread its
 * queries across the page and the sections — `finance-page.tsx` and
 * `accounts-tab.tsx` both fetched accounts and balances, and each wrote its own
 * "convert every balance to base" loop — so two screens could disagree about the
 * same figure and nothing would fail. One fetch, one rate table, one conversion.
 *
 * Not yet routed at `/admin/finance`, which still renders v1. `/admin/finance-v2`
 * previews this while it is unfinished; the route swaps once `BUILT` covers the
 * nav. A half-rebuilt module behind the live route is the outcome worth refusing.
 */

/** Sections with v2 content. Grows until it covers the nav. */
const BUILT = new Set([
  "overview",
  "accounts",
  "activity",
  "reports",
  "loans",
  "forecast",
  "plan",
  "exchange",
]);

/**
 * Where the module opens.
 *
 * Stated, not derived. This was "the first built section in nav order", and
 * adding Reports to `BUILT` silently moved the landing screen off Accounts. The
 * screen you open on is a decision, not a side effect of which sections happen
 * to be finished — so adding Overview here changes nothing until it is changed
 * on purpose.
 */
const DEFAULT_V2_SECTION = "accounts";

const FIRST_BUILT = BUILT.has(DEFAULT_V2_SECTION)
  ? DEFAULT_V2_SECTION
  : (FINANCE_SECTIONS.find((section) => BUILT.has(section.id))?.id ??
    FINANCE_SECTIONS[0].id);

export default function FinanceV2Page() {
  const { data: settings, isLoading: loadingSettings } =
    useGetFinSettingsQuery();
  const { data: accounts = [] } = useGetFinAccountsQuery();
  const { data: balances = [] } = useGetFinAccountBalancesQuery();
  const { data: categories = [] } = useGetFinCategoriesQuery();
  const { data: transactions = [] } = useGetFinLedgerQuery();
  const { data: commitments = [] } = useGetFinCommitmentsQuery();
  const { data: skips = [] } = useGetFinCommitmentSkipsQuery();
  const { data: budgets = [] } = useGetFinBudgetsQuery();
  const { data: goals = [] } = useGetFinGoalsQuery();
  const { data: contributions = [] } = useGetFinGoalContributionsQuery();
  const [deleteTransaction] = useDeleteFinTransactionMutation();
  const confirm = useConfirm();

  const base = settings?.base_currency ?? "CAD";

  const { data: rateRows = [] } = useGetFinRatesQuery(base, {
    skip: !settings,
  });

  /**
   * One rate table for the whole module, newest quote per currency, so every
   * figure on every screen is priced identically. The rule that "newest" means
   * newest lives in `tableFrom`, not in the query's ordering.
   */
  const rates = useMemo(() => tableFrom(rateRows, base), [rateRows, base]);

  const [sectionId, setSectionId] = useState(FIRST_BUILT);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinTransaction | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [addingCommitment, setAddingCommitment] = useState(false);
  const [editingCommitment, setEditingCommitment] =
    useState<FinCommitment | null>(null);
  const { hidden, toggle } = usePrivateFigures();

  const removeTransaction = async (transaction: FinTransaction) => {
    const ok = await confirm({
      title: "Delete this transaction?",
      description: `"${transaction.description}" is removed permanently, and every balance it affected moves. A transfer goes with both of its legs.`,
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteTransaction(transaction.id).unwrap();
      toast.success("Transaction deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  if (loadingSettings) {
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
            {!BUILT.has(entry.id) && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                soon
              </span>
            )}
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

              {/*
                A defence against the person standing behind you, and nothing
                more — the figures are one click away. Saying so is the point: a
                control that overstates what it protects is worse than one that
                does less.
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
                  <DropdownMenuItem onSelect={() => setAddingCommitment(true)}>
                    <Repeat className="mr-2 size-4" />
                    Something that repeats
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {sectionId === "overview" && (
            <OverviewSection
              commitments={commitments}
              transactions={transactions}
              skips={skips}
              accounts={accounts}
              balances={balances}
              rates={rates}
              base={base}
            />
          )}

          {sectionId === "accounts" && (
            <AccountsSection
              accounts={accounts}
              balances={balances}
              // Read only to tell an account with history from one added by
              // mistake: the first can only be archived, the second deleted.
              transactions={transactions}
              rates={rates}
              base={base}
            />
          )}

          {/*
            The ledger and the things that repeat, together — which is where v1
            kept them too. What happened and what is going to happen are the same
            question asked twice.
          */}
          {sectionId === "activity" && (
            <div className="space-y-8">
              <ActivitySection
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                base={base}
                onEdit={setEditing}
                onDelete={(transaction) => void removeTransaction(transaction)}
                onAdd={() => setAdding(true)}
              />
              <CommitmentsSection
                commitments={commitments}
                accounts={accounts}
                base={base}
                onEdit={setEditingCommitment}
                onAdd={() => setAddingCommitment(true)}
              />
            </div>
          )}

          {sectionId === "reports" && (
            <ReportsSection
              transactions={transactions}
              categories={categories}
              base={base}
            />
          )}

          {/*
            A loan is an amortising commitment, so this screen creates nothing —
            it reuses the commitment sheet for both adding and editing. Two ways
            to make the same row would be two places for them to disagree.
          */}
          {sectionId === "loans" && (
            <LoansSection
              commitments={commitments}
              rates={rates}
              base={base}
              onEdit={setEditingCommitment}
              onAdd={() => setAddingCommitment(true)}
            />
          )}

          {sectionId === "forecast" && (
            <ForecastSection
              // What the line is drawn over: money you can actually reach.
              // An RRSP is real money that will not help next month, and
              // counting it would hide a shortfall — which also lets
              // `transferEffect` tell moving money from moving it *away*.
              startingMinor={
                netWorth(accounts, balances, rates, base).liquid.minor
              }
              countedAccountIds={
                new Set(
                  accounts
                    .filter(
                      (account) => !account.archived_at && account.is_liquid,
                    )
                    .map((account) => account.id),
                )
              }
              commitments={commitments}
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              rates={rates}
              base={base}
              onGo={setSectionId}
            />
          )}

          {sectionId === "plan" && (
            <PlanSection
              budgets={budgets}
              goals={goals}
              contributions={contributions}
              categories={categories}
              accounts={accounts}
              transactions={transactions}
              base={base}
            />
          )}

          {/*
            The raw rate rows, not the table. Everywhere else in the module wants
            one rate per currency and does not care when it was quoted; this is
            the one screen whose subject *is* the dates — how old today's quote
            is, what the last ninety days looked like, and what the rate was on
            the day a transfer actually happened.
          */}
          {sectionId === "exchange" && (
            <ExchangeSection
              rateRows={rateRows}
              base={base}
              home={settings?.home_currency ?? null}
              transactions={transactions}
            />
          )}

          {!BUILT.has(sectionId) && (
            <div className="rounded-surface bg-card p-6 shadow-e1">
              <h2 className="text-sm font-semibold text-foreground">
                Not rebuilt yet
              </h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {section.label} still runs on the previous finance module. It is
                being rebuilt onto the new ledger, and this screen will answer “
                {section.description.toLowerCase()}” when it is.
              </p>
            </div>
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
        description="One movement of money, in or out."
      >
        <TransactionForm
          key={editing?.id ?? "new"}
          transaction={editing ?? undefined}
          accounts={accounts}
          categories={categories}
          rates={rates}
          base={base}
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
          rates={rates}
          base={base}
          onDone={() => setTransferring(false)}
        />
      </FormSheet>

      <FormSheet
        open={addingCommitment || editingCommitment !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddingCommitment(false);
            setEditingCommitment(null);
          }
        }}
        title={
          editingCommitment
            ? `Edit ${editingCommitment.name}`
            : "Something that repeats"
        }
        description="A subscription, a salary, a loan — anything that comes round."
      >
        <CommitmentForm
          key={editingCommitment?.id ?? "new"}
          commitment={editingCommitment ?? undefined}
          commitments={commitments}
          accounts={accounts}
          categories={categories}
          base={base}
          onDone={() => {
            setAddingCommitment(false);
            setEditingCommitment(null);
          }}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}
