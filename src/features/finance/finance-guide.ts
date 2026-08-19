/**
 * The guide's content, as data.
 *
 * Kept out of the component because it is writing, not markup, and because the
 * "what to do next" steps are checked against the owner's actual state — a
 * guide that says "add an account" to someone with six accounts is a guide
 * nobody reads twice.
 *
 * The tone rule throughout: **name the trade-off, do not sell the outcome.**
 * Personal finance advice is full of confident claims that are true for a
 * median person in one tax system and wrong for someone earning in one country
 * and supporting a family in another. Where something depends on circumstances,
 * this says so rather than picking for you.
 */

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  /** Which section of the module this is about. */
  section: string;
  /** Answered against real data so a finished step can be marked done. */
  doneWhen: string;
}

/** The order things have to happen in for the module to say anything useful. */
export const SETUP_STEPS: GuideStep[] = [
  {
    id: "accounts",
    title: "Add the accounts money moves through",
    body: "Chequing, a credit card, cash, and anything back home. You only state what each holds today — a date you have a statement or a banking app for. Everything after that is derived from what you enter, so you never reconstruct a history. When reality drifts, you correct the anchor rather than hunting a missing transaction.",
    section: "accounts",
    doneWhen: "At least one account exists",
  },
  {
    id: "categories",
    title: "Check the categories match your life",
    body: "The starter set is nineteen categories already sorted into needs, wants and savings. Two fields do the real work: bucket decides your 50/30/20 split, and essential decides your runway. They are separate because they answer different questions — a gym membership can be a need in your budget and still be the first thing you cancel if income stops.",
    section: "plan",
    doneWhen: "Categories exist",
  },
  {
    id: "recurring",
    title: "Set up what repeats",
    body: "Salary, rent, subscriptions, the money you send home. Leave “record automatically” off for anything that varies — a biweekly salary is not the same figure the fortnight you took unpaid leave. Occurrences then wait on Overview with the expected amount pre-filled, and you correct it in one keystroke.",
    section: "activity",
    doneWhen: "At least one recurring rule exists",
  },
  {
    id: "transactions",
    title: "Record a few weeks of spending",
    body: "This is the part that cannot be skipped. Runway, savings rate and the forecast are all derived from what actually happened, so until there is a month or so of real spending the module can only tell you what you told it. Nothing here guesses — a figure it cannot compute shows as “—” rather than as zero.",
    section: "activity",
    doneWhen: "20 or more transactions recorded",
  },
  {
    id: "budgets",
    title: "Cap the two or three you actually overspend",
    body: "Not everything. A budget on every category is a spreadsheet you abandon in three weeks. Pick the ones the suggestions list puts at the top — they are ranked by what you already spend, so they are the ones where a cap changes anything.",
    section: "plan",
    doneWhen: "At least one budget set",
  },
];

export interface Concept {
  id: string;
  term: string;
  short: string;
  detail: string;
}

/**
 * The ideas the module is built on.
 *
 * Every one of these is a decision that shows up as a number on a screen, and
 * a number whose definition you do not know is a number you cannot act on.
 */
export const CONCEPTS: Concept[] = [
  {
    id: "runway",
    term: "Runway",
    short: "How long you could pay the essentials with no income.",
    detail:
      "Reachable savings divided by your average monthly essential spending. It is the single most useful number here if you live away from family, because it answers “if this job ended tomorrow, how long do I have” — and the honest answer is usually shorter than people assume. Six months is the common advice. Further from home, with a visa tied to employment or no spare room to move into, it is worth more.",
  },
  {
    id: "savings-rate",
    term: "Savings rate",
    short: "The share of what you earn that you keep.",
    detail:
      "It matters more than the absolute amount, because it is the number that scales. Someone keeping 25% of a modest income reaches independence sooner than someone keeping 5% of a large one — a high rate means both that you are accumulating faster and that you need less to live on. A raise only helps if the rate survives it.",
  },
  {
    id: "503020",
    term: "50/30/20",
    short: "Half on needs, a third on wants, a fifth saved.",
    detail:
      "A starting frame, not a law, and one written for a single-country life. Supporting family from abroad routinely pushes needs past 50%, which does not mean you are failing — it means the default split does not describe your obligations. Adjust the targets under Currency & targets so the check measures you against your own plan. It is measured against income rather than total spending, because against spending the three always sum to 100 and the savings target becomes unreachable by construction.",
  },
  {
    id: "frozen-rate",
    term: "Frozen exchange rates",
    short: "Every transaction remembers the rate on the day it happened.",
    detail:
      "It is why last March's grocery bill does not change when the market moves today, and why switching your base currency is safe rather than destructive. Most simple tools convert at today's rate on every read, which quietly rewrites your history each time you open them.",
  },
  {
    id: "mid-market",
    term: "Mid-market rate",
    short: "The rate on the screen. Not the rate you get.",
    detail:
      "The Exchange section shows European Central Bank reference rates. Nobody transacts at them — your bank or transfer service takes a margin, often instead of a visible fee. Use them to judge whether today is a good day, and the transfer record to see what you actually received. The gap between the two is the real price of the service.",
  },
  {
    id: "reconciliation",
    term: "Reconciliation",
    short: "Telling the app what an account really holds today.",
    detail:
      "Balances are derived from an anchor date forward, so accuracy is maintained by correcting the anchor rather than by entering every coffee. Do it when a statement arrives. This is what makes a credit card tractable — its bill is genuinely unknown until it lands.",
  },
];

