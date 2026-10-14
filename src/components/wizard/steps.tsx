"use client";

import { COVER_TYPES, DAYS, PERMISSION_STATUSES, RENTAL_TYPES, SECURITY_FEATURES, VEHICLE_TYPES, type SecurityFeature, type VehicleType } from "@/lib/domain/constants";
import { HYDERABAD_LOCALITIES, findLocality } from "@/lib/domain/localities";
import { formatDays, formatHours, formatINR } from "@/lib/domain/format";
import { snapCoordinate } from "@/lib/map";
import type { FieldErrors, ListingFormValues } from "@/lib/validation/listing";
import { Alert, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { LocationPicker } from "@/components/map/location-picker";

export type StepProps = {
  values: ListingFormValues;
  errors: FieldErrors;
  set: <K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => void;
};

const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

function GroupError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="mt-1 text-sm font-medium text-red-700">{message}</p> : null;
}

export function BasicsStep({ values, errors, set }: StepProps) {
  return (
    <div className="space-y-5">
      <Field id="title" label="Listing title" hint="A short, honest summary, e.g. “Covered bay near Inorbit Mall”." error={errors.title} required>
        <Input id="title" value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={120} error={errors.title} hint="A short, honest summary, e.g. “Covered bay near Inorbit Mall”." />
      </Field>
      <Field id="description" label="Description" hint="What kind of space is it? How do people get in? Anything they should know?" error={errors.description} required>
        <Textarea id="description" rows={5} value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} error={errors.description} hint="What kind of space is it? How do people get in? Anything they should know?" />
      </Field>
      <fieldset aria-describedby={errors.vehicleTypes ? "vehicleTypes-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Vehicles this space suits <span aria-hidden="true" className="text-red-700">*</span></legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {VEHICLE_TYPES.map((v) => (
            <Checkbox key={v.value} id={`vt-${v.value}`} label={v.label} checked={values.vehicleTypes.includes(v.value)} onChange={() => set("vehicleTypes", toggle<VehicleType>(values.vehicleTypes, v.value))} />
          ))}
        </div>
        <GroupError id="vehicleTypes-error" message={errors.vehicleTypes} />
      </fieldset>
      <fieldset aria-describedby={errors.coverType ? "coverType-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Covered or open? <span aria-hidden="true" className="text-red-700">*</span></legend>
        <div className="flex gap-6">
          {COVER_TYPES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="coverType" value={c.value} checked={values.coverType === c.value} onChange={() => set("coverType", c.value)} className="size-4 accent-brand-700" />
              {c.label}
            </label>
          ))}
        </div>
        <GroupError id="coverType-error" message={errors.coverType} />
      </fieldset>
    </div>
  );
}

