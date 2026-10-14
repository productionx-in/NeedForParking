import { z } from "zod";
import {
  REGION_BOUNDS, SECURITY_FEATURES, VEHICLE_VALUES,
  type CoverType, type PermissionStatus, type RentalType, type SecurityFeature, type VehicleType,
} from "@/lib/domain/constants";
import type { ListingRow, PrivateDetailsRow } from "@/lib/types";

/** Form state is held as strings/arrays/booleans exactly as the inputs produce them. */
export type ListingFormValues = {
  title: string;
  description: string;
  vehicleTypes: VehicleType[];
  coverType: CoverType | "";
  addressLine: string;
  locality: string;
  city: "Hyderabad" | "Secunderabad";
  postalCode: string;
  latitude: string;
  longitude: string;
  locationPrivacy: "approximate" | "exact";
  showAddressPublicly: boolean;
  publicLandmark: string;
  rentalType: RentalType | "";
  priceInr: string;
  minDuration: string;
  depositInr: string;
  availableDays: number[];
  access24h: boolean;
  availableFrom: string;
  availableTo: string;
  overnightAllowed: boolean;
  maxHeightM: string;
  maxLengthM: string;
  vehicleRestrictions: string;
  securityFeatures: SecurityFeature[];
  accessInstructions: string;
  ownerDeclaration: boolean;
  permissionStatus: PermissionStatus;
  permissionNotes: string;
};

export const EMPTY_LISTING_FORM: ListingFormValues = {
  title: "", description: "", vehicleTypes: [], coverType: "",
  addressLine: "", locality: "", city: "Hyderabad", postalCode: "", latitude: "", longitude: "",
  locationPrivacy: "approximate", showAddressPublicly: false, publicLandmark: "",
  rentalType: "", priceInr: "", minDuration: "1", depositInr: "0",
  availableDays: [1, 2, 3, 4, 5], access24h: false, availableFrom: "08:00", availableTo: "20:00", overnightAllowed: false,
  maxHeightM: "", maxLengthM: "", vehicleRestrictions: "", securityFeatures: [], accessInstructions: "",
  ownerDeclaration: false, permissionStatus: "unconfirmed", permissionNotes: "",
};

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

/** Numeric text input with optional decimals; empty string is allowed only when `optional`. */
function numeric(label: string, o: { min: number; max: number; int?: boolean; optional?: boolean }) {
  return z.string().trim().superRefine((v, ctx) => {
    if (v === "") {
      if (!o.optional) ctx.addIssue({ code: "custom", message: `${label} is required` });
      return;
    }
    const pattern = o.int ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
    if (!pattern.test(v)) {
      ctx.addIssue({ code: "custom", message: o.int ? `${label} must be a whole number` : `${label} must be a number (up to 2 decimals)` });
      return;
    }
    const n = Number(v);
    if (n < o.min || n > o.max) ctx.addIssue({ code: "custom", message: `${label} must be between ${o.min} and ${o.max}` });
  });
}

function coordinate(label: string, min: number, max: number) {
  return z.string().trim().superRefine((v, ctx) => {
    if (v === "") {
      ctx.addIssue({ code: "custom", message: "Place the pin on the map (or enter coordinates)" });
      return;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) ctx.addIssue({ code: "custom", message: `${label} must be a number` });
    else if (n < min || n > max) ctx.addIssue({ code: "custom", message: `${label} must be within the Hyderabad region` });
  });
}

const timeOrEmpty = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Use HH:MM (24-hour) format");

