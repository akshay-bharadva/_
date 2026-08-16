"use client";

import {
  ArrowRightLeft,
  Home,
  LayoutDashboard,
  Menu,
  Plus,
  Repeat,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const BottomNavButton = ({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex h-full w-full flex-col items-center justify-center gap-1 transition-colors",
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
    )}
  >
    <Icon className="size-5" />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export function MobileBottomNav({
  activeTab,
  onTabChange,
  onAddNew,
  onMore,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAddNew: () => void;
  onMore: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 grid h-16 grid-cols-5 items-center border-t bg-background/95 px-1 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] backdrop-blur md:hidden">
      <BottomNavButton
        icon={Home}
        label="Home"
        isActive={activeTab === "dashboard"}
        onClick={() => onTabChange("dashboard")}
      />
      <BottomNavButton
        icon={ArrowRightLeft}
        label="Trans."
        isActive={activeTab === "transactions"}
        onClick={() => onTabChange("transactions")}
      />
      <div className="relative -top-5 flex justify-center">
        <Button
          className="h-14 w-14 rounded-full border-4 border-background bg-primary shadow-e3 hover:bg-primary/90"
          onClick={onAddNew}
        >
          <Plus className="size-6 text-primary-foreground" />
        </Button>
      </div>
      <BottomNavButton
        icon={Repeat}
        label="Recurring"
        isActive={activeTab === "recurring"}
        onClick={() => onTabChange("recurring")}
      />
      <BottomNavButton
        icon={Menu}
        label="More"
        isActive={activeTab === "goals" || activeTab === "analytics"}
        onClick={onMore}
      />
    </div>
  );
}

export function AddNewDrawer({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: "transaction" | "recurring" | "goal") => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add New</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-2 p-4 pb-8">
          <Button
            variant="outline"
            className="h-12 w-full justify-start text-base"
            onClick={() => onSelect("transaction")}
          >
            <ArrowRightLeft className="mr-3 size-5 text-primary" /> Transaction
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full justify-start text-base"
            onClick={() => onSelect("recurring")}
          >
            <Repeat className="mr-3 size-5 text-chart-1" /> Recurring Rule
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full justify-start text-base"
            onClick={() => onSelect("goal")}
          >
            <Target className="mr-3 size-5 text-chart-3" /> Goal
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function MoreDrawer({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>More</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-2 p-4 pb-8">
          <Button
            variant={activeTab === "goals" ? "secondary" : "ghost"}
            className="h-12 w-full justify-start"
            onClick={() => onTabChange("goals")}
          >
            <Target className="mr-3 size-5" /> Goals
          </Button>
          <Button
            variant={activeTab === "analytics" ? "secondary" : "ghost"}
            className="h-12 w-full justify-start"
            onClick={() => onTabChange("analytics")}
          >
            <LayoutDashboard className="mr-3 size-5" /> Analytics
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
