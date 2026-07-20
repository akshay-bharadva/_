"use client";

import { useRouter } from "next/navigation";
import DashboardOverview from "@/components/admin/DashboardOverview";
import LoadingSpinner from "@/components/admin/LoadingSpinner";
import { useGetDashboardDataQuery } from "@/store/api/adminApi";
import { PageHeader } from "@/components/admin/shared";

export default function Page() {
  const router = useRouter();
  // The (protected) layout guards this route, so data can load immediately.
  const { data: dashboardData, isLoading } = useGetDashboardDataQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your portfolio's command center."
      />
      {isLoading || !dashboardData ? (
        <LoadingSpinner />
      ) : (
        <DashboardOverview
          dashboardData={dashboardData}
          onNavigate={(path) => router.push(path)}
        />
      )}
    </div>
  );
}
