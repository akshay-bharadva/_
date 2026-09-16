import type {
  FinAccountKind,
  FinBucket,
  FinCategory,
  FinCategoryRule,
} from "@/types";
import type { StatementRow } from "./statement";

/**
 * What a bank line is, and where it belongs.
 *
 * ---
 *
 * **A verbatim copy of v1's `import-classify.ts`, and deliberately so.**
 *
 * Every line below except the type imports is byte-identical to v1. Thirteen
 * lines changed in total: four type names in the import block
 * (`AccountKind` → `FinAccountKind`, `CategoryBucket` → `FinBucket`,
 * `FinanceCategory` → `FinCategory`, `FinanceCategoryRule` → `FinCategoryRule`),
 * the `StatementRow` import path, and five annotations that use them. The v2
 * types are structurally identical to the v1 ones for every field this file
 * touches, so nothing here needed adapting.
 *
 * It was copied with `sed` rather than retyped, because this is ~700 lines of
 * accumulated pattern-matching against real bank wording — years of "this
 * merchant is actually fuel, not groceries" — and hand-transcribing it would
 * have been the single largest source of silent error in the whole rebuild for
 * no benefit whatever. `classify.test.ts` demonstrates the equivalence against
 * v1's implementation rather than asserting it.
 *
 * **It is deliberately not Prettier-formatted**, and that is a decision rather
 * than an oversight. v1's original is not formatted either — the longest line
 * in both files is the same 1,017 characters — so running the formatter over
 * this copy is the one thing that *would* make it diverge from the original,
 * and would turn the byte-identical claim above into a stale comment. Several
 * files in this repository are already unformatted; this one stays that way for
 * as long as v1 exists to be compared against. Format it freely once v1 is
 * gone and `classify.test.ts`'s comparisons have been deleted with it.
 *
 * If you are tempted to tidy this file: the ordering of the patterns is load
 * bearing (see the note above `MERCHANTS`), and the comments record mistakes
 * already paid for. Change it for a real misclassification, not for tidiness.
 *
 * ---
 *
 * Four layers, strongest first:
 *
 * 1. **Your rules** — learned from the corrections you made on earlier
 *    imports. You are the authority on what "ETRANSFER JOHN DOE" is.
 * 2. **The bank's own wording** — card payments, transfers between your own
 *    accounts (including e-Transfers to yourself), e-Transfers, cash, fees and
 *    fee rebates, interest, pay, gig payouts, government deposits, cashback,
 *    investments, remittances, loans. These decide whether a line is spending
 *    at all, which matters more than which kind of spending it is.
 * 3. **Your history** — what you called this merchant when you entered it by
 *    hand. (Imported rows are not history: they are this classifier's own
 *    earlier guesses, and learning from them would make a mistake permanent.)
 * 4. **Merchants** — first ~90 named Canadian brands, which also fix the name
 *    ("JIM'S NO FRILLS #3771" is No Frills), then keyword families.
 *
 * Nothing here is final. The review screen shows the reason for every guess.
 *
 * **Why the bank's channel words are stripped first.** CIBC starts most lines
 * with how the money moved — "Internet Banking", "Electronic Funds Transfer
 * PAY", "Branch Transaction", "Point of Sale - Interac RETAIL PURCHASE <ref>".
 * Read naively those became the merchant, so the owner's salary, their car
 * insurance and their phone bill were all "Electronic Funds", and whatever
 * was learned about one was applied to all three. `stripChannel` removes the
 * channel and leaves the counterparty.
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
  income: "Income",
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

/**
 * Every category the classifier can suggest, with the bucket it belongs in.
 * Used to offer to create a suggested category the owner does not have yet —
 * a correct guess with nowhere to go is still a blank row.
 */
export const SUGGESTED_CATEGORIES: Record<
  string,
  { bucket: FinBucket; essential: boolean }
> = {
  Salary: { bucket: "income", essential: false },
  Freelance: { bucket: "income", essential: false },
  Interest: { bucket: "income", essential: false },
  "Government benefits": { bucket: "income", essential: false },
  "Money received": { bucket: "income", essential: false },
  "Cashback & rewards": { bucket: "income", essential: false },
  Rent: { bucket: "need", essential: true },
  Utilities: { bucket: "need", essential: true },
  Groceries: { bucket: "need", essential: true },
  Transport: { bucket: "need", essential: true },
  "Phone & internet": { bucket: "need", essential: true },
  Insurance: { bucket: "need", essential: true },
  Healthcare: { bucket: "need", essential: true },
  "Family support": { bucket: "need", essential: true },
  "Bank fees": { bucket: "need", essential: false },
  "Government fees": { bucket: "need", essential: false },
  Education: { bucket: "need", essential: false },
  "Dining out": { bucket: "want", essential: false },
  Shopping: { bucket: "want", essential: false },
  Cash: { bucket: "want", essential: false },
  Entertainment: { bucket: "want", essential: false },
  "Payments to people": { bucket: "want", essential: false },
  Travel: { bucket: "want", essential: false },
  Subscriptions: { bucket: "want", essential: false },
  "Personal care": { bucket: "want", essential: false },
  "Alcohol & vape": { bucket: "want", essential: false },
  Pets: { bucket: "want", essential: false },
  Savings: { bucket: "save", essential: false },
  Investments: { bucket: "save", essential: false },
  "Debt repayment": { bucket: "save", essential: false },
  Transfer: { bucket: "transfer", essential: false },
};

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
  accountKind: FinAccountKind;
  categories: FinCategory[];
  rules: FinCategoryRule[];
  /** Merchant key → the category you last gave it. */
  history: Map<string, string>;
  /**
   * The owner's own names, so an e-Transfer to or from yourself — between
   * your own banks — is recognised as a transfer rather than income and
   * spending.
   */
  ownerNames?: string[];
}

// ── The bank's channel words ────────────────────────────────────────────────

