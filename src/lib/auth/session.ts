import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getOptionalClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";

export type SessionUser = {
  id: string;
  phone: string | null;
  phoneVerified: boolean;
};

/**
 * The authenticated user, verified with the Supabase Auth server (getUser) rather than trusting the
 * cookie contents. Returns null for visitors or when the backend isn't configured.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await getOptionalClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  return { id: u.id, phone: u.phone ?? null, phoneVerified: Boolean(u.phone_confirmed_at && u.phone) };
});

export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export const getProfile = cache(async (userId: string): Promise<ProfileRow | null> => {
  const supabase = await getOptionalClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, email, role, account_status, suspension_reason, created_at")
    .eq("id", userId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
});

/**
 * Admin gate for pages. Role is read from the database (profiles.role) under the caller's own RLS context —
 * never from a client-supplied flag or JWT user_metadata. Non-admins get a 404 so the area isn't advertised.
 * Every admin mutation is additionally re-checked inside the database (admin_* functions).
 */
export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) notFound();
  return user;
}
