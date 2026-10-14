import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { Alert } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupNotice what="The admin area" />;
  await requireAdmin(); // 404 for anyone whose profiles.role is not 'admin' (checked in the database)
  return (
    <div>
      <Alert tone="info" className="mb-4">Moderation tools. Every action here is re-authorized by the database and written to the activity log.</Alert>
      <AdminNav />
      {children}
    </div>
  );
}
