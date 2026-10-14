import type { CoverType, ListingStatus, RentalType, RequestStatus } from "@/lib/domain/constants";

export type ListingRow = {
  id: string;
  owner_id: string;
  status: ListingStatus;
  moderation_status: "ok" | "suspended";
  moderation_note: string | null;
  title: string;
  description: string;
  vehicle_types: string[];
  cover_type: CoverType | null;
  public_landmark: string | null;
  locality: string | null;
  city: string;
  postal_code: string | null;
  location_privacy: "approximate" | "exact";
  show_address_publicly: boolean;
  latitude: number | null;
  longitude: number | null;
  public_address: string | null;
  rental_type: RentalType | null;
  price_inr: number | string | null;
  min_duration: number | null;
  deposit_inr: number | string;
  available_days: number[];
  available_from: string | null;
  available_to: string | null;
  access_24h: boolean;
  overnight_allowed: boolean;
  max_height_m: number | string | null;
  max_length_m: number | string | null;
  vehicle_restrictions: string | null;
  security_features: string[];
  owner_declaration: boolean;
  permission_status: "unconfirmed" | "not_required" | "obtained";
  permission_notes: string | null;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateDetailsRow = {
  listing_id: string;
  address_line: string | null;
  exact_latitude: number | null;
  exact_longitude: number | null;
  access_instructions: string | null;
};

export type PhotoRow = { id: string; listing_id: string; storage_path: string; position: number };

export type SearchRow = {
  id: string;
  title: string;
  locality: string | null;
  city: string;
  vehicle_types: string[];
  cover_type: CoverType | null;
  rental_type: RentalType | null;
  price_inr: number | string | null;
  min_duration: number | null;
  deposit_inr: number | string;
  available_days: number[];
  available_from: string | null;
  available_to: string | null;
  access_24h: boolean;
  overnight_allowed: boolean;
  latitude: number | null;
  longitude: number | null;
  location_privacy: "approximate" | "exact";
  is_demo: boolean;
  created_at: string;
  cover_photo_path: string | null;
  is_open_now: boolean;
  distance_m: number | null;
  total_count: number | string;
};

export type RequestRow = {
  id: string;
  listing_id: string;
  status: RequestStatus;
  schedule_type: "one_time" | "recurring";
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  recurring_days: number[] | null;
  vehicle_type: string;
  message: string;
  owner_response: string | null;
  responded_at: string | null;
  created_at: string;
  listing_title: string;
  listing_locality: string | null;
  listing_status: ListingStatus;
  listing_is_demo: boolean;
  other_party_name: string;
};

export type ProfileRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: "user" | "admin";
  account_status: "active" | "suspended";
  suspension_reason: string | null;
  created_at: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
