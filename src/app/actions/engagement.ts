"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, withUser } from "@/lib/actions";
import { fieldErrorsFromZod, friendlyDbError } from "@/lib/errors";
import { reportSchema } from "@/lib/validation/misc";
import type { ActionResult } from "@/lib/types";

export async function toggleFavoriteAction(listingId: string, makeFavorite: boolean): Promise<ActionResult<{ favorite: boolean }>> {
  return withUser<{ favorite: boolean }>(async ({ user, supabase }) => {
    if (!z.uuid().safeParse(listingId).success) return fail("Invalid listing.");
    if (makeFavorite) {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, listing_id: listingId });
      if (error && error.code !== "23505") return fail(friendlyDbError(error, "Couldn't save this favorite."));
    } else {
      const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("listing_id", listingId);
      if (error) return fail(friendlyDbError(error));
    }
    revalidatePath("/dashboard/favorites");
    return { ok: true, data: { favorite: makeFavorite } };
  });
}

export async function reportListingAction(input: unknown): Promise<ActionResult> {
  return withUser(async ({ user, supabase }) => {
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const { error } = await supabase
      .from("reports")
      .insert({ listing_id: parsed.data.listingId, reporter_id: user.id, reason: parsed.data.reason, details: parsed.data.details });
    if (error) {
      if (error.code === "23505") return { ok: true, message: "You've already reported this listing. Our team will review it." };
      return fail(friendlyDbError(error, "Couldn't send your report."));
    }
    return { ok: true, message: "Thanks — your report was sent to our moderators." };
  }, { requireVerifiedPhone: true });
}
