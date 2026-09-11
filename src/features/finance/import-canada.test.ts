import { describe, it, expect } from "vitest";
import type { FinanceAccount, FinanceCategory, FinanceCategoryRule, Transaction } from "@/types";
import type { StatementRow } from "./import-formats";
import {
  classify,
  isGenericName,
  isOwnName,
  normaliseMerchant,
  stripChannel,
  SUGGESTED_CATEGORIES,
} from "./import-classify";
import { buildTidyProposals } from "./import-tidy";

/**
 * Real shapes from CIBC and RBC exports — merchants as they print, and
 * invented people. The owner's own name here is fictional too.
 */

const OWNER = ["Jordan Maplewood"];

const categories: FinanceCategory[] = Object.entries(SUGGESTED_CATEGORIES).map(
  ([name, meta], index) => ({
    id: `c${index}`,
    name,
    bucket: meta.bucket,
    is_essential: meta.essential,
    sort_order: index,
  }),
);
const idOf = (name: string) => categories.find((c) => c.name === name)!.id;

const row = (description: string, amount: number, detail = ""): StatementRow => ({
  line: 1,
  date: "2025-03-01",
  description,
  detail,
  amount,
  accountRef: null,
  currency: null,
});

const read = (
  description: string,
  amount: number,
  { accountKind = "chequing", rules = [] as FinanceCategoryRule[], detail = "" } = {},
) =>
  classify(row(description, amount, detail), {
    accountKind: accountKind as FinanceAccount["kind"],
    categories,
    rules,
    history: new Map(),
    ownerNames: OWNER,
  });

describe("the bank's channel words are not the merchant", () => {
  it.each([
    ["Electronic Funds Transfer PAY 10740708049 ACME CORPORATION", "eft", "10740708049 ACME CORPORATION"],
    ["Internet Banking E-TRANSFER 105258192099 Sam Rivers", "online", "SAM RIVERS"],
    ["Point of Sale - Interac RETAIL PURCHASE 601513293101 COSTCO WHOLESAL", "pos", "COSTCO WHOLESAL"],
    ["Branch Transaction SERVICE CHARGE DISCOUNT", "branch", "SERVICE CHARGE DISCOUNT"],
    ["E-TRANSFER RECEIVED SAM RIVERS CAQES4FK", "rbc-etransfer", "SAM RIVERS CAQES4FK"],
  ])("%s", (description, channel, rest) => {
    expect(stripChannel(description)).toEqual({ channel, rest });
  });

  it("names the counterparty, not the channel", () => {
    expect(normaliseMerchant("Electronic Funds Transfer PREAUTHORIZED DEBIT INTACT INSURANCE COMPANY").display).toBe(
      "Intact Insurance",
    );
    expect(normaliseMerchant("Electronic Funds Transfer PAY 10740708049 ACME CORPORATION").display).toBe(
      "Acme Corporation",
    );
    expect(isGenericName("Electronic Funds")).toBe(true);
    expect(isGenericName("Internet Banking")).toBe(true);
    expect(isGenericName("Tim Hortons")).toBe(false);
  });

  it.each([
    ["JIM'S NO FRILLS #3771 RICHMOND HILL, ON", "No Frills"],
    ["ROB'S NF #7076 UNIONVILLE, ON", "No Frills"],
    ["WAL-MART SUPERCENTER#3195 RICHMOND HILL, ON", "Walmart"],
    ["WMT SUPRCTR #1069 PORT PERRY", "Walmart"],
    ["MCDONALD S #8930 RICHMOND HILL", "McDonald's"],
    ["HM CA0094 Richmond Hill, ON", "H&M"],
    ["SQ *HABIBZ CORNER Richmond Hill", "Habibz Corner"],
    ["PUNJABI BY NATURE BRAMPTON, ON", "Punjabi By Nature"],
  ])("%s reads as %s", (description, display) => {
    expect(normaliseMerchant(description).display).toBe(display);
  });
});

