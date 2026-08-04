import type { InventoryItem } from "@/types";

/**
 * Money helpers for inventory rows.
 *
 * `purchase_price` and `current_value` are both nullable columns, and the
 * grid, the table, and the page totals each used to reach for them directly —
 * so a row missing a price crashed on `.toLocaleString()`, and a row worth
 * exactly 0 fell through `||` and displayed its original price instead.
 * Centralising the fallbacks keeps those two rules in one place.
 */

/** What the item cost, or 0 when it was never recorded. */
export function purchasePrice(item: InventoryItem): number {
  return item.purchase_price ?? 0;
}

/**
 * What the item is worth now: the appraised value when there is one, otherwise
 * the purchase price. `??` matters — an item appraised at 0 is worth 0, not
 * whatever it originally cost.
 */
export function currentValue(item: InventoryItem): number {
  return item.current_value ?? purchasePrice(item);
}

/**
 * Percentage lost against the purchase price, or null when depreciation is not
 * meaningful — nothing was paid (which would divide by zero), or the item has
 * held or gained value.
 */
export function depreciationPercent(item: InventoryItem): number | null {
  const paid = purchasePrice(item);
  if (paid <= 0) return null;
  const now = currentValue(item);
  if (now >= paid) return null;
  return Math.round(((paid - now) / paid) * 100);
}

/** Formatted for display, without a currency symbol. */
export function formatValue(value: number): string {
  return value.toLocaleString();
}
