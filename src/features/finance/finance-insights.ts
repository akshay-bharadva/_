import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import { roundMoney } from "@/lib/money";

/**
 * The numbers worth acting on, derived from the ledger.
 *
 * Every figure here is computed rather than stored, so nothing can drift out of
 * step with the transactions behind it. They are also all **honestly nullable**:
 * a savings rate needs income, a runway needs a spending history, and a
 * confident zero where the real answer is "not enough data" is the failure mode
 * that makes a finance tool untrustworthy.
 */

/** Sum in base currency, skipping rows no rate was available for. */
function baseTotal(transactions: Transaction[]): {
  total: number;
  unconverted: number;
} {
  let total = 0;
  let unconverted = 0;
  for (const transaction of transactions) {
    if (
      transaction.base_amount === null ||
      transaction.base_amount === undefined
    ) {
      unconverted += 1;
      continue;
    }
    total += Number(transaction.base_amount);
  }
  return { total, unconverted };
}

const isExpense = (transaction: Transaction) => transaction.type === "expense";
const isEarning = (transaction: Transaction) => transaction.type === "earning";

/** A transfer is money moving, not money earned or spent. */
const isRealFlow = (transaction: Transaction) => !transaction.transfer_group;

export interface NetWorth {
  /** Everything, including accounts you cannot touch this month. */
  total: number;
  /** Only `is_liquid` accounts — what is actually reachable. */
  liquid: number;
  /** Negative balances, as a positive number. */
  debt: number;
  currency: string;
}

/**
 * Net worth from account balances.
 *
 * Balances arrive already converted by the caller, because each account's
 * currency needs its own rate — summing raw balances across currencies is
 * arithmetic on incompatible units, which is the exact bug this module was
 * rebuilt to remove.
 */
export function netWorth(
  accounts: FinanceAccount[],
  balancesInBase: Record<string, number>,
  currency: string,
): NetWorth {
  let total = 0;
  let liquid = 0;
  let debt = 0;

  for (const account of accounts) {
    if (account.archived_at) continue;
    const balance = balancesInBase[account.id] ?? 0;
    total += balance;
    if (account.is_liquid) liquid += balance;
    if (balance < 0) debt += Math.abs(balance);
  }

  return {
    total: roundMoney(total, currency),
    liquid: roundMoney(liquid, currency),
    debt: roundMoney(debt, currency),
    currency,
  };
}

export interface PeriodSummary {
  income: number;
  expenses: number;
  net: number;
  /** How many rows could not be converted, so the totals can be qualified. */
  unconverted: number;
  currency: string;
}

export function summarise(
  transactions: Transaction[],
  currency: string,
): PeriodSummary {
  const flows = transactions.filter(isRealFlow);
  const income = baseTotal(flows.filter(isEarning));
  const expenses = baseTotal(flows.filter(isExpense));

  return {
    income: roundMoney(income.total, currency),
    expenses: roundMoney(expenses.total, currency),
    net: roundMoney(income.total - expenses.total, currency),
    unconverted: income.unconverted + expenses.unconverted,
    currency,
  };
}

/**
 * Share of income kept.
 *
 * Null when there was no income in the period rather than 0%: a month you
 * happened not to be paid is not a month you saved nothing, and showing 0%
 * turns a data gap into an accusation.
 */
export function savingsRate(summary: PeriodSummary): number | null {
  if (summary.income <= 0) return null;
  return (summary.net / summary.income) * 100;
}

export interface BucketSplit {
  need: number;
  want: number;
  save: number;
  /** Spending whose category has no bucket yet — reported, not hidden. */
  unclassified: number;
}

/**
 * Spending split into the 50/30/20 buckets.
 *
 * `unclassified` is deliberately visible. Folding uncategorised spending into
 * "want" would make the check look worse than reality and the fix invisible;
 * the honest answer is "you have £340 I cannot place", which is actionable.
 */
export function bucketSplit(
  transactions: Transaction[],
  categories: FinanceCategory[],
): BucketSplit {
  const bucketById = new Map(
    categories.map((category) => [category.id, category.bucket]),
  );

  const split: BucketSplit = { need: 0, want: 0, save: 0, unclassified: 0 };

  for (const transaction of transactions) {
    if (!isRealFlow(transaction) || !isExpense(transaction)) continue;
    const amount = Number(transaction.base_amount ?? 0);
    const bucket = transaction.category_id
      ? bucketById.get(transaction.category_id)
      : undefined;

    if (bucket === "need") split.need += amount;
    else if (bucket === "want") split.want += amount;
    else if (bucket === "save") split.save += amount;
    else split.unclassified += amount;
  }

  return split;
}

export interface BucketCheck {
  bucket: "need" | "want" | "save";
  actualPct: number;
  targetPct: number;
  /** Positive means over target. */
  deltaPct: number;
}

/**
 * How the split compares to the targets.
 *
 * Measured against income, not against total spending — 50/30/20 is a rule
 * about what you do with what you earn. Measuring against spending would make
 * the percentages always sum to 100 and the savings target unreachable by
 * construction.
 */
export function bucketChecks(
  split: BucketSplit,
  income: number,
  settings: FinanceSettings,
): BucketCheck[] | null {
  if (income <= 0) return null;

  const pct = (value: number) => (value / income) * 100;

  return [
    {
      bucket: "need" as const,
      actualPct: pct(split.need),
      targetPct: settings.needs_target_pct,
    },
    {
      bucket: "want" as const,
      actualPct: pct(split.want),
      targetPct: settings.wants_target_pct,
    },
    {
      bucket: "save" as const,
      actualPct: pct(split.save),
      targetPct: settings.save_target_pct,
    },
  ].map((entry) => ({ ...entry, deltaPct: entry.actualPct - entry.targetPct }));
}