describe("where each line belongs", () => {
  it.each([
    // The two bugs the owner's data exposed.
    ["PRESTO GOOG/5F7FDJ9FX9 TORONTO, ON", -3.3, "chequing", "Transport"],
    ["Point of Sale - Interac RETAIL PURCHASE 526618412245 COSTCO GAS W159", -60, "chequing", "Transport"],
    // Fuel, phone, insurance, health, fun — recognised all along, but they
    // need categories the owner may not have.
    ["SHELL C21987 RICHMOND HILL, ON", -50, "credit", "Transport"],
    ["Electronic Funds Transfer PREAUTHORIZED DEBIT BELL MOBILITY", -80, "chequing", "Phone & internet"],
    ["Electronic Funds Transfer PREAUTHORIZED DEBIT INTACT INSURANCE COMPANY", -150, "chequing", "Insurance"],
    ["SHOPPERS DRUG MART #14 OSHAWA, ON", -20, "credit", "Healthcare"],
    ["CINEPLEX 7289 QPS OSHAWA, ON", -25, "credit", "Entertainment"],
    // Categories a Canadian statement needs.
    ["LCBO/RAO #0248 RICHMOND HILL, ON", -40, "credit", "Alcohol & vape"],
    ["VAPE 20 OSHAWA", -30, "credit", "Alcohol & vape"],
    ["PETSMART INC. 3032 MAPLE", -45, "credit", "Pets"],
    ["COURSERA*520521076 SCHIPHOL", -60, "credit", "Education"],
    ["IMMIGRATION CANADA ONLINE OTTAWA, ON", -85, "credit", "Government fees"],
    ["DRIVE TEST PAYMENT TORONTO, ON", -90, "credit", "Government fees"],
    ["A & T HAIR SALON RICHMOND HILL, ON", -25, "credit", "Personal care"],
    ["Amazon.ca Prime Member amazon.ca/pri, BC", -9.99, "credit", "Subscriptions"],
    ["BHAIS INDIAN CANTEEN RICHMOND HILL, ON", -30, "credit", "Dining out"],
    ["URBAN PLANET #1671 OSHAWA, ON", -40, "credit", "Shopping"],
    ["ICTUR YIYECEK VE ICECE ANTALYA · 557.97 TRY @ 0.031202", -17.4, "credit", "Dining out"],
    ["UNIFREE IST 8107 M ISTANBUL", -43, "credit", "Travel"],
    // Bank wording.
    ["Branch Transaction E-TRANSFER NETWORK FEE", -1.5, "chequing", "Bank fees"],
    ["Branch Transaction SERVICE CHARGE DISCOUNT", 6.95, "chequing", "Bank fees"],
    ["Electronic Funds Transfer DEPOSIT CANADA", 120, "chequing", "Government benefits"],
    ["CANADA ESSENTIALS BENEFIT CANADA", 250, "chequing", "Government benefits"],
    ["Electronic Funds Transfer DEPOSIT Remise carbone CA CarbonRebate", 140, "chequing", "Government benefits"],
    ["MISC PAYMENT UBER HOLDINGS C", 60, "chequing", "Freelance"],
    ["Electronic Funds Transfer DEPOSIT S1VV3RKKS2QY5AX UBER HOLDINGS CANADA INC", 60, "chequing", "Freelance"],
    ["INVESTMENT SPECIAL DEPOSIT", -500, "chequing", "Investments"],
    ["RSP CONTRIBUTION SPECIAL DEPOSIT", -500, "chequing", "Investments"],
    ["Electronic Funds Transfer DEPOSIT GIC-230510718 CIBC ISBO", 1000, "chequing", "Investments"],
    ["Internet Banking FULFILL REQUEST 105461545630 Remitly", -300, "chequing", "Family support"],
    ["Internet Banking FULFILL REQUEST 105434370331 Coinbase Canada Inc.", -200, "chequing", "Investments"],
    ["CASHBACK/REMISE EN ARGENT", 25, "credit", "Cashback & rewards"],
    ["MOBILE CHEQUE DEPOSIT - 3786", 400, "chequing", "Money received"],
    // Toast (restaurant card terminals) and a few more kitchens.
    ["Point of Sale - Interac RETAIL PURCHASE 3J40FWZJ0000 TST-Ambarsari K", -30, "chequing", "Dining out"],
    ["PATTIES EXPRESS TORONTO, ON", -8, "credit", "Dining out"],
    ["Everest masala Montreal, QC", -12, "credit", "Dining out"],
  ])("%s → %s", (description, amount, accountKind, category) => {
    const result = read(description, amount, { accountKind });
    expect(result.categoryName).toBe(category);
    expect(result.categoryId).toBe(idOf(category));
    expect(result.isTransfer).toBe(false);
  });

  it.each([
    ["Internet Banking INTERNET TRANSFER 000000217153 TO CARD 4505********5969", -500, "card_payment"],
    ["PAYMENT - THANK YOU / PAI EMENT - MERCI", 500, "card_payment"],
    ["Internet Banking INTERNET DEPOSIT 000000205835", 200, "own_transfer"],
    ["ONLINE TRANSFER TO DEPOSIT ACCOUNT-3874", -200, "own_transfer"],
  ])("%s is money moving between your accounts", (description, amount, kind) => {
    const result = read(description, amount, { accountKind: amount > 0 && kind === "card_payment" ? "credit" : "chequing" });
    expect(result.kind).toBe(kind);
    expect(result.isTransfer).toBe(true);
  });
});

