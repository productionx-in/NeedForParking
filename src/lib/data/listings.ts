import { getOptionalClient } from "@/lib/supabase/server";
import { toRpcArgs, type SearchFilters } from "@/lib/validation/search";
import type { ListingRow, PhotoRow, PrivateDetailsRow, SearchRow } from "@/lib/types";

export type SearchOutcome =
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | { status: "ok"; items: SearchRow[]; total: number; pageSize: number };

export async function searchListings(filters: SearchFilters, pageSize?: number): Promise<SearchOutcome> {
  const supabase = await getOptionalClient();
  if (!supabase) return { status: "unconfigured" };
  const args = toRpcArgs(filters, pageSize);
  const { data, error } = await supabase.rpc("search_listings", args);
  if (error) {
    console.error("[search] rpc failed", error.code);
    return { status: "error", message: "We couldn't load listings. Please try again in a moment." };
  }
  const items = (data ?? []) as SearchRow[];
  return { status: "ok", items, total: items.length ? Number(items[0]!.total_count) : 0, pageSize: args.p_limit };
}

export type ListingDetail = {
  listing: ListingRow;
  photos: PhotoRow[];
  owner: { display_name: string; member_since: string; phone_verified: boolean; published_count: number } | null;
};

/** Reads one listing under the caller's RLS: public if published, or the owner's/admin's own view. */
export async function getListingDetail(id: string): Promise<ListingDetail | null> {
  const supabase = await getOptionalClient();
  if (!supabase) return null;
  const { data: listing } = await supabase.from("parking_listings").select("*").eq("id", id).maybeSingle();
  if (!listing) return null;
  const [{ data: photos }, { data: owner }] = await Promise.all([
    supabase.from("listing_photos").select("id, listing_id, storage_path, position").eq("listing_id", id).order("position").order("created_at"),
    supabase.rpc("get_public_owner", { p_owner_id: (listing as ListingRow).owner_id }),
  ]);
  const ownerRow = Array.isArray(owner) ? owner[0] : owner;
  return {
    listing: listing as ListingRow,
    photos: (photos ?? []) as PhotoRow[],
    owner: ownerRow ? { ...ownerRow, published_count: Number(ownerRow.published_count) } : null,
  };
}

export async function getOwnerListingForEdit(id: string, ownerId: string) {
  const supabase = await getOptionalClient();
  if (!supabase) return null;
  const { data: listing } = await supabase.from("parking_listings").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (!listing) return null;
  const [{ data: details }, { data: photos }] = await Promise.all([
    supabase.from("listing_private_details").select("*").eq("listing_id", id).maybeSingle(),
    supabase.from("listing_photos").select("id, listing_id, storage_path, position").eq("listing_id", id).order("position").order("created_at"),
  ]);
  return {
    listing: listing as ListingRow,
    details: (details as PrivateDetailsRow | null) ?? null,
    photos: (photos ?? []) as PhotoRow[],
  };
}

export type MyListingSummary = ListingRow & { cover_photo_path: string | null; photo_count: number };

export async function getMyListings(ownerId: string): Promise<MyListingSummary[]> {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("parking_listings")
    .select("*, listing_photos(storage_path, position)")
    .eq("owner_id", ownerId)
    .neq("status", "removed")
    .order("updated_at", { ascending: false });
  return ((data ?? []) as (ListingRow & { listing_photos: { storage_path: string; position: number }[] })[]).map(({ listing_photos, ...l }) => {
    const sorted = [...listing_photos].sort((a, b) => a.position - b.position);
    return { ...l, cover_photo_path: sorted[0]?.storage_path ?? null, photo_count: sorted.length };
  });
}

export async function getFavoriteListings(userId: string): Promise<SearchRow[]> {
  const supabase = await getOptionalClient();
  if (!supabase) return [];
  const { data: favs } = await supabase.from("favorites").select("listing_id, created_at").eq("user_id", userId).order("created_at", { ascending: false });
  const ids = (favs ?? []).map((f) => f.listing_id as string);
  if (ids.length === 0) return [];
  // RLS hides listings that are no longer public, so unpublished favorites simply drop out.
  const { data } = await supabase
    .from("parking_listings")
    .select("*, listing_photos(storage_path, position)")
    .in("id", ids);
  const rows = (data ?? []) as (ListingRow & { listing_photos: { storage_path: string; position: number }[] })[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .filter((r) => r.status === "published" && r.moderation_status === "ok")
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r) => ({
      id: r.id, title: r.title, locality: r.locality, city: r.city, vehicle_types: r.vehicle_types, cover_type: r.cover_type,
      rental_type: r.rental_type, price_inr: r.price_inr, min_duration: r.min_duration, deposit_inr: r.deposit_inr,
      available_days: r.available_days, available_from: r.available_from, available_to: r.available_to,
      access_24h: r.access_24h, overnight_allowed: r.overnight_allowed, latitude: r.latitude, longitude: r.longitude,
      location_privacy: r.location_privacy, is_demo: r.is_demo, created_at: r.created_at,
      cover_photo_path: [...r.listing_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null,
      is_open_now: false, distance_km: null, total_count: rows.length,
    }));
}

export async function isFavorite(userId: string, listingId: string): Promise<boolean> {
  const supabase = await getOptionalClient();
  if (!supabase) return false;
  const { data } = await supabase.from("favorites").select("listing_id").eq("user_id", userId).eq("listing_id", listingId).maybeSingle();
  return Boolean(data);
}