export const listingFormSchema = z
  .object({
    title: text("Title", 5, 120),
    description: text("Description", 20, 2000),
    vehicleTypes: z.array(z.enum(VEHICLE_VALUES)).min(1, "Choose at least one vehicle type"),
    coverType: z.enum(["covered", "open"], { error: "Choose covered or open parking" }),
    addressLine: text("Address", 5, 200),
    locality: text("Locality", 2, 80),
    city: z.enum(["Hyderabad", "Secunderabad"], { error: "Choose a city" }),
    postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
    latitude: coordinate("Latitude", REGION_BOUNDS.minLat, REGION_BOUNDS.maxLat),
    longitude: coordinate("Longitude", REGION_BOUNDS.minLng, REGION_BOUNDS.maxLng),
    locationPrivacy: z.enum(["approximate", "exact"]),
    showAddressPublicly: z.boolean(),
    publicLandmark: z.string().trim().max(100, "Landmark must be at most 100 characters"),
    rentalType: z.enum(["hourly", "daily", "monthly"], { error: "Choose hourly, daily or monthly" }),
    priceInr: numeric("Price", { min: 1, max: 1_000_000 }),
    minDuration: numeric("Minimum duration", { min: 1, max: 365, int: true }),
    depositInr: numeric("Deposit", { min: 0, max: 1_000_000, optional: true }),
    availableDays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one available day"),
    access24h: z.boolean(),
    availableFrom: timeOrEmpty,
    availableTo: timeOrEmpty,
    overnightAllowed: z.boolean(),
    maxHeightM: numeric("Height limit", { min: 0.5, max: 5, optional: true }),
    maxLengthM: numeric("Length limit", { min: 1, max: 15, optional: true }),
    vehicleRestrictions: z.string().trim().max(500, "Restrictions must be at most 500 characters"),
    securityFeatures: z.array(z.enum(SECURITY_FEATURES.map((f) => f.value) as [SecurityFeature, ...SecurityFeature[]])),
    accessInstructions: z.string().trim().max(1000, "Access instructions must be at most 1000 characters"),
    ownerDeclaration: z.literal(true, { error: "You must confirm you own or are authorized to offer this space" }),
    permissionStatus: z.enum(["obtained", "not_required"], { error: "Confirm the property/community permission status" }),
    permissionNotes: z.string().trim().max(500, "Notes must be at most 500 characters"),
  })
  .superRefine((v, ctx) => {
    if (!v.access24h) {
      if (!v.availableFrom) ctx.addIssue({ code: "custom", path: ["availableFrom"], message: "Set a start time or choose 24-hour access" });
      if (!v.availableTo) ctx.addIssue({ code: "custom", path: ["availableTo"], message: "Set an end time or choose 24-hour access" });
      if (v.availableFrom && v.availableTo && v.availableFrom === v.availableTo) {
        ctx.addIssue({ code: "custom", path: ["availableTo"], message: "End time must differ from start time" });
      }
    }
  });

export type ListingFieldName = keyof ListingFormValues;

export const WIZARD_STEPS = [
  { id: "basics", title: "Basics", fields: ["title", "description", "vehicleTypes", "coverType"] },
  { id: "location", title: "Location", fields: ["addressLine", "locality", "city", "postalCode", "latitude", "longitude", "locationPrivacy", "showAddressPublicly", "publicLandmark"] },
  { id: "photos", title: "Photos", fields: [] },
  { id: "pricing", title: "Price & availability", fields: ["rentalType", "priceInr", "minDuration", "depositInr", "availableDays", "access24h", "availableFrom", "availableTo", "overnightAllowed"] },
  { id: "rules", title: "Rules & access", fields: ["maxHeightM", "maxLengthM", "vehicleRestrictions", "securityFeatures", "accessInstructions"] },
  { id: "review", title: "Review & publish", fields: ["ownerDeclaration", "permissionStatus", "permissionNotes"] },
] as const satisfies readonly { id: string; title: string; fields: readonly ListingFieldName[] }[];

export type FieldErrors = Partial<Record<ListingFieldName, string>>;

function isFilled(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return v === true;
}

/** Strict validation, optionally restricted to a subset of fields (used per wizard step). */
export function validateListing(values: ListingFormValues, only?: readonly ListingFieldName[]): FieldErrors {
  const res = listingFormSchema.safeParse(values);
  if (res.success) return {};
  const errors: FieldErrors = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0]) as ListingFieldName;
    if (only && !only.includes(key)) continue;
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** Drafts may be incomplete, but whatever *is* filled in must be well-formed. */
export function validateDraft(values: ListingFormValues): FieldErrors {
  const errors = validateListing(values);
  const out: FieldErrors = {};
  for (const [k, msg] of Object.entries(errors) as [ListingFieldName, string][]) {
    if (isFilled(values[k])) out[k] = msg;
  }
  // The title is the one thing a draft always needs so it can be found in the dashboard.
  if (!values.title.trim()) out.title = "Title is required";
  return out;
}

export type ListingPayload = {
  listing: Record<string, unknown>;
  details: { address_line: string | null; exact_latitude: number | null; exact_longitude: number | null; access_instructions: string | null };
};

const nullIfEmpty = (s: string) => (s.trim() === "" ? null : s.trim());
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

