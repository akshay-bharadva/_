"use client";

import DashboardOverview from "@/components/admin/DashboardOverview";
import LoadingSpinner from "@/components/admin/LoadingSpinner";
import { withAdminPage } from "@/components/admin/withAdminPage";
import { useGetDashboardDataQuery } from "@/store/api/adminApi";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";

function AdminDashboardContent() {
  const router = useRouter();

  // withAdminPage only renders this after auth resolves, so no `skip` needed.
  const { data: dashboardData, isLoading: isDataLoading } =
    useGetDashboardDataQuery();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's your portfolio's command center."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" /> Quick Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push("/admin/blog")}>
                New Blog Post
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/admin/tasks")}>
                New Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/admin/notes")}>
                New Note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/admin/finance")}>
                New Transaction
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {isDataLoading || !dashboardData ? (
        <LoadingSpinner />
      ) : (
        <DashboardOverview
          dashboardData={dashboardData}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

const Wrapped = withAdminPage(AdminDashboardContent, { title: "Dashboard" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}
