import { describe, it, expect } from "vitest";
import { buildSearchQuery, parseSearchParams, resolveDestination, toRpcArgs, activeFilterCount, PAGE_SIZE, MAP_PAGE_SIZE } from "@/lib/validation/search";
import { pageWindow } from "@/components/search/pagination";

describe("search param parsing (untrusted URL input)", () => {
  it("returns safe defaults for an empty query", () => {
    const f = parseSearchParams({});
    expect(f).toMatchObject({ q: "", vehicle: "", rental: "", cover: "", minPrice: null, maxPrice: null, day: null, openNow: false, sort: "newest", view: "list", page: 1, radiusKm: 5 });
  });

  it("drops invalid enum values, junk numbers and out-of-region coordinates", () => {
    const f = parseSearchParams({ vehicle: "truck", rental: "yearly", cover: "roofed", minPrice: "abc", maxPrice: "-5", day: "9", page: "-3", sort: "random", view: "3d", lat: "48.8", lng: "2.3", radius: "9999" });
    expect(f).toMatchObject({ vehicle: "", rental: "", cover: "", minPrice: null, maxPrice: null, day: null, page: 1, sort: "newest", view: "list", lat: null, lng: null, radiusKm: 5 });
  });

  it("accepts valid values and clamps the query length", () => {
    const f = parseSearchParams({ q: "x".repeat(500), vehicle: "car", rental: "monthly", cover: "covered", minPrice: "1000", maxPrice: "5000", day: "3", openNow: "1", overnight: "1", access24h: "1", sort: "price_asc", view: "map", page: "4", lat: "17.44", lng: "78.38", radius: "3" });
    expect(f.q).toHaveLength(80);
    expect(f).toMatchObject({ vehicle: "car", rental: "monthly", cover: "covered", minPrice: 1000, maxPrice: 5000, day: 3, openNow: true, overnight: true, access24h: true, sort: "price_asc", view: "map", page: 4, lat: 17.44, lng: 78.38, radiusKm: 3 });
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseSearchParams({ vehicle: ["car", "other"] }).vehicle).toBe("car");
  });

  it("resolves named areas to coordinates, with explicit coordinates winning", () => {
    expect(resolveDestination(parseSearchParams({ near: "madhapur" }))).toMatchObject({ label: "Madhapur", lat: 17.4486 });
    expect(resolveDestination(parseSearchParams({ near: "Nowhere" }))).toBeNull();
    expect(resolveDestination(parseSearchParams({ near: "Madhapur", lat: "17.5", lng: "78.5" }))).toMatchObject({ lat: 17.5, lng: 78.5 });
  });

  it("builds RPC args: pagination, destination radius, and distance sort fallback", () => {
    const a = toRpcArgs(parseSearchParams({ page: "3", vehicle: "car", sort: "distance" }));
    expect(a).toMatchObject({ p_limit: PAGE_SIZE, p_offset: PAGE_SIZE * 2, p_vehicle: "car", p_sort: "newest", p_lat: null, p_radius_km: null });
    const b = toRpcArgs(parseSearchParams({ near: "Gachibowli", sort: "distance", radius: "2", view: "map" }));
    expect(b).toMatchObject({ p_sort: "distance", p_radius_km: 2, p_limit: MAP_PAGE_SIZE, p_lat: 17.4401 });
  });

  it("round-trips filters through the query string and supports overrides", () => {
    const f = parseSearchParams({ q: "bay", vehicle: "car", minPrice: "500", openNow: "1", page: "2", near: "Kondapur" });
    const qs = buildSearchQuery(f);
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
    expect(buildSearchQuery(f, { page: null })).not.toContain("page=");
    expect(buildSearchQuery(f, { view: "map" })).toContain("view=map");
  });

  it("counts active filters", () => {
    expect(activeFilterCount(parseSearchParams({}))).toBe(0);
    expect(activeFilterCount(parseSearchParams({ vehicle: "car", openNow: "1", minPrice: "5" }))).toBe(3);
  });
});

describe("pagination window", () => {
  it("collapses long ranges with ellipses", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(10, 20)).toEqual([1, "…", 8, 9, 10, 11, 12, "…", 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, "…", 20]);
  });
});
