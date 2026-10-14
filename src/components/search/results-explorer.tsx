"use client";

import { useCallback, useMemo, useState } from "react";
import type { SearchRow } from "@/lib/types";
import { ListingCard } from "@/components/listing/listing-card";
import { MapView, type MapMarker } from "@/components/map/map-view";
import { formatINR } from "@/lib/domain/format";
import { cx } from "@/components/ui";

/** List + (optional) interactive map with synchronized selection. */
export function ResultsExplorer({ items, view, destination }: { items: SearchRow[]; view: "list" | "map"; destination: { lat: number; lng: number } | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const markers = useMemo<MapMarker[]>(
    () =>
      items
        .filter((i) => i.latitude !== null && i.longitude !== null)
        .map((i) => ({
          id: i.id,
          lat: i.latitude as number,
          lng: i.longitude as number,
          label: formatINR(i.price_inr),
          title: i.title,
          approximate: i.location_privacy === "approximate",
        })),
    [items],
  );

  const select = useCallback((id: string, scroll = false) => {
    setSelectedId(id);
    if (scroll) document.getElementById(`card-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const grid = (
    <ul className={cx("grid gap-4", view === "map" ? "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((l) => (
        <li key={l.id} className="relative">
          <ListingCard
            listing={l}
            selected={selectedId === l.id}
            onSelect={view === "map" ? (id) => select(id) : undefined}
            footer={
              view === "map" ? (
                <button type="button" onClick={() => select(l.id)} className="self-start text-sm font-semibold text-brand-800 underline">
                  Show on map
                </button>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  if (view === "list") return grid;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="order-2 lg:order-1 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-2">{grid}</div>
      <div className="order-1 lg:sticky lg:top-24 lg:order-2 lg:self-start">
        <MapView
          markers={markers}
          selectedId={selectedId}
          onSelect={(id) => select(id, true)}
          destination={destination}
          ariaLabel="Map of matching parking listings"
          className="h-72 lg:h-[calc(100vh-10rem)]"
        />
        <p className="mt-2 text-xs text-slate-600">Markers show approximate locations unless an owner has chosen to share an exact pin.</p>
      </div>
    </div>
  );
}
