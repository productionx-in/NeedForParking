import { getOptionalClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";

export type ReportRow = {
  id: string;
  listing_id: string;
  reason: string;
  details: string;
  status: "open" | "actioned" | "dismissed";
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  listing: {
    id: string; title: string; status: string; moderation_status: "ok" | "suspended"; locality: string | null; owner_id: string; is_demo: boolean;
  } | null;
};

export async function listReports(status: "open" | "closed" | "all"): Promise<ReportRow[]> {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  let q = supabase
    .from("reports")
    .select("id, listing_id, reason, details, status, resolution_note, created_at, resolved_at, listing:parking_listings(id, title, status, moderation_status, locality, owner_id, is_demo)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "open") q = q.eq("status", "open");
  if (status === "closed") q = q.neq("status", "open");
  const { data } = await q;
  return (data ?? []) as unknown as ReportRow[];
}

export async function listAccounts(search: string): Promise<ProfileRow[]> {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  let q = supabase
    .from("profiles")
    .select("id, display_name, email, role, account_status, suspension_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const s = search.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (s) q = q.ilike("display_name", `%${s}%`);
  const { data } = await q;
  return (data ?? []) as ProfileRow[];
}

export async function listAudit() {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("admin_audit_log")
    .select("id, action, target_type, target_id, note, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as { id: string; action: string; target_type: string; target_id: string; note: string | null; created_at: string }[];
}
