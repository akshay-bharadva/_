import type { AccountKind, FinanceCategory, FinanceCategoryRule } from "@/types";
import type { StatementRow } from "./import-formats";

/**
 * What a bank line is, and where it belongs.
 *
 * Four layers, strongest first:
 *
 * 1. **Your rules** — learned from the corrections you made on earlier
 *    imports. You are the authority on what "ETRANSFER JOHN DOE" is.
 * 2. **The bank's own wording** — card payments, transfers between your own
 *    accounts, e-Transfers, cash, fees, interest, pay, government deposits,
 *    investments, remittances, loans. These decide whether a line is spending
 *    at all, which matters more than which kind of spending it is.
 * 3. **Your history** — what you called this merchant last time.
 * 4. **A table of Canadian merchants** — Loblaws is groceries.
 *
 * Nothing here is final. The review screen shows the reason for every guess,
 * and a transfer is only confirmed as one when the other leg is found in
 * another of your accounts — see `import-match.ts`.
 */

export type ImportKind =
  | "purchase"
  | "refund"
  | "income"
  | "government"
  | "interest"
  | "own_transfer"
  | "card_payment"
  | "etransfer_out"
  | "etransfer_in"
  | "cash"
  | "fee"
  | "investment"
  | "remittance"
  | "loan_payment";

export const KIND_LABELS: Record<ImportKind, string> = {
  purchase: "Purchase",
  refund: "Refund",
  income: "Pay",
  government: "Government",
  interest: "Interest",
  own_transfer: "Between your accounts",
  card_payment: "Credit card payment",
  etransfer_out: "e-Transfer sent",
  etransfer_in: "e-Transfer received",
  cash: "Cash withdrawal",
  fee: "Bank fee",
  investment: "Investing",
  remittance: "Sent abroad",
  loan_payment: "Loan payment",
};

/** Kinds that are money moving between your own accounts, not spending. */
export const TRANSFER_KINDS: ImportKind[] = ["own_transfer", "card_payment"];

/** Kinds whose other leg is worth looking for in another account. */
export const PAIRABLE_KINDS: ImportKind[] = [
  "own_transfer",
  "card_payment",
  "etransfer_out",
  "etransfer_in",
  "investment",
  "remittance",
];

export interface Classification {
  kind: ImportKind;
  type: "earning" | "expense";
  /** Counted as a transfer, not as income or spending. */
  isTransfer: boolean;
  /** The category we would pick, by name — shown even if you do not have it. */
  categoryName: string | null;
  categoryId: string | null;
  /** Normalised merchant, the key rules and history are filed under. */
  merchantKey: string;
  /** The same, readable: "Tim Hortons". */
  merchant: string;
  /** The other person on an e-Transfer, when the bank says. */
  counterparty: string | null;
  source: "rule" | "bank" | "history" | "merchant" | "none";
  reason: string;
}

export interface ClassifyContext {
  accountKind: AccountKind;
  categories: FinanceCategory[];
  rules: FinanceCategoryRule[];
  /** Merchant key → the category you last gave it. */
  history: Map<string, string>;
}

// ── Merchant normalisation ──────────────────────────────────────────────────

const NOISE = new Set([
  "POS", "IDP", "PURCHASE", "PURCHASES", "RETAIL", "INTERAC", "VISA", "DEBIT",
  "MASTERCARD", "PREAUTHORIZED", "PRE", "AUTHORIZED", "PAP", "OPOS", "APOS",
  "CONTACTLESS", "POINT", "OF", "SALE", "SQ", "TST", "SP", "PAYPAL", "WWW",
  "COM", "INC", "LTD", "LTEE", "CORP", "CO", "THE", "CANADA", "CDA", "CAN",
]);

const PROVINCES = new Set([
  "ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU",
]);

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

/**
 * "IDP PURCHASE - 1234 LOBLAWS #1089 TORONTO ON" → key "LOBLAWS".
 *
 * Two words at most: enough to tell "TIM HORTONS" from "TIM'S AUTO", few
 * enough that store numbers, cities and terminal ids never reach the key —
 * otherwise every Loblaws in the city would be a merchant of its own and a
 * rule learned at one would miss the next.
 */