export interface GrowthIdea {
  id: string;
  title: string;
  body: string;
  /** Named honestly so the reader can weigh it. */
  tradeoff: string;
}

/**
 * Ideas about growing money, with their costs stated.
 *
 * Deliberately not recommendations, and deliberately not specific products.
 * The right answer depends on tax residency, visa status, whether you plan to
 * stay, and what your family needs — none of which this app knows. What it can
 * usefully do is name the decisions in the order they normally matter, so
 * nobody skips the boring one that comes first.
 */
export const GROWTH_IDEAS: GrowthIdea[] = [
  {
    id: "buffer",
    title: "Build the buffer before anything else",
    body: "Three to six months of essential spending, in something you can reach the same day. It is not an investment and it is not supposed to grow — it is what stops one bad month turning into debt at 20% interest, and it is what lets you take a risk later. Living away from family raises the case for the upper end: there is no spare room to move into and often no local safety net.",
    tradeoff:
      "It will earn less than the market. That is the point — you are buying certainty, not return.",
  },
  {
    id: "debt",
    title: "Clear expensive debt before investing",
    body: "A credit card at 20% is a guaranteed 20% loss each year you carry it. No investment offers a guaranteed 20% gain, so paying it off beats any portfolio on a risk-adjusted basis. Low-rate debt — a subsidised student loan, sometimes a mortgage — is a different question and can reasonably run alongside investing.",
    tradeoff:
      "Paying down debt feels like standing still, because your net worth barely moves. It is the same arithmetic as a return, without the volatility.",
  },
  {
    id: "employer",
    title: "Take the free money first",
    body: "If your employer matches retirement contributions, the match is part of your pay that you only receive by opting in. Not taking it is a pay cut you chose. Check the vesting period if you are on a visa or expect to move — an unvested match you leave behind is worth nothing.",
    tradeoff:
      "Retirement accounts are usually locked until a certain age, and moving country can complicate access. Worth understanding before, not after.",
  },
  {
    id: "automate",
    title: "Automate the saving, not the spending",
    body: "Move money to savings on payday rather than at month end. Whatever is left at the end of the month is whatever you did not spend, which is a very different quantity from what you meant to save. Set it up as a recurring transfer and let the remainder be the spending money.",
    tradeoff:
      "It can leave you short mid-month at first. Start smaller than feels right, and raise it when a month passes without noticing.",
  },
  {
    id: "boring",
    title: "Broad and dull beats clever, for most people",
    body: "Low-cost, broadly diversified index funds are the default recommendation of essentially every disinterested source — not because they are exciting, but because fees compound against you exactly as returns compound for you, and because picking individual companies is a game against people who do it full time. Time in the market matters far more than the exact fund.",
    tradeoff:
      "Broad market investing goes down, sometimes for years. Money you will need within about five years should not be in it.",
  },
  {
    id: "cross-border",
    title: "Know the cross-border rules before you commit",
    body: "Living in one country and holding assets in another creates tax questions that are genuinely complicated: reporting obligations in both places, treatment of foreign accounts, and what happens if you move again. This is the one area where paying a professional once is usually cheaper than the mistake.",
    tradeoff:
      "Advice costs money and the rules change. Still cheaper than an unexpected tax bill in two jurisdictions.",
  },
  {
    id: "currency",
    title: "Decide where you actually need the money",
    body: "If you plan to return home, holding everything in your earning currency is a bet on the exchange rate. If you plan to stay, sending too much home is the same bet in reverse. Neither is wrong — but it is worth being a decision rather than a default. The Exchange section shows what you have sent and at what average rate.",
    tradeoff:
      "Splitting across currencies reduces the risk of being wrong and guarantees you do worse than if you had guessed right.",
  },
  {
    id: "lifestyle",
    title: "Watch what a raise does to the baseline",
    body: "Spending tends to rise to meet income, which is why savings rate is the number to watch rather than salary. The month after a raise is the cheapest possible time to increase a recurring transfer to savings — you are not giving anything up, because you never adjusted to the new amount.",
    tradeoff:
      "Nothing, really. This is the one that is close to free, which is why it is worth doing deliberately.",
  },
];

/** Not advice, and the reason why, stated once. */
export const DISCLAIMER =
  "None of this is financial advice, and it cannot be — the right answer depends on your tax residency, visa status, whether you intend to stay, and what your family needs, none of which this app knows. It is a set of considerations in roughly the order they usually matter, so that the dull decision that comes first does not get skipped for the interesting one.";
