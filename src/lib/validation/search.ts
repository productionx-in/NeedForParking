import { VEHICLE_VALUES } from "@/lib/domain/constants";
import { REGION_BOUNDS } from "@/lib/domain/constants";
import { findLocality } from "@/lib/domain/localities";

export const PAGE_SIZE = 12;
export const MAP_PAGE_SIZE = 60;
/** Walking distance, in metres. People look for parking within a few hundred metres of where they're going. */
export const RADIUS_OPTIONS_M = [100, 200, 300, 500, 1000, 2000] as const;
export const DEFAULT_POINT_RADIUS_M = 200; // a precise destination (map click, GPS, coordinates)
export const DEFAULT_AREA_RADIUS_M = 1000; // a named area: locality centres are only accurate to ~1 km
export const SORTS = ["newest", "price_asc", "price_desc", "distance"] as const;
export type Sort = (typeof SORTS)[number];

export type SearchFilters = {
  q: string;
  near: string;
  lat: number | null;
  lng: number | null;
  /** The radius actually used (explicit, or the default for a point/area). */
  radiusM: number;
  /** The radius as given in the URL; null means "auto". */
  radiusParam: number | null;
  vehicle: string;
  rental: string;
  cover: string;
  minPrice: number | null;
  maxPrice: number | null;
  day: number | null;
  openNow: boolean;
  overnight: boolean;
  access24h: boolean;
  sort: Sort;
  view: "list" | "map";
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
const num = (v: string): number | null => {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const inEnum = <T extends string>(v: string, allowed: readonly T[]): T | "" => ((allowed as readonly string[]).includes(v) ? (v as T) : "");

/** Turns untrusted URL query params into a safe, fully-typed filter object. */
export function parseSearchParams(raw: Raw): SearchFilters {
  const lat = num(one(raw.lat));
  const lng = num(one(raw.lng));
  const validCoords =
    lat !== null && lng !== null &&
    lat >= REGION_BOUNDS.minLat - 0.5 && lat <= REGION_BOUNDS.maxLat + 0.5 &&
    lng >= REGION_BOUNDS.minLng - 0.5 && lng <= REGION_BOUNDS.maxLng + 0.5;
  const minPrice = num(one(raw.minPrice));
  const maxPrice = num(one(raw.maxPrice));
  const day = num(one(raw.day));
  const radius = num(one(raw.radius));
  const near = findLocality(one(raw.near))?.name ?? "";
  const radiusParam = radius !== null && radius >= 50 && radius <= 20_000 ? Math.round(radius) : null;
  const page = Math.floor(num(one(raw.page)) ?? 1);
  const sortRaw = inEnum(one(raw.sort), SORTS) || "newest";
  return {
    q: one(raw.q).slice(0, 80),
    near,
    lat: validCoords ? lat : null,
    lng: validCoords ? lng : null,
    radiusM: radiusParam ?? (validCoords ? DEFAULT_POINT_RADIUS_M : near ? DEFAULT_AREA_RADIUS_M : DEFAULT_POINT_RADIUS_M),
    radiusParam,
    vehicle: inEnum(one(raw.vehicle), VEHICLE_VALUES),
    rental: inEnum(one(raw.rental), ["hourly", "daily", "monthly"] as const),
    cover: inEnum(one(raw.cover), ["covered", "open"] as const),
    minPrice: minPrice !== null && minPrice >= 0 ? minPrice : null,
    maxPrice: maxPrice !== null && maxPrice >= 0 ? maxPrice : null,
    day: day !== null && Number.isInteger(day) && day >= 0 && day <= 6 ? day : null,
    openNow: one(raw.openNow) === "1",
    overnight: one(raw.overnight) === "1",
    access24h: one(raw.access24h) === "1",
    sort: sortRaw,
    view: one(raw.view) === "map" ? "map" : "list",
    page: page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Resolves the destination used for distance search: explicit coordinates win over a named area. */
export function resolveDestination(f: SearchFilters): { lat: number; lng: number; label: string } | null {
  if (f.lat !== null && f.lng !== null) return { lat: f.lat, lng: f.lng, label: f.near || "Selected point" };
  const loc = findLocality(f.near);
  return loc ? { lat: loc.lat, lng: loc.lng, label: loc.name } : null;
}

export function toRpcArgs(f: SearchFilters, pageSize = f.view === "map" ? MAP_PAGE_SIZE : PAGE_SIZE) {
  const dest = resolveDestination(f);
  const sort: Sort = f.sort === "distance" && !dest ? "newest" : f.sort;
  return {
    p_query: f.q || null,
    p_vehicle: f.vehicle || null,
    p_min_price: f.minPrice,
    p_max_price: f.maxPrice,
    p_rental_type: f.rental || null,
    p_cover_type: f.cover || null,
    p_day: f.day,
    p_open_now: f.openNow,
    p_overnight: f.overnight,
    p_access_24h: f.access24h,
    p_lat: dest?.lat ?? null,
    p_lng: dest?.lng ?? null,
    p_radius_m: dest ? f.radiusM : null,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: (f.page - 1) * pageSize,
  };
}

/** Query-string for the current filters with overrides (used by pagination, view toggle and sort links). */
export function buildSearchQuery(f: SearchFilters, overrides: Partial<Record<string, string | number | null>> = {}): string {
  const p = new URLSearchParams();
  const set = (k: string, v: string | number | null | boolean) => {
    if (v !== null && v !== "" && v !== false) p.set(k, String(v === true ? "1" : v));
  };
  set("q", f.q);
  set("near", f.near);
  set("lat", f.lat);
  set("lng", f.lng);
  if (f.lat !== null || f.near) set("radius", f.radiusParam);
  set("vehicle", f.vehicle);
  set("rental", f.rental);
  set("cover", f.cover);
  set("minPrice", f.minPrice);
  set("maxPrice", f.maxPrice);
  set("day", f.day);
  set("openNow", f.openNow);
  set("overnight", f.overnight);
  set("access24h", f.access24h);
  if (f.sort !== "newest") set("sort", f.sort);
  if (f.view !== "list") set("view", f.view);
  if (f.page > 1) set("page", f.page);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function activeFilterCount(f: SearchFilters): number {
  return [f.vehicle, f.rental, f.cover, f.minPrice, f.maxPrice, f.day, f.openNow || null, f.overnight || null, f.access24h || null, f.near, f.lat]
    .filter((x) => x !== "" && x !== null && x !== undefined).length;
}
