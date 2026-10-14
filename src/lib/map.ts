import type { Feature, Polygon } from "geojson";
import { REGION_BOUNDS } from "@/lib/domain/constants";

/** Public coordinates are snapped to a ~430 m grid, so show a ~300 m circle instead of a precise pin. */
export const APPROX_RADIUS_M = 300;

/** GeoJSON polygon approximating a circle (good enough for a few hundred metres). */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 48): Feature<Polygon> {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function isInRegion(lat: number, lng: number): boolean {
  return lat >= REGION_BOUNDS.minLat && lat <= REGION_BOUNDS.maxLat && lng >= REGION_BOUNDS.minLng && lng <= REGION_BOUNDS.maxLng;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mirrors the database's snap_coordinate() so the UI can preview what will be public. */
export function snapCoordinate(v: number, step = 0.004): number {
  return Math.round((Math.floor(v / step) + 0.5) * step * 1e6) / 1e6;
}
