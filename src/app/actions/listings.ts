"use server";

import { revalidatePath } from "next/cache";
import { fail, withUser } from "@/lib/actions";
import { friendlyDbError } from "@/lib/errors";
import {
  listingFormShapeSchema, toFormValues, toPayload, validateDraft, validateListing,
  type ListingFormValues,
} from "@/lib/validation/listing";
import { MAX_PHOTOS } from "@/lib/domain/constants";
import { buildPhotoPath, validatePhotoFile } from "@/lib/validation/misc";
import type { ActionResult, ListingRow, PrivateDetailsRow } from "@/lib/types";
import { z } from "zod";

const idSchema = z.uuid();

function revalidateListing(id: string) {
  revalidatePath("/dashboard/listings");
  revalidatePath(`/listings/${id}`);
  revalidatePath("/search");
  revalidatePath("/");
}

/** Creates or updates a draft (or edits a live listing). Public coordinates are computed by the database. */
export async function saveListingAction(input: { id: string | null; values: unknown }): Promise<ActionResult<{ id: string }>> {
  return withUser<{ id: string }>(async ({ user, supabase }) => {
    const shape = listingFormShapeSchema.safeParse(input.values);
    if (!shape.success) return fail("Invalid form data.");
    const values = shape.data as unknown as ListingFormValues;
    const errors = validateDraft(values);
    if (Object.keys(errors).length > 0) return fail("Please fix the highlighted fields.", errors);
    const payload = toPayload(values);

    let id = input.id;
    if (id !== null && !idSchema.safeParse(id).success) return fail("Invalid listing.");

    if (id) {
      const { data, error } = await supabase.from("parking_listings").update(payload.listing).eq("id", id).eq("owner_id", user.id).select("id");
      if (error) return fail(friendlyDbError(error));
      if (!data?.length) return fail("Listing not found, or you don't have permission to edit it.");
    } else {
      const { data, error } = await supabase
        .from("parking_listings")
        .insert({ owner_id: user.id, status: "draft", ...payload.listing })
        .select("id")
        .single();
      if (error || !data) return fail(friendlyDbError(error, "Couldn't create the draft."));
      id = data.id as string;
    }

    // Private details (exact address, exact pin, access instructions): update, else insert.
    const { data: updated, error: updErr } = await supabase
      .from("listing_private_details")
      .update(payload.details)
      .eq("listing_id", id)
      .select("listing_id");
    if (updErr) return fail(friendlyDbError(updErr));
    if (!updated?.length) {
      const { error: insErr } = await supabase.from("listing_private_details").insert({ listing_id: id, ...payload.details });
      if (insErr) return fail(friendlyDbError(insErr));
    }

    revalidateListing(id);
    return { ok: true, data: { id }, message: "Saved." };
  }, { requireVerifiedPhone: true });
}

/** Full server-side validation, then the status change (the database re-validates via trigger). */
async function publish(id: string): Promise<ActionResult> {
  return withUser(async ({ user, supabase }) => {
    if (!idSchema.safeParse(id).success) return fail("Invalid listing.");
    const [{ data: listing }, { data: details }, { count }] = await Promise.all([
      supabase.from("parking_listings").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
      supabase.from("listing_private_details").select("*").eq("listing_id", id).maybeSingle(),
      supabase.from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", id),
    ]);
    if (!listing) return fail("Listing not found.");
    const row = listing as ListingRow;
    if (row.status === "removed") return fail("Removed listings can't be published.");
    if (row.moderation_status === "suspended") return fail("This listing was suspended by a moderator and can't be published.");

    const errors = validateListing(toFormValues(row, (details as PrivateDetailsRow | null) ?? null));
    const missing = Object.keys(errors);
    if (!row.is_demo && (count ?? 0) === 0) missing.push("photos");
    if (missing.length > 0) {
      return fail(`Complete these before publishing: ${missing.join(", ")}.`, { ...errors, ...((count ?? 0) === 0 && !row.is_demo ? { photos: "Add at least one photo" } : {}) });
    }
    const { error } = await supabase.from("parking_listings").update({ status: "published" }).eq("id", id).eq("owner_id", user.id);
    if (error) return fail(friendlyDbError(error));
    revalidateListing(id);
    return { ok: true, message: "Listing published." };
  }, { requireVerifiedPhone: true });
}