export function LocationStep({ values, errors, set }: StepProps) {
  const lat = values.latitude.trim() === "" ? null : Number(values.latitude);
  const lng = values.longitude.trim() === "" ? null : Number(values.longitude);
  const validPin = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  const center = findLocality(values.locality) ?? undefined;
  return (
    <div className="space-y-5">
      <Alert tone="info" title="You control what the public sees">
        Your exact address and pin stay private. By default the public map shows only an approximate area (~400 m). Renters whose request you accept can then see the exact details.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="addressLine" label="Full address (private)" hint="Building, street and landmark. Not shown publicly unless you choose." error={errors.addressLine} required className="sm:col-span-2">
          <Input id="addressLine" value={values.addressLine} onChange={(e) => set("addressLine", e.target.value)} maxLength={200} autoComplete="street-address" error={errors.addressLine} hint="Building, street and landmark. Not shown publicly unless you choose." />
        </Field>
        <Field id="locality" label="Locality" error={errors.locality} required>
          <Input id="locality" list="locality-options" value={values.locality} onChange={(e) => set("locality", e.target.value)} maxLength={80} error={errors.locality} />
          <datalist id="locality-options">
            {HYDERABAD_LOCALITIES.map((l) => <option key={l.name} value={l.name} />)}
          </datalist>
        </Field>
        <Field id="city" label="City" error={errors.city}>
          <Select id="city" value={values.city} onChange={(e) => set("city", e.target.value as ListingFormValues["city"])}>
            <option>Hyderabad</option>
            <option>Secunderabad</option>
          </Select>
        </Field>
        <Field id="postalCode" label="PIN code" error={errors.postalCode} required>
          <Input id="postalCode" inputMode="numeric" maxLength={6} value={values.postalCode} onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" error={errors.postalCode} />
        </Field>
        <Field id="publicLandmark" label="Public landmark (optional)" hint="Shown publicly, e.g. “Opposite Metro station”." error={errors.publicLandmark}>
          <Input id="publicLandmark" value={values.publicLandmark} onChange={(e) => set("publicLandmark", e.target.value)} maxLength={100} error={errors.publicLandmark} hint="Shown publicly, e.g. “Opposite Metro station”." />
        </Field>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Pin the entrance on the map <span aria-hidden="true" className="text-red-700">*</span></h3>
        <LocationPicker lat={validPin ? lat : null} lng={validPin ? lng : null} fallbackCenter={center} onChange={(la, ln) => { set("latitude", String(la)); set("longitude", String(ln)); }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="latitude" label="Latitude" error={errors.latitude} required>
          <Input id="latitude" inputMode="decimal" value={values.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="17.4486" error={errors.latitude} />
        </Field>
        <Field id="longitude" label="Longitude" error={errors.longitude} required>
          <Input id="longitude" inputMode="decimal" value={values.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="78.3908" error={errors.longitude} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">What location does the public see?</legend>
        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="locationPrivacy" checked={values.locationPrivacy === "approximate"} onChange={() => set("locationPrivacy", "approximate")} className="mt-1 size-4 accent-brand-700" />
            <span><strong>Approximate area (recommended)</strong><br /><span className="text-slate-600">Recommended for homes and apartments.{validPin && ` Public map centre: ${snapCoordinate(lat!).toFixed(4)}, ${snapCoordinate(lng!).toFixed(4)}.`}</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="locationPrivacy" checked={values.locationPrivacy === "exact"} onChange={() => set("locationPrivacy", "exact")} className="mt-1 size-4 accent-brand-700" />
            <span><strong>Exact pin</strong><br /><span className="text-slate-600">Suitable for commercial lots. Anyone can see where this is.</span></span>
          </label>
        </div>
        <Checkbox id="showAddressPublicly" className="mt-3" checked={values.showAddressPublicly} onChange={(e) => set("showAddressPublicly", e.target.checked)} label="Also show my full address publicly" hint="Off by default. Leave off for private residences." />
      </fieldset>
    </div>
  );
}

export function PricingStep({ values, errors, set }: StepProps) {
  const unit = RENTAL_TYPES.find((r) => r.value === values.rentalType);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rentalType" label="Rental type" error={errors.rentalType} required>
          <Select id="rentalType" value={values.rentalType} onChange={(e) => set("rentalType", e.target.value as ListingFormValues["rentalType"])} error={errors.rentalType}>
            <option value="">Choose…</option>
            {RENTAL_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        <Field id="priceInr" label={`Price in ₹ ${unit ? unit.per : ""}`} error={errors.priceInr} required>
          <Input id="priceInr" inputMode="decimal" value={values.priceInr} onChange={(e) => set("priceInr", e.target.value)} error={errors.priceInr} />
        </Field>
        <Field id="minDuration" label={`Minimum rental (${unit ? unit.unitPlural : "units"})`} error={errors.minDuration} required>
          <Input id="minDuration" inputMode="numeric" value={values.minDuration} onChange={(e) => set("minDuration", e.target.value)} error={errors.minDuration} />
        </Field>
        <Field id="depositInr" label="Security deposit in ₹ (optional)" hint="Collected offline between you and the renter. This prototype takes no payments." error={errors.depositInr}>
          <Input id="depositInr" inputMode="decimal" value={values.depositInr} onChange={(e) => set("depositInr", e.target.value)} error={errors.depositInr} hint="Collected offline between you and the renter. This prototype takes no payments." />
        </Field>
      </div>

      <fieldset aria-describedby={errors.availableDays ? "availableDays-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Available days <span aria-hidden="true" className="text-red-700">*</span></legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {DAYS.map((d) => (
            <Checkbox key={d.value} id={`day-${d.value}`} label={d.short} checked={values.availableDays.includes(d.value)} onChange={() => set("availableDays", toggle(values.availableDays, d.value))} />
          ))}
        </div>
        <GroupError id="availableDays-error" message={errors.availableDays} />
      </fieldset>

      <div className="space-y-3">
        <Checkbox id="access24h" checked={values.access24h} onChange={(e) => set("access24h", e.target.checked)} label="24-hour access" hint="Renters can arrive and leave at any hour." />
        {!values.access24h && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="availableFrom" label="Available from" hint="A window may cross midnight, e.g. 20:00 to 07:00." error={errors.availableFrom} required>
              <Input id="availableFrom" type="time" value={values.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} error={errors.availableFrom} hint="A window may cross midnight, e.g. 20:00 to 07:00." />
            </Field>
            <Field id="availableTo" label="Available until" error={errors.availableTo} required>
              <Input id="availableTo" type="time" value={values.availableTo} onChange={(e) => set("availableTo", e.target.value)} error={errors.availableTo} />
            </Field>
          </div>
        )}
        <Checkbox id="overnightAllowed" checked={values.overnightAllowed} onChange={(e) => set("overnightAllowed", e.target.checked)} label="Vehicles may stay overnight" />
      </div>
    </div>
  );
}

