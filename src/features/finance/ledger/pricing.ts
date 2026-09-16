import { convertAt, type Money } from "../money/minor-units";
import { rateFrom, type RateTable } from "../money/rates";

/**
 * Freezing the exchange rate onto a posting, at the moment it is written.
 *
 * `fin_posting.fx_rate` and `base_amount_minor` are what stop a historical
 * figure re-pricing itself every time the market moves. A report over last
 * February should say what last February cost, not what those rupees would be
 * worth this morning — so the rate is captured once, here, and every total
 * downstream reads the frozen figure.
 *
 * The case worth stating, because getting it wrong is silent and expensive: a
 * posting **already in the base currency still gets `base_amount_minor`**, set to
 * its own amount. Leaving it null would be defensible-looking — there is nothing
 * to convert — but `flows.ts` counts a null as `unpriced` and excludes it, so
 * every ordinary domestic transaction would vanish from every total while the
 * foreign ones remained. The reports would be wrong by most of the ledger and
 * would still look plausible.
 *
 * When no rate exists for the currency, both come back null. That is the honest
 * state: the row is recorded, and every total that touches it reports itself as
 * short by a named amount rather than counting it at parity.
 */

export interface BasePricing {
  /** Units of base per one unit of the posting's currency, or null. */
  fx_rate: number | null;
  /** The amount in base minor units, or null when it could not be priced. */
  base_amount_minor: number | null;
}

export function priceInBase(
  amount: Money,
  rates: RateTable,
  base: string,
): BasePricing {
  // Already base: nothing to convert, but it is very much priced.
  if (amount.currency === base) {
    return { fx_rate: 1, base_amount_minor: amount.minor };
  }

  const rate = rateFrom(rates, base, amount.currency, base);
  if (rate === null) return { fx_rate: null, base_amount_minor: null };

  // Through `convertAt`, which scales by the difference in exponents. A yen
  // posting and a dinar posting do not become base units by multiplication.
  return {
    fx_rate: rate,
    base_amount_minor: convertAt(amount, base, rate).minor,
  };
}
