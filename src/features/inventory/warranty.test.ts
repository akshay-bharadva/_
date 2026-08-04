import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { getWarrantyStatus } from "./warranty";

// getWarrantyStatus reads `new Date()`, so pin "now" to a fixed local noon —
// noon keeps the fixture dates on the same calendar day in every timezone.
const NOW = new Date(2026, 5, 15, 12, 0, 0); // Jun 15 2026

describe("getWarrantyStatus", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("reports no warranty when the expiry date is missing", () => {
    for (const empty of [undefined, null, ""]) {
      const status = getWarrantyStatus(empty);
      expect(status.label).toBe("No Warranty");
      expect(status.icon).toBe(X);
      expect(status.color).toBe("text-muted-foreground");
      expect(status.bg).toBe("bg-secondary");
    }
  });

  it("reports expired for a date in the past", () => {
    const status = getWarrantyStatus("2026-06-14");
    expect(status.label).toBe("Expired");
    expect(status.icon).toBe(AlertCircle);
    expect(status.color).toBe("text-destructive");
    expect(status.bg).toBe("bg-destructive/10");
  });

  it("reports expiring soon inside the one-month warning zone", () => {
    const status = getWarrantyStatus("2026-07-01");
    expect(status.label).toBe("Expiring Soon");
    expect(status.icon).toBe(AlertCircle);
    expect(status.color).toBe("text-chart-3");
    expect(status.bg).toBe("bg-chart-3/10");
  });

  it("reports active beyond the warning zone", () => {
    const status = getWarrantyStatus("2026-12-31");
    expect(status.label).toBe("Active");
    expect(status.icon).toBe(CheckCircle2);
    expect(status.color).toBe("text-chart-2");
    expect(status.bg).toBe("bg-chart-2/10");
  });

  it("treats the warning-zone edge as active", () => {
    // Midnight on Jul 16 is still after `addMonths(now, 1)` (Jul 15 noon).
    expect(getWarrantyStatus("2026-07-16").label).toBe("Active");
    expect(getWarrantyStatus("2026-07-15").label).toBe("Expiring Soon");
  });

  it("parses YYYY-MM-DD as a local date, not UTC midnight", () => {
    // Today's own date must never read as expired, whatever the timezone.
    expect(getWarrantyStatus("2026-06-16").label).toBe("Expiring Soon");
  });
});
