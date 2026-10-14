import { describe, it, expect } from "vitest";
import {
  EMPTY_LISTING_FORM, WIZARD_STEPS, toFormValues, toPayload, validateDraft, validateListing, type ListingFormValues,
} from "@/lib/validation/listing";
import type { ListingRow } from "@/lib/types";

const valid: ListingFormValues = {
  ...EMPTY_LISTING_FORM,
  title: "Covered bay near Inorbit",
  description: "A covered car parking bay in a gated community, available on weekdays.",
  vehicleTypes: ["car"],
  coverType: "covered",
  addressLine: "Fictional Towers, Test Road",
  locality: "Madhapur",
  postalCode: "500081",
  latitude: "17.4486",
  longitude: "78.3908",
  rentalType: "monthly",
  priceInr: "3500",
  minDuration: "1",
  ownerDeclaration: true,
  permissionStatus: "obtained",
};

describe("listing form validation", () => {
  it("accepts a complete, valid listing", () => {
    expect(validateListing(valid)).toEqual({});
  });

  it("reports every missing mandatory field on an empty form", () => {
    const errors = validateListing(EMPTY_LISTING_FORM);
    for (const f of ["title", "description", "vehicleTypes", "coverType", "addressLine", "locality", "postalCode", "latitude", "longitude", "rentalType", "priceInr", "ownerDeclaration", "permissionStatus"] as const) {
      expect(errors[f], f).toBeTruthy();
    }
  });

  it.each([
    ["title too short", { title: "abc" }, "title"],
    ["title too long", { title: "x".repeat(121) }, "title"],
    ["description too short", { description: "too short" }, "description"],
    ["no vehicle types", { vehicleTypes: [] }, "vehicleTypes"],
    ["bad PIN (5 digits)", { postalCode: "50008" }, "postalCode"],
    ["bad PIN (leading zero)", { postalCode: "050081" }, "postalCode"],
    ["bad PIN (letters)", { postalCode: "5000AB" }, "postalCode"],
    ["latitude outside Hyderabad", { latitude: "28.6" }, "latitude"],
    ["longitude outside Hyderabad", { longitude: "72.8" }, "longitude"],
    ["non-numeric latitude", { latitude: "abc" }, "latitude"],
    ["zero price", { priceInr: "0" }, "priceInr"],
    ["negative price", { priceInr: "-5" }, "priceInr"],
    ["price with 3 decimals", { priceInr: "10.123" }, "priceInr"],
    ["absurd price", { priceInr: "99999999" }, "priceInr"],
    ["non-integer minimum duration", { minDuration: "1.5" }, "minDuration"],
    ["zero minimum duration", { minDuration: "0" }, "minDuration"],
    ["negative deposit", { depositInr: "-1" }, "depositInr"],
    ["no available days", { availableDays: [] }, "availableDays"],
    ["missing start time", { access24h: false, availableFrom: "" }, "availableFrom"],
    ["start equals end time", { access24h: false, availableFrom: "09:00", availableTo: "09:00" }, "availableTo"],
    ["bad time format", { availableFrom: "9am" }, "availableFrom"],
    ["height limit too large", { maxHeightM: "9" }, "maxHeightM"],
    ["declaration not ticked", { ownerDeclaration: false }, "ownerDeclaration"],
    ["permission unconfirmed", { permissionStatus: "unconfirmed" as const }, "permissionStatus"],
  ] as [string, Partial<ListingFormValues>, keyof ListingFormValues][])("rejects: %s", (_name, patch, field) => {
    const errors = validateListing({ ...valid, ...patch });
    expect(errors[field]).toBeTruthy();
  });

  it("allows a wrap-around night window (20:00-07:00) and 24-hour access without times", () => {
    expect(validateListing({ ...valid, availableFrom: "20:00", availableTo: "07:00" })).toEqual({});
    expect(validateListing({ ...valid, access24h: true, availableFrom: "", availableTo: "" })).toEqual({});
  });

  it("validates a single wizard step in isolation", () => {
    const basics = WIZARD_STEPS[0].fields;
    expect(validateListing(EMPTY_LISTING_FORM, basics)).toMatchObject({ title: expect.any(String), description: expect.any(String) });
    expect(Object.keys(validateListing(EMPTY_LISTING_FORM, basics)).every((k) => (basics as readonly string[]).includes(k))).toBe(true);
    expect(validateListing(valid, basics)).toEqual({});
  });
});

describe("draft validation", () => {
  it("allows incomplete drafts but needs a title", () => {
    expect(validateDraft({ ...EMPTY_LISTING_FORM, title: "My draft title" })).toEqual({});
    expect(validateDraft(EMPTY_LISTING_FORM)).toEqual({ title: "Title is required" });
  });
  it("still rejects malformed values that were filled in", () => {
    const e = validateDraft({ ...EMPTY_LISTING_FORM, title: "My draft title", postalCode: "12", priceInr: "-3", latitude: "99" });
    expect(Object.keys(e).sort()).toEqual(["latitude", "postalCode", "priceInr"]);
  });
});

describe("payload mapping", () => {
  it("converts form strings to typed DB values and splits private details", () => {
    const { listing, details } = toPayload({ ...valid, depositInr: "", maxHeightM: "2.1", availableDays: [5, 1, 3], access24h: true });
    expect(listing).toMatchObject({ price_inr: 3500, min_duration: 1, deposit_inr: 0, max_height_m: 2.1, max_length_m: null, available_days: [1, 3, 5], available_from: null, available_to: null, cover_type: "covered" });
    expect(details).toEqual({ address_line: "Fictional Towers, Test Road", exact_latitude: 17.4486, exact_longitude: 78.3908, access_instructions: null });
  });

  it("never sends coordinates, address, status or moderation fields in the public listing payload", () => {
    const { listing } = toPayload(valid);
    for (const forbidden of ["latitude", "longitude", "address_line", "public_address", "status", "moderation_status", "owner_id", "is_demo", "published_at"]) {
      expect(listing).not.toHaveProperty(forbidden);
    }
  });

  it("round-trips through toFormValues", () => {
    const row = {
      title: valid.title, description: valid.description, vehicle_types: ["car"], cover_type: "covered", public_landmark: null,
      locality: "Madhapur", city: "Hyderabad", postal_code: "500081", location_privacy: "approximate", show_address_publicly: false,
      rental_type: "monthly", price_inr: "3500.00", min_duration: 1, deposit_inr: "0.00", available_days: [1, 2, 3, 4, 5],
      available_from: "08:00:00", available_to: "20:00:00", access_24h: false, overnight_allowed: false, max_height_m: null,
      max_length_m: null, vehicle_restrictions: null, security_features: [], owner_declaration: true, permission_status: "obtained", permission_notes: null,
    } as unknown as ListingRow;
    const form = toFormValues(row, { listing_id: "x", address_line: valid.addressLine, exact_latitude: 17.4486, exact_longitude: 78.3908, access_instructions: null });
    expect(form.priceInr).toBe("3500");
    expect(form.availableFrom).toBe("08:00");
    expect(validateListing(form)).toEqual({});
  });
});
