import { describe, it, expect } from "vitest";
import { getCountryOptions, maskPhone, parsePhone, DEFAULT_COUNTRY } from "@/lib/auth/phone";
import { safeNextPath } from "@/lib/auth/redirect";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { describeOtpSendError } from "@/lib/auth/otp";
import { friendlyDbError } from "@/lib/errors";
import { otpCodeSchema, profileSchema, reportSchema, validatePhotoFile, buildPhotoPath, photoExtension } from "@/lib/validation/misc";
import { circlePolygon, haversineKm, isInRegion, snapCoordinate } from "@/lib/map";
import { formatDistance, formatRadius } from "@/lib/domain/format";

describe("phone numbers", () => {
  it("defaults to India (+91) and lists it first", () => {
    expect(DEFAULT_COUNTRY).toBe("IN");
    const opts = getCountryOptions();
    expect(opts[0]).toMatchObject({ code: "IN", dial: "+91" });
    expect(opts.length).toBeGreaterThan(200);
  });
  it("normalises valid Indian mobiles to E.164", () => {
    for (const input of ["98765 43210", "09876543210", "+91 98765 43210", "(98765) 43210"]) {
      expect(parsePhone("IN", input)).toEqual({ ok: true, e164: "+919876543210", country: "IN" });
    }
  });
  it("rejects invalid, empty and non-numeric input", () => {
    for (const input of ["", "12345", "98765", "abcdefghij", "0000000000", "98765 43210 999"]) {
      expect(parsePhone("IN", input).ok, input).toBe(false);
    }
    expect(parsePhone("ZZ", "9876543210").ok).toBe(false);
  });
  it("rejects landline numbers", () => {
    expect(parsePhone("IN", "040 2345 6789").ok).toBe(false);
  });
  it("accepts other countries via the country selector", () => {
    expect(parsePhone("GB", "07911 123456")).toMatchObject({ ok: true, e164: "+447911123456" });
    expect(parsePhone("US", "(415) 555-2671")).toMatchObject({ ok: true, e164: "+14155552671" });
  });
  it("masks phone numbers", () => {
    expect(maskPhone("+919876543210")).toBe("+91 ••••• •3210");
    expect(maskPhone(null)).toBe("Not set");
    expect(maskPhone("+919876543210")).not.toContain("98765");
  });
  it("validates OTP codes", () => {
    expect(otpCodeSchema.safeParse("123456").success).toBe(true);
    expect(otpCodeSchema.safeParse(" 123456 ").success).toBe(true);
    for (const bad of ["12", "abcdef", "12 34 56", "", "12345678901"]) expect(otpCodeSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe("safe redirects", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNextPath("/dashboard/listings?x=1")).toBe("/dashboard/listings?x=1");
    for (const evil of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "http://localhost/..", "\u0000/x", undefined, 42]) {
      expect(safeNextPath(evil as never), String(evil)).toBe("/dashboard");
    }
    expect(safeNextPath("//evil.com", "/")).toBe("/");
  });
});

describe("rate limiter", () => {
  it("allows up to max hits per window, then reports retry-after, then recovers", () => {
    let now = 0;
    const rl = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });
    expect(rl.consume("a")).toEqual({ allowed: true });
    expect(rl.consume("a")).toEqual({ allowed: true });
    now = 10_000;
    expect(rl.consume("a")).toEqual({ allowed: false, retryAfterSeconds: 50 });
    expect(rl.consume("b")).toEqual({ allowed: true });
    now = 61_000;
    expect(rl.consume("a")).toEqual({ allowed: true });
  });
  it("does not count rejected attempts against the window and supports reset", () => {
    let now = 0;
    const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => now });
    rl.consume("k");
    for (let i = 0; i < 5; i++) expect(rl.consume("k").allowed).toBe(false);
    now = 1001;
    expect(rl.consume("k").allowed).toBe(true);
    rl.reset("k");
    expect(rl.consume("k").allowed).toBe(true);
  });
  it("bounds memory", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 3 });
    for (let i = 0; i < 10; i++) rl.consume(`k${i}`);
    expect(rl.consume("k0").allowed).toBe(true); // evicted long ago
  });
});

