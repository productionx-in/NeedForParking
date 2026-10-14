import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { isSupabaseConfigured, SETUP_MESSAGE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types";

export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors });

/** Common preamble for mutating server actions: backend configured + verified signed-in user. */
export async function withUser<T>(
  fn: (ctx: { user: SessionUser; supabase: Awaited<ReturnType<typeof createClient>> }) => Promise<ActionResult<T>>,
  opts: { requireVerifiedPhone?: boolean } = {},
): Promise<ActionResult<T>> {
  if (!isSupabaseConfigured()) return fail(SETUP_MESSAGE);
  const user = await getSessionUser();
  if (!user) return fail("Please sign in to continue.");
  if (opts.requireVerifiedPhone && !user.phoneVerified) return fail("Verify your mobile number by signing in with an SMS code first.");
  const supabase = await createClient();
  try {
    return await fn({ user, supabase });
  } catch (e) {
    console.error("[action] unexpected error", e instanceof Error ? e.message : "unknown");
    return fail("Something went wrong. Please try again.");
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "unknown";
}

/** Stable, non-reversible key so phone numbers aren't kept in memory or logs in the clear. */
export const hashKey = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 32);