/**
 * Average monthly spending on categories marked essential.
 *
 * `is_essential` is a separate flag from the 50/30/20 bucket on purpose: they
 * answer different questions. A gym membership can be a `need` in your
 * budgeting shape and still be the first thing cancelled if income stopped, and
 * runway is about the second question.
 */
export function essentialMonthlySpend(
  transactions: Transaction[],
  categories: FinanceCategory[],
  months: number,
): number | null {
  if (months <= 0) return null;

  const essential = new Set(
    categories.filter((category) => category.is_essential).map((c) => c.id),
  );
  if (essential.size === 0) return null;

  const total = transactions
    .filter(
      (transaction) =>
        isRealFlow(transaction) &&
        isExpense(transaction) &&
        transaction.category_id &&
        essential.has(transaction.category_id),
    )
    .reduce(
      (sum, transaction) => sum + Number(transaction.base_amount ?? 0),
      0,
    );

  if (total <= 0) return null;
  return total / months;
}

/**
 * Months of essential spending your liquid savings would cover.
 *
 * The single most useful number for someone living away from family, because
 * it is the answer to "if this job ended tomorrow, how long do I have". Null
 * when essential spending cannot be established — an infinite runway derived
 * from no data is a dangerous thing to display.
 */
export function runwayMonths(
  liquid: number,
  essentialPerMonth: number | null,
): number | null {
  if (essentialPerMonth === null || essentialPerMonth <= 0) return null;
  if (liquid <= 0) return 0;
  return liquid / essentialPerMonth;
}

export interface Insight {
  id: string;
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
}

/**
 * Prompts drawn from the numbers above.
 *
 * Deliberately specific and deliberately few. Generic advice — "build an
 * emergency fund", "track your spending" — is advice nobody acts on, because it
 * is not about them. Every line here cites a figure from this ledger, and a
 * condition that cannot be evaluated produces no line at all rather than a
 * hedged one.
 */
export function buildInsights({
  summary,
  split,
  checks,
  runway,
  settings,
  overdueCount,
  unconvertedCount,
}: {
  summary: PeriodSummary;
  split: BucketSplit;
  checks: BucketCheck[] | null;
  runway: number | null;
  settings: FinanceSettings;
  overdueCount: number;
  unconvertedCount: number;
}): Insight[] {
  const insights: Insight[] = [];

  // Data quality first. Every other figure is conditional on these, so leading
  // with advice derived from a ledger that is known to be incomplete would be
  // confidently wrong in exactly the way this module tries to avoid.
  if (overdueCount > 0) {
    insights.push({
      id: "overdue",
      tone: "warn",
      title: `${overdueCount} recurring item${overdueCount === 1 ? "" : "s"} not confirmed`,
      detail:
        "Balances and every figure below are missing these until you confirm or skip them.",
    });
  }

  if (unconvertedCount > 0) {
    insights.push({
      id: "unconverted",
      tone: "info",
      title: `${unconvertedCount} transaction${unconvertedCount === 1 ? "" : "s"} not converted`,
      detail:
        "No exchange rate was available for these, so they are excluded from the totals rather than guessed at.",
    });
  }

  if (runway !== null) {
    const target = settings.runway_target_months;
    if (runway < 1) {
      insights.push({
        id: "runway",
        tone: "bad",
        title: "Less than a month of runway",
        detail:
          "Your liquid savings would not cover one month of essential spending. This is the first thing worth changing.",
      });
    } else if (runway < target) {
      insights.push({
        id: "runway",
        tone: "warn",
        title: `${runway.toFixed(1)} months of runway`,
        detail: `Below your ${target}-month target. Living away from family usually argues for more, not less.`,
      });
    } else {
      insights.push({
        id: "runway",
        tone: "good",
        title: `${runway.toFixed(1)} months of runway`,
        detail: `At or above your ${target}-month target.`,
      });
    }
  }

  const rate = savingsRate(summary);
  if (rate !== null) {
    if (rate < 0) {
      insights.push({
        id: "savings-rate",
        tone: "bad",
        title: "You spent more than you earned",
        detail:
          "This period ran a deficit. If it is not a one-off, the forecast will show where it leads.",
      });
    } else if (rate < 10) {
      insights.push({
        id: "savings-rate",
        tone: "warn",
        title: `Saving ${rate.toFixed(0)}% of income`,
        detail: "Under 10% leaves very little room for anything unplanned.",
      });
    } else {
      insights.push({
        id: "savings-rate",
        tone: "good",
        title: `Saving ${rate.toFixed(0)}% of income`,
        detail: "Comfortably positive for this period.",
      });
    }
  }

  const wants = checks?.find((check) => check.bucket === "want");
  if (wants && wants.deltaPct > 10) {
    insights.push({
      id: "wants",
      tone: "warn",
      title: `Discretionary spending is ${wants.actualPct.toFixed(0)}% of income`,
      detail: `Your target is ${wants.targetPct.toFixed(0)}%. This is usually the easiest bucket to move.`,
    });
  }

  if (split.unclassified > 0) {
    insights.push({
      id: "unclassified",
      tone: "info",
      title: "Some spending has no category",
      detail:
        "Uncategorised spending is shown separately rather than folded into wants, so the split below understates one of the buckets until it is labelled.",
    });
  }

  return insights;
}
