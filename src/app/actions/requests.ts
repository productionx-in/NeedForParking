"use server";

import { revalidatePath } from "next/cache";
import { fail, withUser } from "@/lib/actions";
import { fieldErrorsFromZod, friendlyDbError } from "@/lib/errors";
import { createRequestFormSchema, requestToRow } from "@/lib/validation/request";
import { respondSchema } from "@/lib/validation/misc";
import type { ActionResult } from "@/lib/types";
import { z } from "zod";

/** Creates a booking request. Listing status, ownership, dates, availability and overlaps are all re-validated by the database. */
export async function createRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withUser<{ id: string }>(async ({ user, supabase }) => {
    const parsed = createRequestFormSchema().safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const row = requestToRow(parsed.data as Parameters<typeof requestToRow>[0]);
    const { data, error } = await supabase
      .from("booking_requests")
      .insert({ ...row, requester_id: user.id, status: "pending" })
      .select("id")
      .single();
    if (error || !data) return fail(friendlyDbError(error, "Couldn't send your request."));
    revalidatePath("/dashboard/requests/mine");
    return { ok: true, data: { id: data.id as string }, message: "Request sent. The owner will review it." };
  }, { requireVerifiedPhone: true });
}

export async function respondToRequestAction(input: unknown): Promise<ActionResult> {
  return withUser(async ({ supabase }) => {
    const parsed = respondSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid response.");
    const { requestId, decision, response } = parsed.data;
    const { data, error } = await supabase
      .from("booking_requests")
      .update({ status: decision, owner_response: response || null })
      .eq("id", requestId)
      .select("id");
    if (error) return fail(friendlyDbError(error));
    if (!data?.length) return fail("Request not found, or you don't have permission to respond.");
    revalidatePath("/dashboard/requests/incoming");
    return { ok: true, message: decision === "accepted" ? "Request accepted. The requester can now see your access details." : "Request declined." };
  });
}

async function changeStatus(id: string, status: "cancelled" | "completed", okMessage: string): Promise<ActionResult> {
  return withUser(async ({ supabase }) => {
    if (!z.uuid().safeParse(id).success) return fail("Invalid request.");
    const { data, error } = await supabase.from("booking_requests").update({ status }).eq("id", id).select("id");
    if (error) return fail(friendlyDbError(error));
    if (!data?.length) return fail("Request not found, or you don't have permission to change it.");
    revalidatePath("/dashboard/requests/mine");
    revalidatePath("/dashboard/requests/incoming");
    return { ok: true, message: okMessage };
  });
}

export async function cancelRequestAction(id: string): Promise<ActionResult> {
  return changeStatus(id, "cancelled", "Request cancelled.");
}

export async function completeRequestAction(id: string): Promise<ActionResult> {
  return changeStatus(id, "completed", "Marked as completed.");
}
