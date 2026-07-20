"use client";

import dynamic from "next/dynamic";
import LoadingSpinner from "@/components/admin/LoadingSpinner";
import { useRouter } from "next/navigation";

// FullCalendar (5 plugins) is the heaviest admin dependency — split it out
// of the page chunk and load it after the layout paints.
const CommandCalendar = dynamic(
  () => import("@/components/admin/CommandCalendar"),
  { ssr: false, loading: () => <LoadingSpinner /> },
);

export default function Page() {
  const router = useRouter();
  return <CommandCalendar onNavigate={(tab) => router.push(`/admin/${tab}`)} />;
}