describe("OTP provider error mapping never claims a send", () => {
  it.each([
    [{ code: "over_sms_send_rate_limit", status: 429 }, "rate_limit"],
    [{ code: "phone_provider_disabled", message: "Unsupported phone provider" }, "setup"],
    [{ code: "sms_send_failed", message: "Twilio error" }, "provider"],
    [{ message: "something unexpected" }, "provider"],
  ])("%j -> %s", (err, kind) => {
    const s = describeOtpSendError(err);
    expect(s.status).toBe("error");
    expect(s).toMatchObject({ kind });
  });
});

describe("database error messages", () => {
  it("maps trigger codes to friendly text", () => {
    expect(friendlyDbError({ message: "slot_taken" })).toMatch(/already taken/);
    expect(friendlyDbError({ message: "own_listing" })).toMatch(/own listing/);
    expect(friendlyDbError({ message: "invalid_status_transition: declined -> accepted by owner" })).toMatch(/isn't allowed/);
    expect(friendlyDbError({ message: "publish_validation: title (min 5 characters), at least one photo" })).toMatch(/Fix these before publishing: title/);
  });
  it("maps permission and constraint errors without leaking internals", () => {
    expect(friendlyDbError({ code: "42501", message: 'new row violates row-level security policy for table "x"' })).toMatch(/permission/);
    expect(friendlyDbError({ code: "23514", message: 'violates check constraint "secret_name"' })).not.toContain("secret_name");
    expect(friendlyDbError(null)).toMatch(/Something went wrong/);
  });
});

describe("photo and form helpers", () => {
  it("enforces type, size and count limits", () => {
    expect(validatePhotoFile({ type: "image/jpeg", size: 1000 }, 0)).toBeNull();
    expect(validatePhotoFile({ type: "image/png", size: 5 * 1024 * 1024 }, 9)).toBeNull();
    expect(validatePhotoFile({ type: "image/gif", size: 1000 }, 0)).toMatch(/JPEG, PNG or WebP/);
    expect(validatePhotoFile({ type: "image/svg+xml", size: 1000 }, 0)).toMatch(/JPEG/);
    expect(validatePhotoFile({ type: "application/pdf", size: 1000 }, 0)).toMatch(/JPEG/);
    expect(validatePhotoFile({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }, 0)).toMatch(/smaller than 5 MB/);
    expect(validatePhotoFile({ type: "image/jpeg", size: 0 }, 0)).toMatch(/empty/);
    expect(validatePhotoFile({ type: "image/jpeg", size: 1000 }, 10)).toMatch(/at most 10/);
  });
  it("builds storage paths that match the bucket policy layout", () => {
    const p = buildPhotoPath("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "image/webp", "abc");
    expect(p).toBe("11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/abc.webp");
    expect(buildPhotoPath("u", "l", "image/gif")).toBeNull();
    expect(photoExtension("image/jpeg")).toBe("jpg");
  });
  it("validates profile and report payloads", () => {
    expect(profileSchema.safeParse({ displayName: "A", email: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "Asha", email: "not-an-email" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "Asha", email: "asha@example.com" }).success).toBe(true);
    expect(profileSchema.safeParse({ displayName: "Asha", email: "" }).success).toBe(true);
    expect(reportSchema.safeParse({ listingId: "x", reason: "scam", details: "" }).success).toBe(false);
    expect(reportSchema.safeParse({ listingId: "6f0a3a52-52ef-4a6e-9c52-0d4a2d4b1c11", reason: "nope", details: "" }).success).toBe(false);
    expect(reportSchema.safeParse({ listingId: "6f0a3a52-52ef-4a6e-9c52-0d4a2d4b1c11", reason: "scam", details: "x" }).success).toBe(true);
  });
});

describe("map helpers", () => {
  it("snaps coordinates to the same grid as the database", () => {
    expect(snapCoordinate(17.448612)).toBe(17.449);
    expect(snapCoordinate(17.4491)).toBe(17.449);
    expect(snapCoordinate(78.390871)).toBe(78.391);
    // cells are ~220 m: the snapped point is never further than ~155 m from the real one
    const real = { lat: 17.448612, lng: 78.390871 };
    expect(haversineKm(real, { lat: snapCoordinate(real.lat), lng: snapCoordinate(real.lng) }) * 1000).toBeLessThan(160);
  });
  it("approximates circles and distances", () => {
    const poly = circlePolygon(17.45, 78.39, 300);
    expect(poly.geometry.coordinates[0]).toHaveLength(49);
    const first = poly.geometry.coordinates[0]![0]!;
    expect(haversineKm({ lat: 17.45, lng: 78.39 }, { lat: first[1]!, lng: first[0]! }) * 1000).toBeGreaterThan(280);
    expect(haversineKm({ lat: 17.4435, lng: 78.3772 }, { lat: 17.4401, lng: 78.3489 })).toBeCloseTo(3.0, 0);
  });
  it("knows the Hyderabad region", () => {
    expect(isInRegion(17.4, 78.4)).toBe(true);
    expect(isInRegion(28.6, 77.2)).toBe(false);
  });
});

import { DEMO_LISTINGS, DEMO_OWNERS, DEMO_TITLE_PREFIX, demoEmail } from "../../scripts/demo-data";
import { validateListing } from "@/lib/validation/listing";
import { findLocality } from "@/lib/domain/localities";

describe("demo seed data", () => {
  it("meets the same publish rules as real listings (except photos, which demo listings don't have)", () => {
    for (const d of DEMO_LISTINGS) expect(validateListing(d.values), d.values.title).toEqual({});
  });
  it("is unmistakably fictional: labelled titles, placeholder addresses, reserved email domain, no real residences", () => {
    for (const d of DEMO_LISTINGS) {
      expect(d.values.title.startsWith(DEMO_TITLE_PREFIX)).toBe(true);
      expect(d.values.description).toMatch(/fictional DEMO listing/);
      expect(d.values.addressLine).toMatch(/^Demo address — not a real location/);
      expect(d.values.showAddressPublicly).toBe(false);
      expect(d.values.locationPrivacy).toBe("approximate");
      const centre = findLocality(d.values.locality);
      if (centre) expect(Math.abs(Number(d.values.latitude) - centre.lat)).toBeLessThan(0.03);
    }
    for (const o of DEMO_OWNERS) expect(demoEmail(o.key)).toMatch(/^demo-owner-[a-z]@example\.invalid$/);
  });
  it("covers the requested localities and a mix of rental types, vehicle types and cover", () => {
    const localities = new Set(DEMO_LISTINGS.map((d) => d.values.locality));
    for (const l of ["Madhapur", "Kondapur", "Gachibowli", "Ameerpet"]) expect(localities.has(l), l).toBe(true);
    expect(new Set(DEMO_LISTINGS.map((d) => d.values.rentalType)).size).toBe(3);
    expect(new Set(DEMO_LISTINGS.map((d) => d.values.coverType)).size).toBe(2);
    expect(new Set(DEMO_LISTINGS.map((d) => d.values.title)).size).toBe(DEMO_LISTINGS.length);
  });
});

describe("walking-distance formatting", () => {
  it("shows metres under a kilometre (rounded to 10 m) and kilometres above", () => {
    expect(formatDistance(184)).toBe("~180 m");
    expect(formatDistance(4)).toBe("~10 m");
    expect(formatDistance(999)).toBe("~1000 m");
    expect(formatDistance(1234)).toBe("1.2 km");
  });
  it("formats radii for headings", () => {
    expect(formatRadius(200)).toBe("200 m");
    expect(formatRadius(1000)).toBe("1 km");
    expect(formatRadius(1500)).toBe("1.5 km");
  });
});