describe("names, when the bank gives nothing but the channel", () => {
  it("names the line by what it is", () => {
    expect(read("Internet Banking INTERNET TRANSFER 000000129486", -500).merchant).toBe("Between your accounts");
    expect(read("PAYMENT THANK YOU/PAIEMEN T MERCI", 500, { accountKind: "credit" }).merchant).toBe(
      "Credit card payment",
    );
    expect(read("Internet Banking INTERNET TRANSFER 000000217153 TO CARD 4505********5969", -500).merchant).toBe(
      "Credit card payment",
    );
    expect(read("Electronic Funds Transfer DEPOSIT CANADA", 120).merchant).toBe("Government benefits");
  });

  it("does not repeat itself, or lose a name to its digits", () => {
    expect(normaliseMerchant("Electronic Funds Transfer PAY PAYROLL PAYROLL").display).toBe("Payroll");
    expect(normaliseMerchant("FOREVER21 #1772 OSHAWA, ON").display).toBe("Forever 21");
  });
});

describe("e-Transfers to yourself", () => {
  it.each([
    ["Internet Banking E-TRANSFER 104910986948 JORDAN MAPLEWOOD", -400],
    ["E-TRANSFER RECEIVED JORDAN QUINN MAPLEWOOD CAUWBGTM", 400],
    ["E-TRANSFER - REQUEST MONEY JORDAN QUINN MAPLEWOOD C1FZKEVCEMFJ", 400],
    ["E-TRANSFER SENT JORDAN THUZBC", -400],
    ["Internet Banking E-TRANSFER 011023363957 JORDAN QUINNB MAPLEW", 400],
    ["Internet Banking FULFILL REQUEST 105138034396 JORDAN MAPLEWOOD", -400],
  ])("%s", (description, amount) => {
    const result = read(description, amount);
    expect(result.kind).toBe("own_transfer");
    expect(result.isTransfer).toBe(true);
  });

  it("still treats someone else as a person", () => {
    const result = read("Internet Banking E-TRANSFER 104902637720 Sam Rivers", -60);
    expect(result).toMatchObject({ kind: "etransfer_out", categoryName: "Payments to people", merchant: "e-Transfer to Sam Rivers" });
    expect(isOwnName("SAM RIVERS", OWNER)).toBe(false);
  });

  it("reads a one-time contact's memo as the party", () => {
    expect(read("Internet Banking E-TRANSFER 105693006869 One-time contact Pixel 9", -300).merchant).toBe(
      "e-Transfer to Pixel 9",
    );
  });
});

describe("rules learned from channel words are ignored", () => {
  it("does not let an 'INTERNET BANKING' rule claim every web transaction", () => {
    const rules: FinanceCategoryRule[] = [
      { id: "r", pattern: "INTERNET BANKING", category_id: idOf("Transfer"), kind: "transfer" },
    ];
    const result = read("Internet Banking FULFILL REQUEST 105461545630 Remitly", -300, { rules });
    expect(result.categoryName).toBe("Family support");
  });
});

