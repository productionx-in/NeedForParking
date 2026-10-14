export const VEHICLE_TYPES = [
  { value: "car", label: "Car" },
  { value: "motorcycle", label: "Motorcycle / scooter" },
  { value: "other", label: "Other vehicle" },
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number]["value"];
export const VEHICLE_VALUES = VEHICLE_TYPES.map((v) => v.value) as [VehicleType, ...VehicleType[]];

export const COVER_TYPES = [
  { value: "covered", label: "Covered" },
  { value: "open", label: "Open" },
] as const;
export type CoverType = (typeof COVER_TYPES)[number]["value"];

export const RENTAL_TYPES = [
  { value: "hourly", label: "Hourly", unit: "hour", unitPlural: "hours", per: "/ hr" },
  { value: "daily", label: "Daily", unit: "day", unitPlural: "days", per: "/ day" },
  { value: "monthly", label: "Monthly", unit: "month", unitPlural: "months", per: "/ month" },
] as const;
export type RentalType = (typeof RENTAL_TYPES)[number]["value"];

export const SECURITY_FEATURES = [
  { value: "cctv", label: "CCTV" },
  { value: "security_guard", label: "Security guard" },
  { value: "gated", label: "Gated / boom barrier" },
  { value: "well_lit", label: "Well lit at night" },
  { value: "intercom", label: "Intercom / visitor check" },
  { value: "ev_charging", label: "EV charging" },
] as const;
export type SecurityFeature = (typeof SECURITY_FEATURES)[number]["value"];

export const DAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
] as const;

export const LISTING_STATUSES = ["draft", "published", "paused", "removed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const REQUEST_STATUSES = ["pending", "accepted", "declined", "cancelled", "completed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PERMISSION_STATUSES = [
  { value: "obtained", label: "I have obtained the required permission (owner / society / landlord)" },
  { value: "not_required", label: "No additional permission is required for this space" },
  { value: "unconfirmed", label: "Not confirmed yet" },
] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number]["value"];

export const REPORT_REASONS = [
  { value: "inaccurate", label: "Inaccurate or misleading details" },
  { value: "scam", label: "Looks like a scam" },
  { value: "unsafe", label: "Unsafe space" },
  { value: "not_authorized", label: "Owner may not be authorized to offer this space" },
  { value: "abusive", label: "Abusive or inappropriate content" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Rough bounding box for the Hyderabad region (matches the database CHECK constraints). */
export const REGION_BOUNDS = { minLat: 16.9, maxLat: 17.9, minLng: 78.0, maxLng: 79.0 } as const;
export const HYDERABAD_CENTER = { lat: 17.385, lng: 78.4867 } as const;

export const PROJECT_LABEL = "Parking Research Prototype";