export type Channel =
  | "pos"
  | "online"
  | "eft"
  | "branch"
  | "atm"
  | "misc"
  | "rbc-etransfer"
  | null;

const CHANNELS: [RegExp, Exclude<Channel, null>][] = [
  [/^POINT OF SALE\s*-\s*(?:INTERAC|VISA DEBIT)(?:\s+VISA DEBIT)?\s+(?:RETAIL PURCHASE|MDSE RETURN|PURCHASE|REFUND)\s+(?:\S*\d\S*\s+)?/, "pos"],
  [/^(?:CONTACTLESS\s+)?INTERAC\s+(?:PURCHASE|REFUND)\s*-\s*\d+\s*/, "pos"],
  [/^INTERNET BANKING\s+(?:E-TRANSFER|INTERNET TRANSFER|FULFILL REQUEST|INTERNET DEPOSIT|INTERNET BILL PAY|BILL PAYMENT)\s+\d*\s*/, "online"],
  [/^INTERNET BANKING\s+/, "online"],
  [/^ELECTRONIC FUNDS TRANSFER\s+(?:PAY|DEPOSIT|PREAUTHORIZED DEBIT|PREAUTHORIZED CREDIT|DEBIT|CREDIT)\s+/, "eft"],
  [/^ELECTRONIC FUNDS TRANSFER\s+/, "eft"],
  [/^BRANCH TRANSACTION\s+/, "branch"],
  [/^AUTOMATED BANKING MACHINE\s+/, "atm"],
  [/^MISC PAYMENT\s+/, "misc"],
  [/^E-?TRANSFER\s*-?\s*(?:SENT|RECEIVED|REQUEST MONEY|AUTODEPOSIT|REQUEST FULFILLED)\s+/, "rbc-etransfer"],
];

/** The channel the bank names, and what is left after it: the counterparty. */
export function stripChannel(description: string): { channel: Channel; rest: string } {
  const upper = description.toUpperCase().replace(/\s+/g, " ").trim();
  for (const [pattern, channel] of CHANNELS) {
    const match = pattern.exec(upper);
    if (match) return { channel, rest: upper.slice(match[0].length).trim() };
  }
  return { channel: null, rest: upper };
}

/** Descriptions an older import stored as the "merchant" — channel words. */
const GENERIC_NAMES =
  /^(INTERNET BANKING|BRANCH TRANSACTION|ELECTRONIC FUNDS|ELECTRONIC FUNDS TRANSFER|POINT OF SALE|MISC PAYMENT|AUTOMATED BANKING|ONLINE BANKING|ONLINE TRANSFER|E-?TRANSFER|PAYMENT THANK|INTERAC PURCHASE|CONTACTLESS INTERAC|MDSE RETURN|DEPOSIT INTEREST|BONUS DEPOSIT|FEE ELECTRONIC|RSP CONTRIBUTION|INVESTMENT SPECIAL|INVESTMENT|MOBILE CHEQUE|CREDIT MEMO|CASHBACK REMISE|PREAUTHORIZED DEBIT)$/;

export const isGenericName = (value: string) =>
  GENERIC_NAMES.test(value.toUpperCase().replace(/[^A-Z- ]+/g, " ").replace(/\s+/g, " ").trim());

// ── Merchant normalisation ──────────────────────────────────────────────────

const NOISE = new Set([
  "POS", "IDP", "PURCHASE", "PURCHASES", "RETAIL", "INTERAC", "VISA", "DEBIT",
  "MASTERCARD", "PREAUTHORIZED", "PRE", "AUTHORIZED", "PAP", "OPOS", "APOS",
  "CONTACTLESS", "POINT", "OF", "SALE", "SQ", "TST", "SP", "PAYPAL", "WWW",
  "COM", "INC", "LTD", "LTEE", "CORP", "CO", "THE", "CANADA", "CDA", "CAN",
  "WAGE", "SALARY", "DOB", "STORE", "LLC",
]);

const PROVINCES = new Set([
  "ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU",
]);

/** Capitalises words, not letters after an apostrophe: "Jim's", not "Jim'S". */
const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/(^|[\s\-/&])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());

/**
 * Named brands: the name the owner would say, and where it belongs. Checked
 * before the keyword families, so the specific wins — Costco Gas is fuel,
 * Amazon Prime is a subscription, "ROB'S NF #7076" is No Frills.
 */