/** Maps form values to DB columns. Public coordinates are NOT included: the database computes them. */
export function toPayload(v: ListingFormValues): ListingPayload {
  return {
    listing: {
      title: v.title.trim(),
      description: v.description.trim(),
      vehicle_types: v.vehicleTypes,
      cover_type: v.coverType || null,
      public_landmark: nullIfEmpty(v.publicLandmark),
      locality: nullIfEmpty(v.locality),
      city: v.city,
      postal_code: nullIfEmpty(v.postalCode),
      location_privacy: v.locationPrivacy,
      show_address_publicly: v.showAddressPublicly,
      rental_type: v.rentalType || null,
      price_inr: numOrNull(v.priceInr),
      min_duration: numOrNull(v.minDuration),
      deposit_inr: numOrNull(v.depositInr) ?? 0,
      available_days: [...v.availableDays].sort((a, b) => a - b),
      available_from: v.access24h ? null : nullIfEmpty(v.availableFrom),
      available_to: v.access24h ? null : nullIfEmpty(v.availableTo),
      access_24h: v.access24h,
      overnight_allowed: v.overnightAllowed,
      max_height_m: numOrNull(v.maxHeightM),
      max_length_m: numOrNull(v.maxLengthM),
      vehicle_restrictions: nullIfEmpty(v.vehicleRestrictions),
      security_features: v.securityFeatures,
      owner_declaration: v.ownerDeclaration,
      permission_status: v.permissionStatus,
      permission_notes: nullIfEmpty(v.permissionNotes),
    },
    details: {
      address_line: nullIfEmpty(v.addressLine),
      exact_latitude: numOrNull(v.latitude),
      exact_longitude: numOrNull(v.longitude),
      access_instructions: nullIfEmpty(v.accessInstructions),
    },
  };
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const str = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function toFormValues(l: ListingRow, d: PrivateDetailsRow | null): ListingFormValues {
  return {
    title: l.title,
    description: l.description,
    vehicleTypes: l.vehicle_types as VehicleType[],
    coverType: l.cover_type ?? "",
    addressLine: d?.address_line ?? "",
    locality: l.locality ?? "",
    city: (l.city as ListingFormValues["city"]) ?? "Hyderabad",
    postalCode: l.postal_code ?? "",
    latitude: str(d?.exact_latitude),
    longitude: str(d?.exact_longitude),
    locationPrivacy: l.location_privacy,
    showAddressPublicly: l.show_address_publicly,
    publicLandmark: l.public_landmark ?? "",
    rentalType: l.rental_type ?? "",
    priceInr: l.price_inr === null ? "" : String(Number(l.price_inr)),
    minDuration: str(l.min_duration),
    depositInr: String(Number(l.deposit_inr ?? 0)),
    availableDays: l.available_days,
    access24h: l.access_24h,
    availableFrom: hhmm(l.available_from) || "08:00",
    availableTo: hhmm(l.available_to) || "20:00",
    overnightAllowed: l.overnight_allowed,
    maxHeightM: l.max_height_m === null ? "" : String(Number(l.max_height_m)),
    maxLengthM: l.max_length_m === null ? "" : String(Number(l.max_length_m)),
    vehicleRestrictions: l.vehicle_restrictions ?? "",
    securityFeatures: l.security_features as SecurityFeature[],
    accessInstructions: d?.access_instructions ?? "",
    ownerDeclaration: l.owner_declaration,
    permissionStatus: l.permission_status,
    permissionNotes: l.permission_notes ?? "",
  };
}

/** zod schema for the shape of data crossing the server-action boundary (types only; rules re-run server-side). */
export const listingFormShapeSchema = z.object({
  title: z.string(), description: z.string(), vehicleTypes: z.array(z.string()), coverType: z.string(),
  addressLine: z.string(), locality: z.string(), city: z.string(), postalCode: z.string(),
  latitude: z.string(), longitude: z.string(), locationPrivacy: z.string(), showAddressPublicly: z.boolean(),
  publicLandmark: z.string(), rentalType: z.string(), priceInr: z.string(), minDuration: z.string(), depositInr: z.string(),
  availableDays: z.array(z.number()), access24h: z.boolean(), availableFrom: z.string(), availableTo: z.string(),
  overnightAllowed: z.boolean(), maxHeightM: z.string(), maxLengthM: z.string(), vehicleRestrictions: z.string(),
  securityFeatures: z.array(z.string()), accessInstructions: z.string(), ownerDeclaration: z.boolean(),
  permissionStatus: z.string(), permissionNotes: z.string(),
});
