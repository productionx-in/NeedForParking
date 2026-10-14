"use server";

import { revalidatePath } from "next/cache";
import { fail, withUser } from "@/lib/actions";
import { friendlyDbError } from "@/lib/errors";
import { accountStatusSchema, moderationSchema, resolveReportSchema } from "@/lib/validation/misc";
import type { ActionResult } from "@/lib/types";

/**
 * Each admin action only forwards to a SECURITY DEFINER database function that re-checks
 * is_admin() from the authenticated JWT. There is no client-side or app-side admin flag to forge.
 */
async function adminRpc(fn: string, args: Record<string, unknown>, okMessage: string): Promise<ActionResult> {
  return withUser(async ({ supabase }) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) {
      if (error.message === "forbidden") return fail("Admin access required.");
      return fail(friendlyDbError(error));
    }
    revalidatePath("/admin", "layout");
    revalidatePath("/search");
    return { ok: true, message: okMessage };
  });
}

export async function setListingModerationAction(input: unknown): Promise<ActionResult> {
  const p = moderationSchema.safeParse(input);
  if (!p.success) return fail("Invalid request.");
  return adminRpc("admin_set_listing_moderation", { p_listing_id: p.data.id, p_status: p.data.status, p_note: p.data.note || null },
    p.data.status === "suspended" ? "Listing suspended and hidden from the public." : "Listing restored.");
}

export async function setAccountStatusAction(input: unknown): Promise<ActionResult> {
  const p = accountStatusSchema.safeParse(input);
  if (!p.success) return fail("Invalid request.");
  return adminRpc("admin_set_account_status", { p_user_id: p.data.userId, p_status: p.data.status, p_reason: p.data.reason || null },
    p.data.status === "suspended" ? "Account suspended. Their listings are hidden." : "Account reactivated.");
}

export async function resolveReportAction(input: unknown): Promise<ActionResult> {
  const p = resolveReportSchema.safeParse(input);
  if (!p.success) return fail("Invalid request.");
  return adminRpc("admin_resolve_report", { p_report_id: p.data.reportId, p_status: p.data.status, p_note: p.data.note || null }, "Report updated.");
}
