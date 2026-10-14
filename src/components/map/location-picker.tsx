"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { publicEnv, isMapConfigured } from "@/lib/env";
import { HYDERABAD_CENTER } from "@/lib/domain/constants";
import { isInRegion } from "@/lib/map";
import { Button } from "@/components/ui";
import { MapUnavailable } from "@/components/map/map-unavailable";

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Where to centre when there is no pin yet (e.g. the chosen locality). */
  fallbackCenter?: { lat: number; lng: number };
};

export function LocationPicker({ lat, lng, onChange, fallbackCenter }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const mapboxRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const place = (la: number, ln: number, fly = true) => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ draggable: true, color: "#0f766e" }).setLngLat([ln, la]).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLngLat();
        if (!isInRegion(p.lat, p.lng)) {
          setMessage("That pin is outside the Hyderabad region. Move it back.");
          return;
        }
        setMessage(null);
        onChangeRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
      });
    } else {
      markerRef.current.setLngLat([ln, la]);
    }
    if (fly) map.easeTo({ center: [ln, la], zoom: Math.max(map.getZoom(), 16), duration: 500 });
  };

  useEffect(() => {
    if (!isMapConfigured() || !container.current) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !container.current) return;
      mapboxgl.accessToken = publicEnv.mapboxToken;
      mapboxRef.current = mapboxgl;
      const start = lat !== null && lng !== null ? { lat, lng } : (fallbackCenter ?? HYDERABAD_CENTER);
      const map = new mapboxgl.Map({ container: container.current, style: "mapbox://styles/mapbox/streets-v12", center: [start.lng, start.lat], zoom: lat !== null ? 16 : 12 });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (e) => {
        if (!isInRegion(e.lngLat.lat, e.lngLat.lng)) {
          setMessage("Pick a point inside Hyderabad.");
          return;
        }
        setMessage(null);
        place(e.lngLat.lat, e.lngLat.lng, false);
        onChangeRef.current(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)));
      });
      map.on("load", () => {
        if (cancelled) return;
        mapRef.current = map;
        setReady(true);
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Map is created once; later prop changes are handled by the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker in sync with externally-edited coordinates.
  useEffect(() => {
    if (ready && lat !== null && lng !== null) place(lat, lng, false);
  }, [lat, lng, ready]);

  if (!isMapConfigured()) {
    return (
      <div className="space-y-2">
        <MapUnavailable />
        <p className="text-sm text-slate-600">Enter the latitude and longitude below instead (you can copy them from any maps app).</p>
      </div>
    );
  }

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setMessage("Your browser doesn't support location.");
      return;
    }
    setMessage("Waiting for your permission…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!isInRegion(latitude, longitude)) {
          setMessage("Your current location is outside Hyderabad. Search for the space instead.");
          return;
        }
        setMessage(null);
        place(latitude, longitude);
        onChange(Number(latitude.toFixed(6)), Number(longitude.toFixed(6)));
      },
      () => setMessage("Location permission was denied or unavailable. You can still click the map."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=in&proximity=${HYDERABAD_CENTER.lng},${HYDERABAD_CENTER.lat}&limit=1&access_token=${publicEnv.mapboxToken}`;
      const res = await fetch(url);
      const json = (await res.json()) as { features?: { center: [number, number] }[] };
      const c = json.features?.[0]?.center;
      if (!c || !isInRegion(c[1], c[0])) setMessage("No match in Hyderabad. Try a landmark or click the map.");
      else {
        place(c[1], c[0]);
        onChange(Number(c[1].toFixed(6)), Number(c[0].toFixed(6)));
      }
    } catch {
      setMessage("Search failed. You can still click the map to place the pin.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="map-search">Search for a place on the map</label>
        <input
          id="map-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Search a landmark or street…"
          className="min-h-11 flex-1 rounded-lg border border-slate-400 px-3 text-sm"
        />
        <Button variant="secondary" onClick={() => void search()} disabled={searching}>{searching ? "Searching…" : "Search"}</Button>
        <Button variant="secondary" onClick={useMyLocation}>Use my current location</Button>
      </div>
      <div ref={container} role="application" aria-label="Map. Click to place the pin, or drag the marker." className="h-80 w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-100" />
      <p role="status" className="min-h-5 text-sm text-slate-700">{message ?? "Click the map or drag the marker to set the exact entrance. Only the owner (and renters you accept) ever see the exact pin."}</p>
    </div>
  );
}
