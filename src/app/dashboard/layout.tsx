import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupNotice what="The dashboard" />;
  await requireUser("/dashboard");
  return (
    <div className="grid gap-6 sm:grid-cols-[14rem_minmax(0,1fr)]">
      <aside><DashboardNav /></aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
