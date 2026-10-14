"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { COVER_TYPES, DAYS, RENTAL_TYPES, VEHICLE_TYPES } from "@/lib/domain/constants";
import { HYDERABAD_LOCALITIES } from "@/lib/domain/localities";
import { isInRegion } from "@/lib/map";
import type { SearchFilters } from "@/lib/validation/search";
import { activeFilterCount, RADIUS_OPTIONS_M } from "@/lib/validation/search";
import { formatRadius } from "@/lib/domain/format";
import { Button, buttonClass, Checkbox, Field, Input, Select } from "@/components/ui";

/** A plain GET form: filters live in the URL, so results are shareable and work without JavaScript. */
export function FilterForm({ filters }: { filters: SearchFilters }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [lat, setLat] = useState(filters.lat !== null ? String(filters.lat) : "");
  const [lng, setLng] = useState(filters.lng !== null ? String(filters.lng) : "");
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const count = activeFilterCount(filters);

  /** Only runs on an explicit click; the browser then asks the user for permission. Coordinates are never stored. */
  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoMessage("Your browser doesn't support location.");
      return;
    }
    setGeoMessage("Waiting for your permission…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!isInRegion(latitude, longitude)) {
          setGeoMessage("You appear to be outside Hyderabad. Choose an area instead.");
          return;
        }
        setLat(latitude.toFixed(5));
        setLng(longitude.toFixed(5));
        setGeoMessage("Using your location for this search only. It isn't saved.");
        setTimeout(() => formRef.current?.requestSubmit(), 0);
      },
      (err) => setGeoMessage(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Choose an area instead." : "Couldn't get your location."),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <form ref={formRef} method="get" action="/search" role="search" aria-label="Search parking" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {filters.view === "map" && <input type="hidden" name="view" value="map" />}
      <div className="grid gap-3 md:grid-cols-[2fr_1.2fr_auto]">
        <Field id="q" label="Locality or listing title">
          <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="e.g. Madhapur, covered bay" maxLength={80} />
        </Field>
        <Field id="near" label="Near area (destination)">
          <Select id="near" name="near" defaultValue={filters.near} onChange={() => { setLat(""); setLng(""); }}>
            <option value="">Anywhere in Hyderabad</option>
            {HYDERABAD_LOCALITIES.map((l) => (
              <option key={l.name} value={l.name}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <button type="submit" className={buttonClass("primary", "w-full md:w-auto")}>Search</button>
        </div>
      </div>

      <details open={count > 0} className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          More filters {count > 0 && <span className="ml-1 rounded-full bg-brand-700 px-2 py-0.5 text-xs text-white">{count}</span>}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="vehicle" label="Vehicle type">
            <Select id="vehicle" name="vehicle" defaultValue={filters.vehicle}>
              <option value="">Any</option>
              {VEHICLE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </Select>
          </Field>
          <Field id="rental" label="Rental type">
            <Select id="rental" name="rental" defaultValue={filters.rental}>
              <option value="">Any</option>
              {RENTAL_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <Field id="cover" label="Covered / open">
            <Select id="cover" name="cover" defaultValue={filters.cover}>
              <option value="">Any</option>
              {COVER_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field id="day" label="Available on">
            <Select id="day" name="day" defaultValue={filters.day === null ? "" : String(filters.day)}>
              <option value="">Any day</option>
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.long}</option>)}
            </Select>
          </Field>
          <Field id="minPrice" label="Min price (₹)">
            <Input id="minPrice" name="minPrice" type="number" min={0} step={10} inputMode="numeric" defaultValue={filters.minPrice ?? ""} />
          </Field>
          <Field id="maxPrice" label="Max price (₹)">
            <Input id="maxPrice" name="maxPrice" type="number" min={0} step={10} inputMode="numeric" defaultValue={filters.maxPrice ?? ""} />
          </Field>
          <Field id="radius" label="Walking distance from destination" hint="Auto = 200 m around a precise point, 1 km around an area.">
            <Select id="radius" name="radius" defaultValue={filters.radiusParam === null ? "" : String(filters.radiusParam)} hint="Auto = 200 m around a precise point, 1 km around an area.">
              <option value="">Auto</option>
              {filters.radiusParam !== null && !(RADIUS_OPTIONS_M as readonly number[]).includes(filters.radiusParam) && (
                <option value={filters.radiusParam}>Within {formatRadius(filters.radiusParam)}</option>
              )}
              {RADIUS_OPTIONS_M.map((r) => <option key={r} value={r}>Within {formatRadius(r)}</option>)}
            </Select>
          </Field>
          <Field id="sort" label="Sort by">
            <Select id="sort" name="sort" defaultValue={filters.sort}>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="distance">Nearest to destination</option>
            </Select>
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-slate-900">Availability &amp; access</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Checkbox id="openNow" name="openNow" value="1" defaultChecked={filters.openNow} label="Available right now" hint="Based on the owner's days and hours (IST)" />
            <Checkbox id="overnight" name="overnight" value="1" defaultChecked={filters.overnight} label="Overnight parking allowed" />
            <Checkbox id="access24h" name="access24h" value="1" defaultChecked={filters.access24h} label="24-hour access" />
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-slate-900">Destination coordinates (optional)</legend>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field id="lat" label="Latitude">
              <Input id="lat" name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="17.4435" />
            </Field>
            <Field id="lng" label="Longitude">
              <Input id="lng" name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="78.3772" />
            </Field>
            <Button variant="secondary" onClick={useMyLocation}>Use my location</Button>
          </div>
          <p role="status" className="mt-2 min-h-5 text-sm text-slate-600">
            {geoMessage ?? "Location is only requested when you press the button, and is used for this search only."}
          </p>
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className={buttonClass("primary")}>Apply filters</button>
          <Link href={filters.view === "map" ? "/search?view=map" : "/search"} className={buttonClass("ghost")}>Clear all</Link>
        </div>
      </details>
    </form>
  );
}
