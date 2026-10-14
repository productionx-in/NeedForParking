import { describe, it, expect } from "vitest";
import { buildSearchQuery, parseSearchParams, resolveDestination, toRpcArgs, activeFilterCount, PAGE_SIZE, MAP_PAGE_SIZE } from "@/lib/validation/search";
import { pageWindow } from "@/components/search/pagination";

describe("search param parsing (untrusted URL input)", () => {
  it("returns safe defaults for an empty query", () => {
    const f = parseSearchParams({});
    expect(f).toMatchObject({ q: "", vehicle: "", rental: "", cover: "", minPrice: null, maxPrice: null, day: null, openNow: false, sort: "newest", view: "list", page: 1, radiusM: 200, radiusParam: null });
  });

  it("drops invalid enum values, junk numbers and out-of-region coordinates", () => {
    const f = parseSearchParams({ vehicle: "truck", rental: "yearly", cover: "roofed", minPrice: "abc", maxPrice: "-5", day: "9", page: "-3", sort: "random", view: "3d", lat: "48.8", lng: "2.3", radius: "999999" });
    expect(f).toMatchObject({ vehicle: "", rental: "", cover: "", minPrice: null, maxPrice: null, day: null, page: 1, sort: "newest", view: "list", lat: null, lng: null, radiusM: 200, radiusParam: null });
  });

  it("accepts valid values and clamps the query length", () => {
    const f = parseSearchParams({ q: "x".repeat(500), vehicle: "car", rental: "monthly", cover: "covered", minPrice: "1000", maxPrice: "5000", day: "3", openNow: "1", overnight: "1", access24h: "1", sort: "price_asc", view: "map", page: "4", lat: "17.44", lng: "78.38", radius: "300" });
    expect(f.q).toHaveLength(80);
    expect(f).toMatchObject({ vehicle: "car", rental: "monthly", cover: "covered", minPrice: 1000, maxPrice: 5000, day: 3, openNow: true, overnight: true, access24h: true, sort: "price_asc", view: "map", page: 4, lat: 17.44, lng: 78.38, radiusM: 300, radiusParam: 300 });
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
    expect(a).toMatchObject({ p_limit: PAGE_SIZE, p_offset: PAGE_SIZE * 2, p_vehicle: "car", p_sort: "newest", p_lat: null, p_radius_m: null });
    const b = toRpcArgs(parseSearchParams({ near: "Gachibowli", sort: "distance", radius: "500", view: "map" }));
    expect(b).toMatchObject({ p_sort: "distance", p_radius_m: 500, p_limit: MAP_PAGE_SIZE, p_lat: 17.4401 });
  });

  it("picks walking-distance defaults: 200 m around a precise point, 1 km around a named area", () => {
    expect(parseSearchParams({ lat: "17.4435", lng: "78.3772" })).toMatchObject({ radiusM: 200, radiusParam: null });
    expect(parseSearchParams({ near: "Madhapur" })).toMatchObject({ radiusM: 1000, radiusParam: null });
    expect(parseSearchParams({ near: "Madhapur", lat: "17.4435", lng: "78.3772" })).toMatchObject({ radiusM: 200 });
    expect(toRpcArgs(parseSearchParams({ lat: "17.4435", lng: "78.3772" }))).toMatchObject({ p_radius_m: 200 });
    expect(toRpcArgs(parseSearchParams({ near: "Madhapur" }))).toMatchObject({ p_radius_m: 1000 });
  });

  it("treats radius as metres and rejects nonsense (kilometre-sized or tiny values)", () => {
    expect(parseSearchParams({ lat: "17.44", lng: "78.37", radius: "150" }).radiusM).toBe(150);
    for (const bad of ["abc", "-5", "0", "10", "999999"]) {
      expect(parseSearchParams({ lat: "17.44", lng: "78.37", radius: bad })).toMatchObject({ radiusM: 200, radiusParam: null });
    }
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