export async function publishListingAction(id: string): Promise<ActionResult> {
  return publish(id);
}

export async function setListingStatusAction(id: string, status: "paused" | "published" | "removed"): Promise<ActionResult> {
  if (status === "published") return publish(id);
  return withUser(async ({ user, supabase }) => {
    if (!idSchema.safeParse(id).success || !["paused", "removed"].includes(status)) return fail("Invalid request.");
    const { data, error } = await supabase.from("parking_listings").update({ status }).eq("id", id).eq("owner_id", user.id).select("id");
    if (error) return fail(friendlyDbError(error));
    if (!data?.length) return fail("Listing not found, or you don't have permission to change it.");
    revalidateListing(id);
    return { ok: true, message: status === "paused" ? "Listing paused. It is hidden from search." : "Listing deleted." };
  });
}

/** Records an uploaded storage object as a listing photo (the browser uploads straight to Storage under the user's JWT). */
export async function registerPhotoAction(input: { listingId: string; path: string }): Promise<ActionResult<{ id: string }>> {
  return withUser<{ id: string }>(async ({ user, supabase }) => {
    const parsed = z.object({ listingId: z.uuid(), path: z.string().min(10).max(300) }).safeParse(input);
    if (!parsed.success) return fail("Invalid photo.");
    const { listingId, path } = parsed.data;
    const prefix = `${user.id}/${listingId}/`;
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) return fail("Invalid photo path.");

    const { count } = await supabase.from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
    if ((count ?? 0) >= MAX_PHOTOS) {
      await supabase.storage.from("listing-photos").remove([path]);
      return fail(`A listing can have at most ${MAX_PHOTOS} photos.`);
    }
    const { data, error } = await supabase.from("listing_photos").insert({ listing_id: listingId, storage_path: path }).select("id").single();
    if (error || !data) {
      await supabase.storage.from("listing-photos").remove([path]); // don't leave orphaned files
      return fail(friendlyDbError(error, "Couldn't save the photo."));
    }
    revalidateListing(listingId);
    return { ok: true, data: { id: data.id as string } };
  }, { requireVerifiedPhone: true });
}

export async function deletePhotoAction(photoId: string): Promise<ActionResult> {
  return withUser(async ({ supabase }) => {
    if (!idSchema.safeParse(photoId).success) return fail("Invalid photo.");
    const { data: photo } = await supabase.from("listing_photos").select("id, listing_id, storage_path").eq("id", photoId).maybeSingle();
    if (!photo) return fail("Photo not found.");
    const { error } = await supabase.from("listing_photos").delete().eq("id", photoId);
    if (error) return fail(friendlyDbError(error));
    await supabase.storage.from("listing-photos").remove([photo.storage_path as string]);
    revalidateListing(photo.listing_id as string);
    return { ok: true, message: "Photo removed." };
  });
}

/** Pre-flight for uploads: validates type/size/count and returns the exact storage path to use. */
export async function prepareUploadAction(input: { listingId: string; type: string; size: number; existingCount: number }): Promise<ActionResult<{ path: string }>> {
  return withUser<{ path: string }>(async ({ user }) => {
    if (!idSchema.safeParse(input.listingId).success) return fail("Invalid listing.");
    const problem = validatePhotoFile({ type: input.type, size: input.size }, input.existingCount);
    if (problem) return fail(problem);
    const path = buildPhotoPath(user.id, input.listingId, input.type);
    return path ? { ok: true, data: { path } } : fail("Unsupported image type.");
  }, { requireVerifiedPhone: true });
}
