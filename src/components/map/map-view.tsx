"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { publicEnv, isMapConfigured } from "@/lib/env";
import { HYDERABAD_CENTER } from "@/lib/domain/constants";
import { APPROX_RADIUS_M, circlePolygon } from "@/lib/map";
import { MapUnavailable } from "@/components/map/map-unavailable";

export type MapMarker = { id: string; lat: number; lng: number; label: string; title: string; approximate: boolean };

type Props = {
  markers: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  destination?: { lat: number; lng: number } | null;
  className?: string;
  ariaLabel: string;
  zoom?: number;
};

const STYLE = "mapbox://styles/mapbox/streets-v12";

export function MapView({ markers, selectedId, onSelect, destination, className = "h-96", ariaLabel, zoom = 12 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRefs = useRef<Map<string, { marker: Marker; el: HTMLButtonElement }>>(new Map());
  const destRef = useRef<Marker | null>(null);
  const mapboxRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Create the map once.
  useEffect(() => {
    if (!isMapConfigured() || !container.current) return;
    let cancelled = false;
    const markerStore = markerRefs.current;
    (async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled || !container.current) return;
        mapboxgl.accessToken = publicEnv.mapboxToken;
        mapboxRef.current = mapboxgl;
        const first = markers[0];
        const map = new mapboxgl.Map({
          container: container.current,
          style: STYLE,
          center: first ? [first.lng, first.lat] : [HYDERABAD_CENTER.lng, HYDERABAD_CENTER.lat],
          zoom,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (cancelled) return;
          map.addSource("approx", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: "approx-fill", type: "fill", source: "approx", paint: { "fill-color": "#0d9488", "fill-opacity": 0.14 } });
          map.addLayer({ id: "approx-line", type: "line", source: "approx", paint: { "line-color": "#0f766e", "line-width": 1.5, "line-dasharray": [2, 2] } });
          setReady(true);
        });
        map.on("error", () => setFailed(true));
        mapRef.current = map;
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      markerStore.forEach(({ marker }) => marker.remove());
      markerStore.clear();
      destRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers + approximate-area circles.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!ready || !map || !mapboxgl) return;
    markerRefs.current.forEach(({ marker }) => marker.remove());
    markerRefs.current.clear();
    for (const m of markers) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = m.label;
      el.setAttribute("aria-label", `${m.title}${m.approximate ? " (approximate location)" : ""}`);
      el.className = "rounded-full border-2 border-white bg-teal-700 px-2.5 py-1 text-xs font-bold text-white shadow-md hover:bg-teal-800";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(m.id);
      });
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
      markerRefs.current.set(m.id, { marker, el });
    }
    const source = map.getSource("approx") as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: markers.filter((m) => m.approximate).map((m) => circlePolygon(m.lat, m.lng, APPROX_RADIUS_M)),
    });
    if (markers.length > 1) {
      const b = new mapboxgl.LngLatBounds();
      markers.forEach((m) => b.extend([m.lng, m.lat]));
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 400 });
    } else if (markers.length === 1) {
      map.easeTo({ center: [markers[0]!.lng, markers[0]!.lat], zoom, duration: 400 });
    }
  }, [markers, ready, zoom]);

  // Destination marker.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!ready || !map || !mapboxgl) return;
    destRef.current?.remove();
    destRef.current = null;
    if (destination) {
      destRef.current = new mapboxgl.Marker({ color: "#b45309" }).setLngLat([destination.lng, destination.lat]).addTo(map);
    }
  }, [destination, ready]);

  // Highlight selection and pan to it.
  useEffect(() => {
    markerRefs.current.forEach(({ el, marker }, id) => {
      const on = id === selectedId;
      el.className = `rounded-full border-2 px-2.5 py-1 text-xs font-bold shadow-md ${on ? "border-amber-400 bg-slate-900 text-white scale-110" : "border-white bg-teal-700 text-white hover:bg-teal-800"}`;
      marker.getElement().style.zIndex = on ? "10" : "1";
      if (on && mapRef.current) mapRef.current.easeTo({ center: marker.getLngLat(), duration: 300 });
    });
  }, [selectedId, markers, ready]);

  if (!isMapConfigured()) return <MapUnavailable />;
  if (failed) return <MapUnavailable compact />;
  return <div ref={container} role="region" aria-label={ariaLabel} className={`${className} w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100`} />;
}