export function RulesStep({ values, errors, set }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="maxHeightM" label="Maximum vehicle height in metres (optional)" hint="Low ceilings or gates? e.g. 2.1" error={errors.maxHeightM}>
          <Input id="maxHeightM" inputMode="decimal" value={values.maxHeightM} onChange={(e) => set("maxHeightM", e.target.value)} error={errors.maxHeightM} hint="Low ceilings or gates? e.g. 2.1" />
        </Field>
        <Field id="maxLengthM" label="Maximum vehicle length in metres (optional)" error={errors.maxLengthM}>
          <Input id="maxLengthM" inputMode="decimal" value={values.maxLengthM} onChange={(e) => set("maxLengthM", e.target.value)} error={errors.maxLengthM} />
        </Field>
      </div>
      <Field id="vehicleRestrictions" label="Other restrictions (optional)" error={errors.vehicleRestrictions}>
        <Textarea id="vehicleRestrictions" rows={3} value={values.vehicleRestrictions} onChange={(e) => set("vehicleRestrictions", e.target.value)} maxLength={500} error={errors.vehicleRestrictions} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Security features</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECURITY_FEATURES.map((f) => (
            <Checkbox key={f.value} id={`sec-${f.value}`} label={f.label} checked={values.securityFeatures.includes(f.value)} onChange={() => set("securityFeatures", toggle<SecurityFeature>(values.securityFeatures, f.value))} />
          ))}
        </div>
      </fieldset>
      <Field id="accessInstructions" label="Access instructions (private)" hint="Gate codes, who to call, where to park. Only renters you accept can see this." error={errors.accessInstructions}>
        <Textarea id="accessInstructions" rows={4} value={values.accessInstructions} onChange={(e) => set("accessInstructions", e.target.value)} maxLength={1000} error={errors.accessInstructions} hint="Gate codes, who to call, where to park. Only renters you accept can see this." />
      </Field>
    </div>
  );
}

export function ReviewStep({ values, errors, set, photoCount }: StepProps & { photoCount: number }) {
  const rows: [string, string][] = [
    ["Title", values.title || "—"],
    ["Where", [values.locality, values.city, values.postalCode].filter(Boolean).join(", ") || "—"],
    ["Price", values.priceInr ? `${formatINR(values.priceInr)} ${RENTAL_TYPES.find((r) => r.value === values.rentalType)?.per ?? ""}` : "—"],
    ["Days & hours", `${formatDays(values.availableDays)} · ${formatHours(values.access24h, values.availableFrom, values.availableTo)}`],
    ["Public location", values.locationPrivacy === "approximate" ? "Approximate area" : "Exact pin"],
    ["Photos", `${photoCount} added`],
  ];
  return (
    <div className="space-y-6">
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
            <dt className="w-40 shrink-0 text-sm text-slate-600">{k}</dt>
            <dd className="text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <fieldset aria-describedby={errors.permissionStatus ? "permissionStatus-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">Property or community permission <span aria-hidden="true" className="text-red-700">*</span></legend>
        <div className="space-y-2">
          {PERMISSION_STATUSES.filter((p) => p.value !== "unconfirmed").map((p) => (
            <label key={p.value} className="flex items-start gap-3 text-sm">
              <input type="radio" name="permissionStatus" checked={values.permissionStatus === p.value} onChange={() => set("permissionStatus", p.value)} className="mt-1 size-4 accent-brand-700" />
              {p.label}
            </label>
          ))}
        </div>
        <GroupError id="permissionStatus-error" message={errors.permissionStatus} />
        <Field id="permissionNotes" label="Notes (optional)" hint="e.g. “Approved by the apartment association, Jan 2026”." error={errors.permissionNotes} className="mt-3">
          <Input id="permissionNotes" value={values.permissionNotes} onChange={(e) => set("permissionNotes", e.target.value)} maxLength={500} error={errors.permissionNotes} hint="e.g. “Approved by the apartment association, Jan 2026”." />
        </Field>
      </fieldset>

      <div>
        <Checkbox
          id="ownerDeclaration"
          checked={values.ownerDeclaration}
          onChange={(e) => set("ownerDeclaration", e.target.checked)}
          label="I declare that I own this parking space or am authorized to offer it, and that the details above are accurate."
          aria-describedby={errors.ownerDeclaration ? "ownerDeclaration-error" : undefined}
        />
        <GroupError id="ownerDeclaration-error" message={errors.ownerDeclaration} />
      </div>
    </div>
  );
}
