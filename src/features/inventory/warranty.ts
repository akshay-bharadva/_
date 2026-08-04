import { addMonths, isAfter } from "date-fns";
import { AlertCircle, CheckCircle2, X, type LucideIcon } from "lucide-react";
import { parseLocalDate } from "@/lib/utils";

export interface WarrantyStatus {
  label: string;
  color: string;
  bg: string;
  icon: LucideIcon;
}

export function getWarrantyStatus(expiryDate?: string | null): WarrantyStatus {
  if (!expiryDate)
    return {
      label: "No Warranty",
      color: "text-muted-foreground",
      bg: "bg-secondary",
      icon: X,
    };
  const expiry = parseLocalDate(expiryDate);
  const now = new Date();
  const warningZone = addMonths(now, 1);

  if (isAfter(now, expiry)) {
    return {
      label: "Expired",
      color: "text-destructive",
      bg: "bg-destructive/10",
      icon: AlertCircle,
    };
  }
  if (isAfter(warningZone, expiry)) {
    return {
      label: "Expiring Soon",
      color: "text-chart-3",
      bg: "bg-chart-3/10",
      icon: AlertCircle,
    };
  }
  return {
    label: "Active",
    color: "text-chart-2",
    bg: "bg-chart-2/10",
    icon: CheckCircle2,
  };
}
