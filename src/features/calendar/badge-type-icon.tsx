"use client";

import {
  Banknote,
  Briefcase,
  Calendar as CalendarIcon,
  CheckSquare,
  ListTodo,
  TrendingUp,
} from "lucide-react";

export interface BadgeTypeIconProps {
  type: string;
}

export function BadgeTypeIcon({ type }: BadgeTypeIconProps) {
  switch (type) {
    case "event":
      return <Briefcase className="size-3" />;
    case "task":
      return <ListTodo className="size-3" />;
    case "transaction":
    case "transaction_summary":
      return <Banknote className="size-3" />;
    case "forecast":
      return <TrendingUp className="size-3" />;
    case "habit":
    case "habit_summary":
      return <CheckSquare className="size-3" />;
    default:
      return <CalendarIcon className="size-3" />;
  }
}
