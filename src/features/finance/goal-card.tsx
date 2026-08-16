"use client";

// Financial goal card with animated progress fill

import { motion } from "framer-motion";
import { MoreHorizontal, Plus } from "lucide-react";
import { goalProgressPercent } from "@/lib/finance-utils";
import type { FinancialGoal } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface GoalCardProps {
  goal: FinancialGoal;
  onAddFunds: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GoalCard({
  goal,
  onAddFunds,
  onEdit,
  onDelete,
}: GoalCardProps) {
  const percentage = goalProgressPercent(goal);

  return (
    <Card className="group relative flex h-[320px] flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* Animated progress fill from bottom */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 -z-0 bg-primary/10"
        initial={{ height: 0 }}
        animate={{ height: `${percentage}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      {/* Overlay to ensure text readability */}
      <div className="absolute inset-0 z-10 bg-background/70 transition-colors group-hover:bg-background/80" />

      {/* Content Layer */}
      <div className="relative z-20 flex h-full flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            {/* min-w-0: a flex child will not shrink below its content width,
                so `truncate` alone let a long goal name push the menu button
                off the card. */}
            <CardTitle className="min-w-0 flex-1 truncate leading-tight text-foreground drop-shadow-md">
              {goal.name}
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Goal actions"
                  className="h-8 w-8 hover:bg-background/50"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={onDelete}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="flex flex-grow flex-col justify-center py-4 text-center">
          <div>
            <p className="font-mono text-5xl font-black text-primary drop-shadow-sm">
              {percentage.toFixed(0)}
              <span className="text-2xl text-primary/70">%</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              ${goal.current_amount.toLocaleString()} / $
              {goal.target_amount.toLocaleString()}
            </p>
          </div>
        </CardContent>

        <CardFooter className="px-4 pb-4 pt-0">
          <Button size="sm" className="w-full shadow-e3" onClick={onAddFunds}>
            <Plus className="mr-2 size-4" /> Add Funds
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}
