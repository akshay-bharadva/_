import type { Metadata } from "next";
import { UpdatesPage } from "@/features/updates/updates-page";

export const metadata: Metadata = {
  title: "Updates",
  description:
    "Milestones, experiments, and current activity — a living feed of what I'm working on.",
};

export default function Page() {
  return <UpdatesPage />;
}