describe("buildTidyProposals", () => {
  const accounts = [
    { id: "chq", name: "CIBC Chequing", currency: "CAD", kind: "chequing" },
    { id: "rbc", name: "RBC Chequing", currency: "CAD", kind: "chequing" },
  ] as FinanceAccount[];

  const txn = (overrides: Partial<Transaction>): Transaction => ({
    id: "t",
    date: "2025-03-01",
    description: "x",
    amount: 10,
    type: "expense",
    account_id: "chq",
    import_hash: "h",
    ...overrides,
  });

  const ledger: Transaction[] = [
    // Uncategorised, and named after the channel.
    txn({ id: "shell", description: "Shell Richmond", raw_description: "SHELL C21987 RICHMOND HILL, ON", amount: 50 }),
    txn({ id: "intact", description: "Electronic Funds", raw_description: "Electronic Funds Transfer PREAUTHORIZED DEBIT INTACT INSURANCE COMPANY", amount: 150 }),
    // Counted as spending, but it went to the owner's other bank.
    txn({
      id: "self-out",
      description: "e-Transfer to Jordan Maplewood",
      raw_description: "Internet Banking E-TRANSFER 104910986948 JORDAN MAPLEWOOD",
      amount: 400,
      category_id: idOf("Payments to people"),
    }),
    txn({
      id: "self-in",
      account_id: "rbc",
      type: "earning",
      date: "2025-03-02",
      description: "e-Transfer from Jordan Quinn Maplewood Cauwbgtm",
      raw_description: "E-TRANSFER RECEIVED JORDAN QUINN MAPLEWOOD CAUWBGTM",
      amount: 400,
      category_id: idOf("Money received"),
    }),
    // Categorised wrongly by the old classifier: only with the recheck.
    txn({ id: "presto", description: "Presto Goog", raw_description: "PRESTO GOOG/5F7FDJ9FX9 TORONTO, ON", amount: 3.3, category_id: idOf("Dining out") }),
    // Entered by hand: never touched.
    txn({ id: "manual", description: "Lunch", import_hash: null, raw_description: null }),
  ];

  const tidy = (includeCategorised = false) =>
    buildTidyProposals({ transactions: ledger, accounts, categories, rules: [], ownerNames: OWNER, includeCategorised });

  it("categorises what was blank and renames what was named after the channel", () => {
    const { proposals } = tidy();
    const intact = proposals.find((p) => p.id === "intact")!;
    expect(intact.after).toMatchObject({ description: "Intact Insurance", categoryId: idOf("Insurance") });
    expect(intact.reasons).toEqual(["category", "name"]);
    expect(proposals.find((p) => p.id === "shell")!.after.categoryId).toBe(idOf("Transport"));
  });

  it("turns an e-Transfer to yourself into a paired transfer", () => {
    const { proposals } = tidy();
    const out = proposals.find((p) => p.id === "self-out")!;
    const back = proposals.find((p) => p.id === "self-in")!;
    expect(out.after.categoryId).toBe(idOf("Transfer"));
    expect(back.after.categoryId).toBe(idOf("Transfer"));
    expect([out.pairWith, back.pairWith]).toContain(out.pairWith ? "self-in" : "self-out");
  });

  it("leaves categorised rows alone unless asked to recheck them", () => {
    expect(tidy().proposals.find((p) => p.id === "presto")).toBeUndefined();
    expect(tidy().recheckable).toBe(1);
    expect(tidy(true).proposals.find((p) => p.id === "presto")!.after.categoryId).toBe(idOf("Transport"));
  });

  it("never touches a row entered by hand", () => {
    expect(tidy(true).proposals.find((p) => p.id === "manual")).toBeUndefined();
  });

  it("names suggested categories that do not exist yet", () => {
    const without = categories.filter((c) => c.name !== "Transport");
    const result = buildTidyProposals({
      transactions: ledger,
      accounts,
      categories: without,
      rules: [],
      ownerNames: OWNER,
      includeCategorised: true,
    });
    expect(result.missing).toEqual([{ name: "Transport", count: 2 }]);
  });
});