export function normaliseMerchant(description: string): { key: string; display: string } {
  const tokens = description
    .toUpperCase()
    .replace(/[*#]/g, " ")
    .replace(/[^A-Z0-9&' ]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 1 &&
        !/\d/.test(token) &&
        !NOISE.has(token),
    );
  // A trailing province code, and the city before it, are location. The city
  // goes whenever a word would remain — "LOBLAWS TORONTO ON" is Loblaws.
  while (tokens.length > 1 && PROVINCES.has(tokens[tokens.length - 1])) {
    tokens.pop();
    if (tokens.length > 1) tokens.pop();
  }
  const key = tokens.slice(0, 2).join(" ") || description.toUpperCase().slice(0, 40).trim();
  return { key, display: titleCase(key) };
}

// ── The bank's wording ──────────────────────────────────────────────────────

const CARD_PAYMENT_IN = /PAYMENT THANK YOU|PAIEMENT MERCI|PAYMENT - THANK YOU|PAYMENT RECEIVED|AUTOMATIC PAYMENT|PAYMENT FROM/;
const CARD_PAYMENT_OUT = /(PAYMENT|PMT|PYMT|BILL PAY).*(VISA|MASTERCARD|\bMC\b|AMEX|AMERICAN EXPRESS|CREDIT CARD|CARD)|(CIBC|RBC|TD|BMO|SCOTIA|TANGERINE|PC|ROGERS|TRIANGLE|MBNA|CAPITAL ONE|NEO) ?(VISA|MASTERCARD|MC|CARD)/;
const ETRANSFER = /E-?TRANSFER|E-?TRF|E-?TFR|INTERAC E|\bEMT\b|AUTODEPOSIT/;
const OWN_TRANSFER = /ONLINE (BANKING )?TRANSFER|INTERNET (BANKING )?TRANSFER|\bWWW TRF|TRANSFER (TO|FROM)|\bTFR[- ](TO|FR)|\bOB TRF|MOBILE TRANSFER|ONLINE TRF|INTER-?ACCOUNT|ACCOUNT TRANSFER|\bTRSF\b/;
const CASH = /\bATM\b|\bABM\b|CASH WITHDRAWAL|BANKING MACHINE|WITHDRAWAL.*(ATM|ABM)|CASH ADVANCE/;
const FEE = /MONTHLY FEE|SERVICE CHARGE|ACCOUNT FEE|ANNUAL FEE|PLAN FEE|\bNSF\b|OVERDRAFT|OVERLIMIT|OVER LIMIT|INTEREST CHARGE|PURCHASE INTEREST|CASH ADVANCE INTEREST|FOREIGN (TRANSACTION|EXCHANGE|CURRENCY) FEE|E-?TRANSFER FEE|INTERAC FEE|\bFEE\b/;
const INTEREST_IN = /INTEREST( PAID| EARNED| CREDIT)?$|DEPOSIT INTEREST|\bINTEREST\b/;
// "\bPAY\b" on money in: CIBC files pay as "Electronic Funds Transfer PAY
// <EMPLOYER>". The word boundary keeps "PAYMENT" out.
const PAYROLL = /PAYROLL|PAY ?DEP|DIRECT DEP|DIR DEP|SALARY|\bPAY\b|EMPLOYER/;
const GOVERNMENT = /CANADA FED|GST|HST CREDIT|\bCCB\b|CANADA CHILD|\bCRA\b|EI CANADA|\bEI\b|\bCPP\b|\bOAS\b|FED GOVT|PROV\/LOCAL|ONTARIO TRILLIUM|\bOTB\b|CANADA PRO|CARBON REBATE|CAIP|CLIMATE ACTION|REVENU QUEBEC|TAX REFUND/;
const INVESTMENT = /WEALTHSIMPLE|QUESTRADE|DIRECT INVESTING|INVESTORLINE|DISNAT|\bTFSA\b|\bRRSP\b|\bFHSA\b|\bRESP\b|MOOMOO|INTERACTIVE BROKERS|NATIONAL BANK DIRECT|QTRADE|VIRTUAL BROKERS|EQ BANK|KOHO|MUTUAL FUND|\bETF\b/;
const REMITTANCE = /\bWISE\b|TRANSFERWISE|REMITLY|WESTERN UNION|\bXOOM\b|MONEYGRAM|\bRIA\b|INSTAREM|REMIT|WORLDREMIT|PAYSEND/;
const LOAN = /MORTGAGE|LOAN PMT|LOAN PAYMENT|LINE OF CREDIT|\bLOC\b PAYMENT|STUDENT LOAN|\bNSLSC\b|OSAP|CAR LOAN|AUTO LOAN|\bLEASE\b/;

// ── Merchants, Canada first ─────────────────────────────────────────────────
// Order matters: the first match wins, so the specific ("UBER EATS") sits
// above the general ("UBER"), and fuel at Canadian Tire above the store.

const MERCHANTS: [RegExp, string][] = [
  [/UBER ?EATS|DOOR ?DASH|SKIP ?THE ?DISHES|SKIPTHEDISHES|TIM HORTON|STARBUCKS|MCDONALD|\bA ?& ?W\b|SUBWAY|WENDY|BURGER KING|POPEYES|PIZZA|DOMINO|CHIPOTLE|MARY BROWN|HARVEY|\bKFC\b|DAIRY QUEEN|FRESHII|OSMOW|BARBURRITO|CHAAT|BIRYANI|TANDOOR|SUSHI|RAMEN|PHO\b|SHAWARMA|RESTAURANT|RESTO|\bCAFE\b|COFFEE|BAKERY|BISTRO|GRILL|\bPUB\b|DINER|BUBBLE TEA|CHATIME|DAVIDSTEA|SECOND CUP|BALZAC|PAN ?AROMA|THAI EXPRESS|MANCHU WOK|MUCHO BURRITO|NANDO|SWISS CHALET|BOSTON PIZZA|EARLS|CACTUS CLUB|THE KEG|MONTANA|EAST SIDE MARIO|KELSEY|MILESTONES|ST-HUBERT|FAT BASTARD|GUU|TACO|FIVE GUYS|CHICK-FIL|WINGSTOP/, "Dining out"],
  [/LOBLAW|NO ?FRILLS|SUPERSTORE|\bMETRO\b|SOBEYS|FRESHCO|FOOD ?BASICS|FARM ?BOY|WHOLE ?FOODS|\bT ?& ?T\b|COSTCO|WALMART|WAL-MART|SAFEWAY|SAVE[- ]?ON|\bIGA\b|\bMAXI\b|PROVIGO|ADONIS|FORTINOS|ZEHRS|VALU[- ]?MART|YOUR INDEPENDENT|GIANT TIGER|INSTACART|VOILA|FOODLAND|COOP|CO-OP|LONGO|NATIONS FRESH|BULK BARN|SUPERMARKET|GROCERY|GROCER|MARKET|PATEL BROTHERS|IQBAL|BAZAAR|\bH MART\b|GALLERIA|PC EXPRESS/, "Groceries"],
  [/PRESTO|\bTTC\b|GO ?TRANSIT|UP EXPRESS|OC ?TRANSPO|\bSTM\b|TRANSLINK|COMPASS CARD|\bMIWAY\b|YRT|BRAMPTON TRANSIT|GRT|\bUBER\b|\bLYFT\b|SHELL|\bESSO\b|PETRO[- ]?CAN|PIONEER|ULTRAMAR|CIRCLE ?K|HUSKY|CANADIAN TIRE GAS|GAS BAR|COSTCO GAS|MOBIL|IRVING|PARKING|IMPARK|INDIGO PARK|GREEN ?P\b|HONK|\b407 ?ETR|PRECISION PARK|CARPOOL|COMMUNAUTO|ZIPCAR|EVO CAR|ENTERPRISE RENT|BUDGET RENT|AVIS|HERTZ|CAR WASH|JIFFY LUBE|MIDAS|MR LUBE/, "Transport"],
  [/ROGERS|\bBELL\b|TELUS|\bFIDO\b|KOODO|VIRGIN (PLUS|MOBILE)|FREEDOM MOBILE|CHATR|PUBLIC MOBILE|LUCKY MOBILE|\bSHAW\b|VIDEOTRON|TEKSAVVY|START\.?CA|EASTLINK|COGECO|DISTRIBUTEL|OXIO|ACANAC/, "Phone & internet"],
  [/HYDRO|ENBRIDGE|ALECTRA|FORTIS|EPCOR|ENMAX|\bATCO\b|UNION GAS|RELIANCE HOME|ENERCARE|WATER BILL|UTILITIES|ELEXICON|OAKVILLE HYDRO|NB POWER|SASKPOWER|MANITOBA HYDRO|BC HYDRO/, "Utilities"],
  [/NETFLIX|SPOTIFY|DISNEY|\bCRAVE\b|APPLE\.COM|APPLE ?MUSIC|ICLOUD|GOOGLE ?(STORAGE|ONE|PLAY|\*)|YOUTUBE|PRIME ?VIDEO|AMAZON ?PRIME|AMZN ?PRIME|AUDIBLE|PATREON|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|MICROSOFT|XBOX GAME PASS|ADOBE|DROPBOX|GITHUB|NOTION|PARAMOUNT|\bDAZN\b|SIRIUS|DUOLINGO|HOTSTAR|JIOCINEMA|SONYLIV|ZEE5|LINKEDIN|MEDIUM|NYTIMES|GLOBE ?AND ?MAIL|TORONTO STAR|1PASSWORD|NORDVPN|EXPRESSVPN|CANVA|SUBSCRIPTION/, "Subscriptions"],
  [/SHOPPERS|REXALL|PHARMA|PHARMACY|\bDRUG|DENTAL|DENTIST|CLINIC|MEDICAL|PHYSIO|CHIRO|OPTOM|OPTICAL|HOSPITAL|LONDON DRUGS|JEAN COUTU|WELL\.CA|LIFELABS|DYNACARE|MASSAGE|MENTAL HEALTH|THERAP|VISION/, "Healthcare"],
  [/INSURANCE|ASSURANCE|INTACT|AVIVA|BELAIR|SONNET|MANULIFE|SUN ?LIFE|CANADA LIFE|DESJARDINS INS|TD INS|SQUARE ONE|APOLLO INS|CAA INS|WAWANESA|COOPERATORS|CO-OPERATORS|ECONOMICAL|GORE MUTUAL|ALLSTATE/, "Insurance"],
  [/\bRENT\b|PROPERTY MGMT|PROPERTY MANAGEMENT|APARTMENTS?\b|REALTY|\bRENTALS?\b|CAPREIT|MINTO|TRIDEL|STARLIGHT|GREENWIN|HOUSING CO-?OP|CONDO FEE|STRATA/, "Rent"],
  [/AIR CANADA|WESTJET|PORTER|FLAIR|AIR INDIA|EMIRATES|QATAR|ETIHAD|LUFTHANSA|BRITISH AIRWAYS|KLM|AIR FRANCE|UNITED AIR|DELTA AIR|AMERICAN AIR|INDIGO AIR|VISTARA|EXPEDIA|BOOKING\.COM|AIRBNB|HOTEL|MARRIOTT|HILTON|HYATT|\bIHG\b|BEST WESTERN|VIA RAIL|GREYHOUND|MEGABUS|FLIXBUS|TRAVEL|DUTY FREE|MAKEMYTRIP|CLEARTRIP|KAYAK|SKYSCANNER|TRIP\.COM|AIRALO/, "Travel"],
  [/CINEPLEX|LANDMARK CINEMA|IMAX|STEAM|PLAYSTATION|\bXBOX\b|NINTENDO|TICKETMASTER|EVENTBRITE|LIVE NATION|GOODLIFE|FIT4LESS|PLANET FITNESS|\bYMCA\b|ANYTIME FITNESS|BOWL|MUSEUM|ZOO|RIPLEY|WONDERLAND|CN TOWER|ESCAPE ROOM|GOLF|SKI\b|CLIMB|THEATRE|THEATER|CONCERT|TWITCH|EPIC GAMES|BATTLE ?NET|RIOT GAMES/, "Entertainment"],
  [/AMAZON|\bAMZN\b|BEST ?BUY|\bIKEA\b|CANADIAN TIRE|WINNERS|MARSHALLS|HOMESENSE|\bH ?& ?M\b|\bZARA\b|UNIQLO|\bGAP\b|OLD NAVY|SPORT ?CHEK|DOLLARAMA|DOLLAR TREE|STAPLES|HOME ?DEPOT|LOWE'?S|\bRONA\b|SHEIN|\bTEMU\b|ALIEXPRESS|\bETSY\b|\bEBAY\b|APPLE STORE|INDIGO|CHAPTERS|SEPHORA|LULULEMON|SIMONS|HUDSON'?S BAY|\bTHE BAY\b|ROOTS|ARITZIA|MEC\b|SPORTING LIFE|STRUCTUBE|WAYFAIR|LEON'?S|THE BRICK|MICHAELS|PARTY CITY|TOYS|MEMORY EXPRESS|CANADA COMPUTERS|THE SOURCE|MUJI|MINISO|PENNINGTONS|REITMANS|FOOT LOCKER|SOFTMOC|ALDO|NIKE|ADIDAS|SHOP\b|STORE\b|BOUTIQUE/, "Shopping"],
];

// ── Classifying ─────────────────────────────────────────────────────────────

function resolveCategory(name: string | null, categories: FinanceCategory[]): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    categories.find((c) => !c.archived_at && c.name.toLowerCase() === lower)?.id ?? null
  );
}

/** "INTERAC E-TRF- 1234 JOHN DOE" or RBC's detail column → "JOHN DOE". */
function counterpartyOf(row: StatementRow): string | null {
  if (row.detail && !/^\d+$/.test(row.detail)) return row.detail.toUpperCase().trim();
  const match = /(?:E-?TRANSFER|E-?TRF|E-?TFR|EMT|INTERAC E-?TRANSFER|AUTODEPOSIT)[^A-Z]*(?:SENT|RECEIVED|TO|FROM|SEND|RECV)?[^A-Z]*([A-Z][A-Z .'-]{2,40})$/i.exec(
    row.description,
  );
  return match ? match[1].toUpperCase().replace(/\s+/g, " ").trim() : null;
}

function ruleFor(key: string, text: string, rules: FinanceCategoryRule[]): FinanceCategoryRule | null {
  let best: FinanceCategoryRule | null = null;
  for (const rule of rules) {
    const pattern = rule.pattern.toUpperCase();
    if (key === pattern || key.startsWith(`${pattern} `) || text.includes(pattern)) {
      // The most specific pattern wins: "ETRANSFER JOHN DOE" over "ETRANSFER".
      if (!best || pattern.length > best.pattern.length) best = rule;
    }
  }
  return best;
}

export function classify(row: StatementRow, context: ClassifyContext): Classification {
  const text = `${row.description} ${row.detail}`.toUpperCase().replace(/\s+/g, " ");
  const outgoing = row.amount < 0;
  const type: "earning" | "expense" = outgoing ? "expense" : "earning";
  const isCard = context.accountKind === "credit";

  const isEtransfer = ETRANSFER.test(text);
  const counterparty = isEtransfer ? counterpartyOf(row) : null;
  const merchantFromText = normaliseMerchant(row.description);
  const merchantKey = isEtransfer
    ? `ETRANSFER ${counterparty ?? ""}`.trim()
    : merchantFromText.key;
  const merchant = isEtransfer
    ? counterparty
      ? `e-Transfer ${outgoing ? "to" : "from"} ${titleCase(counterparty)}`
      : "e-Transfer"
    : merchantFromText.display;

  const build = (
    kind: ImportKind,
    categoryName: string | null,
    source: Classification["source"],
    reason: string,
    override?: { categoryId?: string | null; isTransfer?: boolean },
  ): Classification => {
    const isTransfer = override?.isTransfer ?? TRANSFER_KINDS.includes(kind);
    const name = isTransfer && !categoryName ? "Transfer" : categoryName;
    return {
      kind,
      type,
      isTransfer,
      categoryName: name,
      categoryId:
        override?.categoryId !== undefined
          ? override.categoryId
          : resolveCategory(name, context.categories),
      merchantKey,
      merchant,
      counterparty,
      source,
      reason,
    };
  };

  // What the bank's wording says it is, before any rule — a rule changes the
  // category, but a card payment is still a card payment.
  let kind: ImportKind = outgoing ? "purchase" : isCard ? "refund" : "income";
  let bankCategory: string | null = null;
  let bankReason: string | null = null;

  if (isCard && !outgoing && CARD_PAYMENT_IN.test(text)) {
    kind = "card_payment";
    bankReason = "A payment towards this card — money moving, not spending.";
  } else if (!isCard && outgoing && CARD_PAYMENT_OUT.test(text)) {
    kind = "card_payment";
    bankReason = "Paying a credit card bill — the spending is on the card itself.";
  } else if (isEtransfer) {
    kind = outgoing ? "etransfer_out" : "etransfer_in";
    bankCategory = outgoing ? "Payments to people" : "Money received";
    bankReason = counterparty
      ? `Interac e-Transfer ${outgoing ? "to" : "from"} ${titleCase(counterparty)}. If it was to yourself, the other account's import will pair it.`
      : "Interac e-Transfer.";
  } else if (OWN_TRANSFER.test(text)) {
    kind = "own_transfer";
    bankReason = "The bank calls this a transfer between accounts.";
  } else if (outgoing && CASH.test(text)) {
    kind = "cash";
    bankCategory = "Cash";
    bankReason = "Cash out of the bank — counted as spent when it leaves.";
  } else if (FEE.test(text) && (outgoing || isCard)) {
    kind = "fee";
    bankCategory = "Bank fees";
    bankReason = /INTEREST/.test(text)
      ? "Interest charged by the bank."
      : "A fee charged by the bank.";
  } else if (!outgoing && !isCard && INTEREST_IN.test(text)) {
    kind = "interest";
    bankCategory = "Interest";
    bankReason = "Interest the bank paid you.";
  } else if (!outgoing && GOVERNMENT.test(text)) {
    kind = "government";
    bankCategory = "Government benefits";
    bankReason = "A deposit from government.";
  } else if (!outgoing && PAYROLL.test(text)) {
    kind = "income";
    bankCategory = "Salary";
    bankReason = "Looks like pay.";
  } else if (INVESTMENT.test(text)) {
    kind = "investment";
    bankCategory = "Investments";
    bankReason = "Money into investing — saved, not spent.";
  } else if (REMITTANCE.test(text)) {
    kind = "remittance";
    bankCategory = "Family support";
    bankReason =
      "Sent abroad. If it went to your own account in India, the other side's import will pair it as a transfer.";
  } else if (outgoing && LOAN.test(text)) {
    kind = "loan_payment";
    bankCategory = "Debt repayment";
    bankReason = "A loan or mortgage payment.";
  }

  // 1. Your rules.
  const rule = ruleFor(merchantKey, text, context.rules);
  if (rule) {
    if (rule.kind === "transfer") {
      return build(kind === "card_payment" ? kind : "own_transfer", "Transfer", "rule", `Your rule for “${rule.pattern}”: a transfer.`, {
        isTransfer: true,
        categoryId: rule.category_id ?? resolveCategory("Transfer", context.categories),
      });
    }
    const name = context.categories.find((c) => c.id === rule.category_id)?.name ?? null;
    return build(kind, name, "rule", `Your rule for “${rule.pattern}”.`, {
      categoryId: rule.category_id ?? null,
      isTransfer: false,
    });
  }

  // 2. The bank's wording.
  if (bankReason) return build(kind, bankCategory, "bank", bankReason);

  // 3. Your history.
  const remembered = context.history.get(merchantKey);
  if (remembered) {
    const name = context.categories.find((c) => c.id === remembered)?.name ?? null;
    return build(kind, name, "history", `You filed ${merchant} under ${name ?? "this"} before.`, {
      categoryId: remembered,
    });
  }

  // 4. Merchants.
  for (const [pattern, name] of MERCHANTS) {
    if (pattern.test(text)) {
      return build(
        kind,
        name,
        "merchant",
        kind === "refund" ? `A refund from ${merchant}.` : `${merchant} is usually ${name.toLowerCase()}.`,
      );
    }
  }

  return build(
    kind,
    null,
    "none",
    outgoing ? "Nothing recognised it — pick a category." : "Money in from somewhere unrecognised — pick a category.",
  );
}

/** Merchant key → the category most recently given to it, from the ledger. */
export function historyFrom(
  transactions: {
    description: string;
    raw_description?: string | null;
    category_id?: string | null;
    transfer_group?: string | null;
    date: string;
  }[],
): Map<string, string> {
  const latest = new Map<string, { date: string; category: string }>();
  for (const transaction of transactions) {
    if (!transaction.category_id || transaction.transfer_group) continue;
    const key = normaliseMerchant(transaction.raw_description ?? transaction.description).key;
    const seen = latest.get(key);
    if (!seen || seen.date < transaction.date) {
      latest.set(key, { date: transaction.date, category: transaction.category_id });
    }
  }
  const map = new Map<string, string>();
  latest.forEach((value, key) => map.set(key, value.category));
  return map;
}
