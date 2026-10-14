import { getOptionalClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";

export async function listMyRequests(): Promise<RequestRow[]> {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  const { data } = await supabase.rpc("list_my_requests");
  return (data ?? []) as RequestRow[];
}

export async function listIncomingRequests(): Promise<RequestRow[]> {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  const { data } = await supabase.rpc("list_incoming_requests");
  return (data ?? []) as RequestRow[];
}

export type BookedAccess = { address_line: string | null; exact_latitude: number | null; exact_longitude: number | null; access_instructions: string | null };

/** Private address/access details — released by the database only for the requester's ACCEPTED requests. */
export async function getBookedAccess(requestId: string): Promise<BookedAccess | null> {
  const supabase = await getOptionalClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("get_booked_listing_access", { p_request_id: requestId });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as BookedAccess | undefined) ?? null;
}