const BRANDS: [RegExp, string, string][] = [
  [/UBER\W*EATS/, "Uber Eats", "Dining out"],
  [/COSTCO GAS/, "Costco Gas", "Transport"],
  [/COSTCO/, "Costco", "Groceries"],
  [/NO ?FRILLS|\bNOFR\b|\bNF\b|'S NO\b|\bS NO FRILLS/, "No Frills", "Groceries"],
  [/WAL-?MART|\bWMT\b/, "Walmart", "Groceries"],
  [/LOBLAWS/, "Loblaws", "Groceries"],
  [/FRESHCO/, "FreshCo", "Groceries"],
  [/FOOD BASICS/, "Food Basics", "Groceries"],
  [/LONGO'?S/, "Longo's", "Groceries"],
  [/SOBEYS/, "Sobeys", "Groceries"],
  [/FARM BOY/, "Farm Boy", "Groceries"],
  [/BULK BARN/, "Bulk Barn", "Groceries"],
  [/MCDONALD/, "McDonald's", "Dining out"],
  [/TIM HORTON/, "Tim Hortons", "Dining out"],
  [/STARBUCKS/, "Starbucks", "Dining out"],
  [/SUBWAY/, "Subway", "Dining out"],
  [/PIZZA PIZZA/, "Pizza Pizza", "Dining out"],
  [/OSMOW/, "Osmow's", "Dining out"],
  [/MARY BROWN/, "Mary Brown's", "Dining out"],
  [/FAT BASTARD/, "Fat Bastard Burrito", "Dining out"],
  [/BAR ?BURRITO/, "Barburrito", "Dining out"],
  [/WENDY/, "Wendy's", "Dining out"],
  [/TACO BELL/, "Taco Bell", "Dining out"],
  [/CINNABON/, "Cinnabon", "Dining out"],
  [/BOOSTER JUICE/, "Booster Juice", "Dining out"],
  [/PRESTO/, "PRESTO", "Transport"],
  [/METROLINX|GO TRANSIT/, "GO Transit", "Transport"],
  [/PETRO-?CAN/, "Petro-Canada", "Transport"],
  [/\bESSO\b/, "Esso", "Transport"],
  [/\bSHELL\b/, "Shell", "Transport"],
  [/ULTRAMAR/, "Ultramar", "Transport"],
  [/PIONEER/, "Pioneer", "Transport"],
  [/\bLYFT\b/, "Lyft", "Transport"],
  [/\bUBER\b/, "Uber", "Transport"],
  [/ENTERPRISE RENT/, "Enterprise", "Transport"],
  [/\bLCBO\b/, "LCBO", "Alcohol & vape"],
  [/BEER STORE/, "The Beer Store", "Alcohol & vape"],
  [/WINE RACK/, "Wine Rack", "Alcohol & vape"],
  [/SHOPPERS DRUG/, "Shoppers Drug Mart", "Healthcare"],
  [/DYNACARE/, "Dynacare", "Healthcare"],
  [/KITS\.CA/, "Kits", "Healthcare"],
  [/DOLLARAMA/, "Dollarama", "Shopping"],
  [/DOLLAR TREE/, "Dollar Tree", "Shopping"],
  [/AMAZON\.CA PRIME|PRIME MEMBER|AMZN PRIME|AMAZON PRIME/, "Amazon Prime", "Subscriptions"],
  [/AMZN|AMAZON/, "Amazon", "Shopping"],
  [/ALIEXPRESS/, "AliExpress", "Shopping"],
  [/\bH ?& ?M\b|\bHM CA\d/, "H&M", "Shopping"],
  [/OLD ?NAVY/, "Old Navy", "Shopping"],
  [/WINNERS/, "Winners", "Shopping"],
  [/MARSHALLS/, "Marshalls", "Shopping"],
  [/HOMESENSE/, "HomeSense", "Shopping"],
  [/CANADIAN TIRE/, "Canadian Tire", "Shopping"],
  [/BEST BUY/, "Best Buy", "Shopping"],
  [/HOME DEPOT/, "The Home Depot", "Shopping"],
  [/\bIKEA\b/, "IKEA", "Shopping"],
  [/URBAN PLANET/, "Urban Planet", "Shopping"],
  // The digits in "FOREVER21" would otherwise drop the name and leave the city.
  [/FOREVER ?21/, "Forever 21", "Shopping"],
  [/MINISO/, "Miniso", "Shopping"],
  [/FREEDOM MOBILE/, "Freedom Mobile", "Phone & internet"],
  [/BELL MOBILITY|\bBELL CANADA\b/, "Bell", "Phone & internet"],
  [/ENBRIDGE/, "Enbridge", "Utilities"],
  [/INTACT INSURANCE/, "Intact Insurance", "Insurance"],
  [/PEMBRIDGE/, "Pembridge Insurance", "Insurance"],
  [/PETSMART/, "PetSmart", "Pets"],
  [/CINEPLEX/, "Cineplex", "Entertainment"],
  [/COURSERA/, "Coursera", "Education"],
  [/WORLD EDUCATION SERVIC/, "WES", "Education"],
  [/REMITLY/, "Remitly", "Family support"],
  [/COINBASE/, "Coinbase", "Investments"],
  [/IMMIGRATION CANADA/, "Immigration Canada", "Government fees"],
  [/SERVICEONTARIO|\bMTO\b/, "ServiceOntario", "Government fees"],
  [/DRIVE ?TEST/, "DriveTest", "Government fees"],
];

/**
 * Cities card terminals print after the merchant. Known ones are removed
 * whole — "RICHMOND HILL" is two words, and popping one left "Richmond" in
 * every name from there. An unknown city is still dropped when a province
 * code follows it.
 */
const CITIES = [
  "RICHMOND HILL", "NORTH YORK", "HALTON HILLS", "NIAGARA FALLS", "KING CITY",
  "PORT PERRY", "BLUE MTNS", "SAINT JOHN", "NORTH VANCOUV", "NEW MARKET",
  "TORONTO", "OSHAWA", "WHITBY", "MARKHAM", "VAUGHAN", "VAUGHN", "MISSISSAUGA",
  "BRAMPTON", "SCARBOROUGH", "ETOBICOKE", "THORNHILL", "PICKERING", "AJAX",
  "MAPLE", "CONCORD", "BARRIE", "AURORA", "NEWMARKET", "UNIONVILLE",
  "STOUFFVILLE", "BOWMANVILLE", "COURTICE", "UXBRIDGE", "OAKVILLE", "BURLINGTON",
  "HAMILTON", "LONDON", "KITCHENER", "WATERLOO", "GUELPH", "OTTAWA", "KINGSTON",
  "PETERBOROUGH", "LINDSAY", "COLLINGWOOD", "MONTREAL", "VANCOUVER", "CALGARY",
  "EDMONTON", "WINNIPEG", "HALIFAX", "SIMCOE", "GORMLEY", "BRIGHTON",
];

function tokenise(text: string): string[] {
  const tokens = text
    .replace(/[*#]/g, " ")
    .replace(/[^A-Z0-9&' ]+/g, " ")
    .split(/\s+/)
    .filter(
      (token) => token.length > 1 && !/\d/.test(token) && !NOISE.has(token),
    );
  let province = false;
  while (tokens.length > 1 && PROVINCES.has(tokens[tokens.length - 1])) {
    tokens.pop();
    province = true;
  }
  let removedCity = false;
  for (const city of CITIES) {
    const words = city.split(" ");
    if (tokens.length > words.length && tokens.slice(-words.length).join(" ") === city) {
      tokens.splice(tokens.length - words.length, words.length);
      removedCity = true;
      break;
    }
  }
  if (province && !removedCity && tokens.length > 1) tokens.pop();
  // "PAYROLL PAYROLL": banks repeat themselves; the name should not.
  return tokens.filter((token, index) => tokens.indexOf(token) === index);
}

/**
 * "Point of Sale - Interac RETAIL PURCHASE 1234 LOBLAWS #1089 TORONTO ON"
 * → key "LOBLAWS", display "Loblaws".
 *
 * The key is two words at most: enough to tell "TIM HORTONS" from "TIM'S
 * AUTO", few enough that store numbers, cities and terminal ids never reach
 * it — otherwise every branch would be a merchant of its own and a rule
 * learned at one would miss the next.
 */
export function normaliseMerchant(description: string): { key: string; display: string } {
  const upper = description.toUpperCase();
  for (const [pattern, display] of BRANDS) {
    if (pattern.test(upper)) return { key: display.toUpperCase(), display };
  }
  const { rest } = stripChannel(upper);
  const tokens = tokenise(rest || upper);
  const key = tokens.slice(0, 2).join(" ") || upper.slice(0, 40).trim();
  return { key, display: titleCase(tokens.slice(0, 3).join(" ") || key) };
}

/** The brand a line belongs to, when it names one. */
function brandOf(text: string): { display: string; category: string } | null {
  for (const [pattern, display, category] of BRANDS) {
    if (pattern.test(text)) return { display, category };
  }
  return null;
}

// ── The bank's wording ──────────────────────────────────────────────────────

const CARD_PAYMENT_IN = /PAYMENT\s*-?\s*THANK YOU|PAIEMEN\s?T\s*-?\s*MERCI|PAYMENT RECEIVED|AUTOMATIC PAYMENT|PAYMENT FROM/;
const CARD_PAYMENT_OUT = /(PAYMENT|PMT|PYMT|BILL PAY).*(VISA|MASTERCARD|\bMC\b|AMEX|AMERICAN EXPRESS|CREDIT CARD|CARD)|(CIBC|RBC|TD|BMO|SCOTIA|TANGERINE|PC|ROGERS|TRIANGLE|MBNA|CAPITAL ONE|NEO) ?(VISA|MASTERCARD|MC|CARD)|\bTO CARD \d/;
const ETRANSFER = /E-?TRANSFER|E-?TRF|E-?TFR|INTERAC E|\bEMT\b|AUTODEPOSIT|FULFILL REQUEST|REQUEST FULFILLED/;
const OWN_TRANSFER = /ONLINE (BANKING )?TRANSFER|INTERNET (BANKING )?TRANSFER|INTERNET DEPOSIT|\bWWW TRF|TRANSFER (TO|FROM)|\bTFR[- ](TO|FR)|\bOB TRF|MOBILE TRANSFER|ONLINE TRF|INTER-?ACCOUNT|ACCOUNT TRANSFER|\bTRSF\b/;
const CASH = /\bATM\b|\bABM\b|CASH WITHDRAWAL|BANKING MACHINE|WITHDRAWAL.*(ATM|ABM)|CASH ADVANCE/;
const FEE = /MONTHLY FEE|SERVICE CHARGE|ACCOUNT FEE|ANNUAL FEE|PLAN FEE|\bNSF\b|OVERDRAFT|OVERLIMIT|OVER LIMIT|INTEREST CHARGE|PURCHASE INTEREST|CASH ADVANCE INTEREST|FOREIGN (TRANSACTION|EXCHANGE|CURRENCY) FEE|E-?TRANSFER (NETWORK )?FEE|INTERAC E-?TRANSFER FEE|REQUEST FULFILLED FEE|NETWORK FEE|FEE ELECTRONIC|INTERAC FEE|\bFEE\b/;
// Not a bare "REBATE": the federal carbon rebate arrives as "CarbonRebate".
const FEE_REBATE = /SERVICE CHARGE DISCOUNT|FEE (REBATE|REVERSAL|REFUND)|CHARGE REVERSAL|INTEREST REVERSAL/;
const INTEREST_IN = /\bINTEREST\b/;
const CASHBACK = /CASHBACK|REMISE EN ARGENT|OFFER\/OFFRE|\bREWARDS?\b|\bBONUS\b(?!.*INTEREST)/;
const PAYROLL = /PAYROLL|PAY ?DEP|DIRECT DEP|DIR DEP|SALARY|\bPAY\b|EMPLOYER/;
const GIG = /UBER HOLDINGS|UBER CANADA|UBER BV|\bLYFT\b|DOORDASH|SKIP ?THE ?DISHES|INSTACART|\bAMZN FLEX|FIVERR|UPWORK/;
const GOVERNMENT = /CANADA FED|\bGST\b|TPS\/GST|HST CREDIT|\bCCB\b|CANADA CHILD|\bCRA\b|EI CANADA|\bEI\b|\bCPP\b|\bOAS\b|FED GOVT|PROV\/LOCAL|ONTARIO TRILLIUM|\bOTB\b|CANADA PRO|CARBON ?REBATE|REMISE CARBONE|\bCAIP\b|CLIMATE ACTION|REVENU QUEBEC|TAX REFUND|IMP[OÔ]T|BENEFIT|DEPOSIT CANADA$|^CANADA$/;
const INVESTMENT = /WEALTHSIMPLE|QUESTRADE|DIRECT INVESTING|INVESTORLINE|DISNAT|\bTFSA\b|\bRRSP\b|\bRSP\b|\bFHSA\b|\bRESP\b|\bGIC\b|MOOMOO|INTERACTIVE BROKERS|NATIONAL BANK DIRECT|QTRADE|VIRTUAL BROKERS|MUTUAL FUNDS?|\bETF\b|INVESTMENT|COINBASE|KRAKEN|NEWTON|SHAKEPAY/;
const REMITTANCE = /\bWISE\b|TRANSFERWISE|REMITLY|WESTERN UNION|\bXOOM\b|MONEYGRAM|\bRIA\b|INSTAREM|WORLDREMIT|PAYSEND/;
const LOAN = /MORTGAGE|LOAN PMT|LOAN PAYMENT|LINE OF CREDIT|\bLOC\b PAYMENT|STUDENT LOAN|\bNSLSC\b|OSAP|CAR LOAN|AUTO LOAN|\bLEASE\b/;
const MONEY_IN = /MISC PAYMENT|CHEQUE DEPOSIT|MOBILE DEPOSIT|CREDIT MEMO|ASURION|DEPOSIT IBB|BRANCH DEPOSIT/;
/** A name made only of how the money moved, with nothing about who. */
const CHANNEL_NAME = /^(INTERNET BANKING|ELECTRONIC FUNDS|BRANCH TRANSACTION|ONLINE (BANKING )?TRANSFER|ONLINE TRANSFER|TO CARD|PAYMENT THANK|POINT OF SALE|AUTOMATED BANKING)/i;
/** "557.97 TRY @ 0.031202": spent in another currency — usually abroad. */
const FOREIGN = /\b([A-Z]{3}) @ \d/;

// ── Keyword families, Canada first ──────────────────────────────────────────
// Order matters: the first match wins, so fuel sits above groceries (a gas
// bar at a Costco is fuel) and "\bRESTO\b" is a whole word — "PRESTO"
// contained it, and every transit fare was filed as dining.

const MERCHANTS: [RegExp, string][] = [
  [/GAS BAR|\bHUSKY\b|CIRCLE K|\bMOBIL\b|IRVING|CANADIAN TIRE GAS|\bGAS STATION/, "Transport"],
  [/\bVAPE\b|CANNABIS|CIGAR|SMOKE|TOBACCO|\bSAQ\b|\bBREWERY|WINERY|LIQUOR/, "Alcohol & vape"],
  [/IMMIGRATION|\bIRCC\b|OINP|MLITSD|SERVICE ?ONTARIO|\bMTO\b|DRIVE ?TEST|CITY OF|CORPORATION OF THE|TOWN OF|REGION OF|PASSPORT|PROVINCE OF/, "Government fees"],
  [/COURSERA|UDEMY|COLLEGE|UNIVERSITY|\bUNIV\b|SCHOOL|EDUCATION|TESTING|PROMETRIC|PARAGON|IELTS|CELPIP|\bWES\b|MYCREDS|QUALIFICATION CHECK|TUITION|DC REGISTRATION|\bLMS\b|ACADEMY|LEARNING/, "Education"],
  [/PETSMART|PET VALU|PETLAND|\bPET\b|VETERINAR|\bVET\b/, "Pets"],
  [/SALON|BARBER|\bHAIR\b|\bNAILS?\b|\bSPA\b|COSMETIC|BEAUTY|WAXING|\bLASH/, "Personal care"],
  [/UBER\W*EATS|DOOR ?DASH|SKIP ?THE ?DISHES|SKIPTHEDISHES|TIM HORTON|STARBUCKS|MCDONALD|\bA ?& ?W\b|SUBWAY|WENDY|BURGER|POPEYES|PIZZA|DOMINO|CHIPOTLE|MARY BROWN|HARVEY|\bKFC\b|DAIRY QUEEN|FRESHII|OSMOW|BURRITO|CHAAT|BIRYANI|TANDOOR|SUSHI|RAMEN|\bPHO\b|SHAWARMA|SHAWAFEL|MEDITERR|MIDTERR|RESTAURANT|\bRESTAU|\bRESTO\b|\bCAFE\b|COFFEE|BAKERY|BISTRO|GRILL|\bPUB\b|DINER|BUBBLE TEA|CHATIME|DAVIDSTEA|SECOND CUP|BALZAC|THAI EXPRESS|\bTHAI\b|MANCHU WOK|NANDO|SWISS CHALET|EARLS|CACTUS CLUB|THE KEG|MONTANA|EAST SIDE MARIO|KELSEY|MILESTONES|ST-HUBERT|\bGUU\b|TACO|FIVE GUYS|CHICK-FIL|WINGSTOP|CANTEEN|CUISINE|SWEETS?\b|\bTHALI?\b|CATERS|CATERING|CURRY|KABAB|KEBAB|\bMOMO\b|PANIPURI|\bJERK\b|TIFFIN|\bMEALS\b|\bPAAN\b|PUFFS|LOUNGE|\bPITA\b|CINNABON|JUICE|SQUEEZED|DESSERT|SCOOP|ICE CREAM|GELATO|\bINDIAN\b|CHAI|CHUTNEY|\bROTI\b|PUNJABI|SPICELAND|TOAST|BITEBOX|YIYECEK|SHANGHAI|DELHI|TIPSY|\bBAR &|NOODLE|DUMPLING|WOK\b|HALAL|FRIED CHIC|CHICKEN|DONAIR|POUTINE|PATTIES|\bTST-|CHOLE|MASALA|SANKALP|FLAVOU?RS OF/, "Dining out"],
  [/LOBLAW|NO ?FRILLS|SUPERSTORE|\bMETRO\b|SOBEYS|FRESHCO|FOOD ?BASICS|FARM ?BOY|WHOLE ?FOODS|\bT ?& ?T\b|COSTCO|WALMART|WAL-MART|SAFEWAY|SAVE[- ]?ON|\bIGA\b|\bMAXI\b|PROVIGO|ADONIS|FORTINOS|ZEHRS|VALU[- ]?MART|YOUR INDEPENDENT|GIANT TIGER|INSTACART|VOILA|FOODLAND|COOP|CO-OP|LONGO|NATIONS FRESH|BULK BARN|SUPERMARKET|GROCERY|GROCER|MARKET|PATEL BROTHERS|IQBAL|BAZAAR|\bH MART\b|GALLERIA|PC EXPRESS|FOOD MART|\bFOODS\b|\bMART\b/, "Groceries"],
  [/PRESTO|\bTTC\b|GO ?TRANSIT|METROLINX|UP EXPRESS|OC ?TRANSPO|\bSTM\b|TRANSLINK|COMPASS CARD|\bMIWAY\b|\bYRT\b|BRAMPTON TRANSIT|\bGRT\b|\bUBER\b|\bLYFT\b|SHELL|\bESSO\b|PETRO[- ]?CAN|PIONEER|ULTRAMAR|PARKING|IMPARK|INDIGO PARK|GREEN ?P\b|HONK|\b407 ?ETR|PRECISION PARK|COMMUNAUTO|ZIPCAR|EVO CAR|ENTERPRISE RENT|BUDGET RENT|\bAVIS\b|HERTZ|CAR WASH|JIFFY LUBE|MIDAS|MR LUBE|AUTO REPAIR|AUTO SERVICE|AUTOMOTIVE|COLLISION|\bTIRES?\b|HONDA|TOYOTA|HYUNDAI|\bKIA\b|NISSAN|MAZDA|\bFORD\b|CHEVROLET|VOLKSWAGEN/, "Transport"],
  [/ROGERS|\bBELL\b|TELUS|\bFIDO\b|KOODO|VIRGIN (PLUS|MOBILE)|FREEDOM MOBILE|CHATR|PUBLIC MOBILE|LUCKY MOBILE|\bSHAW\b|VIDEOTRON|TEKSAVVY|START\.?CA|EASTLINK|COGECO|DISTRIBUTEL|OXIO|ACANAC/, "Phone & internet"],
  [/HYDRO|ENBRIDGE|ALECTRA|FORTIS|EPCOR|ENMAX|\bATCO\b|UNION GAS|RELIANCE HOME|ENERCARE|WATER BILL|UTILITIES|ELEXICON|NB POWER|SASKPOWER/, "Utilities"],
  [/NETFLIX|SPOTIFY|DISNEY|\bCRAVE\b|APPLE\.COM|APPLE ?MUSIC|ICLOUD|GOOGLE ?(STORAGE|ONE|PLAY|\*)|YOUTUBE|PRIME ?VIDEO|PRIME MEMBER|AMAZON ?PRIME|AMZN ?PRIME|AUDIBLE|PATREON|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|MICROSOFT|XBOX GAME PASS|ADOBE|DROPBOX|GITHUB|NOTION|PARAMOUNT|\bDAZN\b|SIRIUS|DUOLINGO|HOTSTAR|JIOCINEMA|SONYLIV|ZEE5|LINKEDIN|MEDIUM|NYTIMES|1PASSWORD|NORDVPN|EXPRESSVPN|CANVA|SUBSCRIPTION/, "Subscriptions"],
  [/SHOPPERS|REXALL|PHARMA|PHARMACY|\bDRUGS?\b|DENTAL|DENTIST|CLINIC|MEDICAL|PHYSIO|CHIRO|OPTOM|OPTICAL|EYEWEAR|HOSPITAL|LONDON DRUGS|JEAN COUTU|WELL\.CA|LIFELABS|DYNACARE|MASSAGE|MENTAL HEALTH|THERAP|VISION/, "Healthcare"],
  [/INSURANCE|ASSURANCE|INTACT|AVIVA|BELAIR|SONNET|MANULIFE|SUN ?LIFE|CANADA LIFE|DESJARDINS INS|TD INS|SQUARE ONE|APOLLO INS|CAA INS|WAWANESA|COOPERATORS|CO-OPERATORS|ECONOMICAL|GORE MUTUAL|ALLSTATE|PEMBRIDGE/, "Insurance"],
  [/\bRENT\b|PROPERTY MGMT|PROPERTY MANAGEMENT|APARTMENTS?\b|REALTY|\bRENTALS?\b|CAPREIT|MINTO|TRIDEL|STARLIGHT|GREENWIN|HOUSING CO-?OP|CONDO FEE|STRATA/, "Rent"],
  [/AIR CANADA|WESTJET|PORTER|FLAIR|AIR INDIA|EMIRATES|QATAR|ETIHAD|TURKISH AIR|LUFTHANSA|BRITISH AIRWAYS|KLM|AIR FRANCE|UNITED AIR|DELTA AIR|AMERICAN AIR|INDIGO AIR|VISTARA|EXPEDIA|BOOKING\.COM|AIRBNB|HOTEL|MARRIOTT|HILTON|HYATT|\bIHG\b|BEST WESTERN|VIA RAIL|GREYHOUND|MEGABUS|FLIXBUS|TRAVEL|DUTY FREE|UNIFREE|MAKEMYTRIP|CLEARTRIP|KAYAK|SKYSCANNER|TRIP\.COM|AIRALO|\bAIRL/, "Travel"],
  [/CINEPLEX|CINEMA|LANDMARK CINEMA|IMAX|STEAM|PLAYSTATION|\bXBOX\b|NINTENDO|TICKETMASTER|EVENTBRITE|LIVE NATION|TICKETS|GOODLIFE|FIT4LESS|PLANET FITNESS|\bYMCA\b|ANYTIME FITNESS|BOWL|MUSEUM|\bZOO\b|RIPLEY|WONDERLAND|CN TOWER|ESCAPE ROOM|GOLF|\bSKI\b|CLIMB|THEATRE|THEATER|CONCERT|TWITCH|EPIC GAMES|BATTLE ?NET|RIOT GAMES|EB GAMES|MIND GAMES|\bGAMES\b|CAVES|HORNBLOWER|CRUISE|SPEEDWAY|GO ?KART|AUTO SHOW|PPARK|PROVINCIAL PARK|ATTRACTION|AMUSEMENT/, "Entertainment"],
  [/AMAZON|\bAMZN\b|BEST ?BUY|\bIKEA\b|CANADIAN TIRE|WINNERS|MARSHALLS|HOMESENSE|\bH ?& ?M\b|\bZARA\b|UNIQLO|\bGAP\b|OLD ?NAVY|SPORT ?CHEK|DOLLARAMA|DOLLAR TREE|STAPLES|HOME ?DEPOT|LOWE'?S|\bRONA\b|SHEIN|\bTEMU\b|ALIEXPRESS|\bETSY\b|\bEBAY\b|APPLE STORE|INDIGO|CHAPTERS|SEPHORA|LULULEMON|SIMONS|HUDSON'?S BAY|\bTHE BAY\b|ROOTS|ARITZIA|\bMEC\b|SPORTING LIFE|STRUCTUBE|WAYFAIR|LEON'?S|THE BRICK|MICHAELS|PARTY CITY|TOYS?\b|TOYTEXX|MEMORY EXPRESS|CANADA COMPUTERS|THE SOURCE|MUJI|MINISO|PENNINGTONS|REITMANS|FOOT LOCKER|SOFTMOC|ALDO|NIKE|ADIDAS|PUMA|UNDER ARMOUR|FOSSIL|FOREVER ?21|URBAN PLANET|BLUENOTES|ARDENE|STYLEVANA|KITCHEN STUFF|FOX HOME|OUTLET|LIQUIDA|TRENDY|\bSHOP\b|\bSTORE\b|BOUTIQUE/, "Shopping"],
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveCategory(name: string | null, categories: FinCategory[]): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return categories.find((c) => !c.archived_at && c.name.toLowerCase() === lower)?.id ?? null;
}

const nameTokens = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

/**
 * Whether an e-Transfer's other party is the owner: first name, and the last
 * name or a truncation of it ("BHARAD" for a longer surname — banks cut names
 * to fit), or the first name alone, which is how a transfer between your own
 * banks usually reads.
 */
export function isOwnName(counterparty: string | null, ownerNames: string[] = []): boolean {
  if (!counterparty) return false;
  const party = nameTokens(counterparty);
  if (party.length === 0) return false;
  return ownerNames.some((owner) => {
    const tokens = nameTokens(owner);
    if (tokens.length === 0 || !party.includes(tokens[0])) return false;
    if (party.length === 1 || tokens.length === 1) return true;
    const last = tokens[tokens.length - 1];
    return party.some((token) => token === last || (token.length >= 5 && last.startsWith(token)));
  });
}

const cleanParty = (value: string) =>
  value
    .toUpperCase()
    .replace(/^ONE-TIME CONTACT\s*/, "")
    .replace(/\s+/g, " ")
    .trim() || null;

/** The other party of an e-Transfer, wherever this bank puts it. */
function counterpartyOf(row: StatementRow, channel: Channel, rest: string, text: string): string | null {
  if (row.detail && !/^\d+$/.test(row.detail) && !FOREIGN.test(row.detail.toUpperCase())) {
    return cleanParty(row.detail);
  }
  if (channel === "rbc-etransfer") {
    // RBC appends a reference ("CAQES4FK", "C1FZKEVCEMFJ") to every name.
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) tokens.pop();
    return cleanParty(tokens.join(" "));
  }
  if (channel === "online" && /E-?TRANSFER|FULFILL REQUEST/.test(text)) {
    return rest ? cleanParty(rest) : null;
  }
  const match =
    /(?:E-?TRANSFER|E-?TRF|E-?TFR|EMT|INTERAC E-?TRANSFER|AUTODEPOSIT)[^A-Z]*(?:SENT|RECEIVED|TO|FROM|SEND|RECV)?[^A-Z]*([A-Z][A-Z .'-]{2,40})$/i.exec(
      row.description,
    );
  return match ? cleanParty(match[1]) : null;
}

/** Rule patterns that are channel words and would match a whole bank. */
export const isGenericPattern = (pattern: string) => isGenericName(pattern);

function ruleFor(key: string, rules: FinCategoryRule[]): FinCategoryRule | null {
  let best: FinCategoryRule | null = null;
  for (const rule of rules) {
    const pattern = rule.pattern.toUpperCase();
    // A rule learned from an older import's channel words ("INTERNET
    // BANKING") would claim every line that came through the website.
    if (isGenericPattern(pattern)) continue;
    if (key === pattern || key.startsWith(`${pattern} `)) {
      if (!best || pattern.length > best.pattern.length) best = rule;
    }
  }
  return best;
}

// ── Classifying ─────────────────────────────────────────────────────────────

export function classify(row: StatementRow, context: ClassifyContext): Classification {
  const text = `${row.description} ${row.detail}`.toUpperCase().replace(/\s+/g, " ").trim();
  const { channel, rest } = stripChannel(row.description);
  const outgoing = row.amount < 0;
  const type: "earning" | "expense" = outgoing ? "expense" : "earning";
  const isCard = context.accountKind === "credit";

  const isEtransfer = ETRANSFER.test(text) && !FEE.test(text);
  const counterparty = isEtransfer ? counterpartyOf(row, channel, rest, text) : null;
  const brand = brandOf(text);
  const plain = normaliseMerchant(row.description);
  const merchantKey = isEtransfer
    ? brand
      ? brand.display.toUpperCase()
      : `ETRANSFER ${counterparty ?? ""}`.trim()
    : plain.key;
  const merchant = isEtransfer
    ? brand
      ? brand.display
      : counterparty
        ? `e-Transfer ${outgoing ? "to" : "from"} ${titleCase(counterparty)}`
        : "e-Transfer"
    : plain.display;

  const build = (
    kind: ImportKind,
    categoryName: string | null,
    source: Classification["source"],
    reason: string,
    override?: { categoryId?: string | null; isTransfer?: boolean },
  ): Classification => {
    const isTransfer = override?.isTransfer ?? TRANSFER_KINDS.includes(kind);
    const name = isTransfer && !categoryName ? "Transfer" : categoryName;
    // When the bank said nothing but how the money moved ("Internet Banking
    // INTERNET TRANSFER 000000129486"), the name is what the line *is*.
    const channelOnly = CHANNEL_NAME.test(merchant) || isGenericName(merchant);
    const shown = isEtransfer
      ? merchant
      : kind === "card_payment" || (kind === "own_transfer" && channelOnly)
        ? KIND_LABELS[kind]
        : channelOnly
          ? name ?? KIND_LABELS[kind]
          : merchant;
    return {
      kind,
      type,
      isTransfer,
      categoryName: name,
      categoryId:
        override?.categoryId !== undefined ? override.categoryId : resolveCategory(name, context.categories),
      merchantKey,
      merchant: shown,
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
  } else if (!outgoing && FEE_REBATE.test(text)) {
    kind = "refund";
    bankCategory = "Bank fees";
    bankReason = "A fee the bank gave back — it reduces what fees cost you.";
  } else if (FEE.test(text) && (outgoing || isCard)) {
    kind = "fee";
    bankCategory = "Bank fees";
    bankReason = /INTEREST/.test(text) ? "Interest charged by the bank." : "A fee charged by the bank.";
  } else if (isEtransfer) {
    if (isOwnName(counterparty, context.ownerNames)) {
      kind = "own_transfer";
      bankReason = `An e-Transfer ${outgoing ? "to" : "from"} yourself — money moving between your own banks.`;
    } else if (brand?.category === "Family support" || REMITTANCE.test(text)) {
      kind = "remittance";
      bankCategory = "Family support";
      bankReason = `Sent abroad through ${brand?.display ?? "a remittance service"}.`;
    } else if (brand?.category === "Investments") {
      kind = "investment";
      bankCategory = "Investments";
      bankReason = `Money into ${brand.display} — invested, not spent.`;
    } else {
      kind = outgoing ? "etransfer_out" : "etransfer_in";
      bankCategory = outgoing ? "Payments to people" : "Money received";
      bankReason = counterparty
        ? `Interac e-Transfer ${outgoing ? "to" : "from"} ${titleCase(counterparty)}.`
        : "Interac e-Transfer.";
    }
  } else if (OWN_TRANSFER.test(text)) {
    kind = "own_transfer";
    bankReason = "The bank calls this a transfer between accounts.";
  } else if (outgoing && CASH.test(text)) {
    kind = "cash";
    bankCategory = "Cash";
    bankReason = "Cash out of the bank — counted as spent when it leaves.";
  } else if (!outgoing && !isCard && INTEREST_IN.test(text)) {
    kind = "interest";
    bankCategory = "Interest";
    bankReason = "Interest the bank paid you.";
  } else if (!outgoing && CASHBACK.test(text)) {
    kind = "income";
    bankCategory = "Cashback & rewards";
    bankReason = "Cashback or a reward.";
  } else if (!outgoing && GOVERNMENT.test(text)) {
    kind = "government";
    bankCategory = "Government benefits";
    bankReason = "A deposit from government.";
  } else if (!outgoing && GIG.test(text)) {
    kind = "income";
    bankCategory = "Freelance";
    bankReason = "A payout from a gig platform.";
  } else if (!outgoing && PAYROLL.test(text)) {
    kind = "income";
    bankCategory = "Salary";
    bankReason = "Looks like pay.";
  } else if (INVESTMENT.test(text)) {
    kind = "investment";
    bankCategory = "Investments";
    bankReason = outgoing
      ? "Money into investing — saved, not spent."
      : "Money back from an investment — less saved, not income.";
  } else if (REMITTANCE.test(text)) {
    kind = "remittance";
    bankCategory = "Family support";
    bankReason = "Sent abroad. If it went to your own account, the other side's import will pair it as a transfer.";
  } else if (outgoing && LOAN.test(text)) {
    kind = "loan_payment";
    bankCategory = "Debt repayment";
    bankReason = "A loan or mortgage payment.";
  } else if (!outgoing && !isCard && MONEY_IN.test(text) && !brand) {
    kind = "income";
    bankCategory = "Money received";
    bankReason = "Money in from outside your accounts.";
  }

  // 1. Your rules.
  const rule = ruleFor(merchantKey, context.rules);
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

  // 4. Merchants: named brands, then keyword families.
  const describe = (name: string) =>
    kind === "refund" ? `A refund from ${merchant}.` : `${merchant} is usually ${name.toLowerCase()}.`;
  if (brand) return build(kind, brand.category, "merchant", describe(brand.category));
  for (const [pattern, name] of MERCHANTS) {
    if (pattern.test(text)) return build(kind, name, "merchant", describe(name));
  }

  const foreign = FOREIGN.exec(text);
  if (outgoing && foreign && foreign[1] !== "CAD") {
    return build(kind, "Travel", "merchant", `Spent in ${foreign[1]} — probably while travelling.`);
  }

  return build(
    kind,
    null,
    "none",
    outgoing ? "Nothing recognised it — pick a category." : "Money in from somewhere unrecognised — pick a category.",
  );
}

/**
 * Merchant key → the category most recently given to it, from rows the owner
 * entered by hand.
 *
 * Imported rows are left out on purpose: their categories are this
 * classifier's own earlier guesses (corrections made during an import become
 * rules instead), and learning from them turned one wrong guess into a
 * permanent one — which is how every PRESTO fare stayed "Dining out".
 */
export function historyFrom(
  transactions: {
    description: string;
    raw_description?: string | null;
    category_id?: string | null;
    transfer_group?: string | null;
    import_hash?: string | null;
    date: string;
  }[],
): Map<string, string> {
  const latest = new Map<string, { date: string; category: string }>();
  for (const transaction of transactions) {
    if (!transaction.category_id || transaction.transfer_group || transaction.import_hash) continue;
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
