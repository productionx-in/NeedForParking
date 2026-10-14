import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers";

const state: { supabase: ReturnType<typeof fakeSupabase>; user: { id: string; phone: string | null; phoneVerified: boolean } | null; configured: boolean } = {
  supabase: fakeSupabase(),
  user: null,
  configured: true,
};

vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), isSupabaseConfigured: () => state.configured }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.supabase.client, getOptionalClient: async () => state.supabase.client }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => state.user }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }), cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LISTING = "33333333-3333-4333-8333-333333333333";

function signedIn(verified = true) {
  state.user = { id: USER, phone: "+919876543210", phoneVerified: verified };
}
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
let phoneSeq = 0;
const freshPhone = () => `9${String(800000000 + ++phoneSeq * 7919).padStart(9, "0")}`; // distinct valid-looking IN mobiles

beforeEach(() => {
  state.user = null;
  state.configured = true;
  state.supabase = fakeSupabase();
});

describe("OTP request action", () => {
  it("shows a setup error — and sends nothing — when Supabase isn't configured", async () => {
    state.configured = false;
    const { requestOtpAction } = await import("@/app/actions/auth");
    const res = await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: "9876543210" }));
    expect(res).toMatchObject({ status: "error", kind: "setup" });
    expect(state.supabase.client.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects invalid numbers before calling the provider", async () => {
    const { requestOtpAction } = await import("@/app/actions/auth");
    const res = await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: "12345" }));
    expect(res).toMatchObject({ status: "error", kind: "validation" });
    expect(state.supabase.client.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("reports 'sent' only after the provider accepts, using the E.164 number", async () => {
    const { requestOtpAction } = await import("@/app/actions/auth");
    const p = freshPhone();
    const res = await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: p }));
    expect(res.status).toBe("sent");
    expect(state.supabase.client.auth.signInWithOtp).toHaveBeenCalledWith({ phone: `+91${p}`, options: { channel: "sms" } });
    if (res.status === "sent") expect(res.maskedPhone).not.toContain(p);
  });

  it("does NOT claim a code was sent when the SMS provider fails", async () => {
    state.supabase = fakeSupabase({ auth: { signInWithOtp: vi.fn(async () => ({ data: {}, error: { code: "sms_send_failed", message: "Twilio: invalid sender" } })) } });
    const { requestOtpAction } = await import("@/app/actions/auth");
    const res = await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: freshPhone() }));
    expect(res.status).toBe("error");
    expect(JSON.stringify(res)).toMatch(/No code was sent/);
  });

  it("surfaces provider-disabled as a setup problem", async () => {
    state.supabase = fakeSupabase({ auth: { signInWithOtp: vi.fn(async () => ({ data: {}, error: { code: "phone_provider_disabled", message: "Unsupported phone provider" } })) } });
    const { requestOtpAction } = await import("@/app/actions/auth");
    const res = await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: freshPhone() }));
    expect(res).toMatchObject({ status: "error", kind: "setup" });
  });

  it("rate-limits repeat requests for the same number (resend cooldown) without hitting the provider", async () => {
    const { requestOtpAction } = await import("@/app/actions/auth");
    const p = freshPhone();
    await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: p }));
    const second = await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: p }));
    expect(second).toMatchObject({ status: "error", kind: "rate_limit" });
    expect(state.supabase.client.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("limits how many numbers one IP can text in an hour", async () => {
    const { requestOtpAction } = await import("@/app/actions/auth");
    const results = [];
    for (let i = 0; i < 20; i++) results.push(await requestOtpAction({ status: "idle" }, form({ country: "IN", phone: freshPhone() })));
    expect(results.some((r) => r.status === "error" && r.kind === "rate_limit")).toBe(true);
    expect(state.supabase.client.auth.signInWithOtp.mock.calls.length).toBeLessThan(20);
  });
});

describe("OTP verify action", () => {
  it("keeps the user on the code step with a clear error for a wrong code", async () => {
    state.supabase = fakeSupabase({ auth: { verifyOtp: vi.fn(async () => ({ data: {}, error: { code: "otp_expired", message: "Token has expired or is invalid" } })) } });
    const { verifyOtpAction } = await import("@/app/actions/auth");
    const res = await verifyOtpAction({ status: "idle" }, form({ phone: "+919812345670", token: "000000", next: "" }));
    expect(res.status).toBe("sent");
    expect(res.status === "sent" && res.message).toMatch(/incorrect or has expired/);
  });

  it("rejects non-numeric codes locally", async () => {
    const { verifyOtpAction } = await import("@/app/actions/auth");
    const res = await verifyOtpAction({ status: "idle" }, form({ phone: "+919812345671", token: "abcdef", next: "" }));
    expect(res.status).toBe("sent");
    expect(state.supabase.client.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("locks out after repeated wrong codes", async () => {
    state.supabase = fakeSupabase({ auth: { verifyOtp: vi.fn(async () => ({ data: {}, error: { code: "otp_expired", message: "invalid" } })) } });
    const { verifyOtpAction } = await import("@/app/actions/auth");
    let last;
    for (let i = 0; i < 10; i++) last = await verifyOtpAction({ status: "idle" }, form({ phone: "+919812345672", token: "111111", next: "" }));
    expect(last).toMatchObject({ status: "error", kind: "rate_limit" });
    expect(state.supabase.client.auth.verifyOtp.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("redirects only to safe same-site paths after success", async () => {
    const { verifyOtpAction } = await import("@/app/actions/auth");
    await expect(verifyOtpAction({ status: "idle" }, form({ phone: "+919812345673", token: "123456", next: "/listings/abc" }))).rejects.toThrow("NEXT_REDIRECT:/listings/abc");
    await expect(verifyOtpAction({ status: "idle" }, form({ phone: "+919812345674", token: "123456", next: "https://evil.example" }))).rejects.toThrow(/NEXT_REDIRECT:\/dashboard/);
  });
});

describe("unauthenticated access to mutations", () => {
  it.each([
    ["createRequestAction", async () => (await import("@/app/actions/requests")).createRequestAction({})],
    ["respondToRequestAction", async () => (await import("@/app/actions/requests")).respondToRequestAction({})],
    ["cancelRequestAction", async () => (await import("@/app/actions/requests")).cancelRequestAction(LISTING)],
    ["saveListingAction", async () => (await import("@/app/actions/listings")).saveListingAction({ id: null, values: {} })],
    ["publishListingAction", async () => (await import("@/app/actions/listings")).publishListingAction(LISTING)],
    ["setListingStatusAction", async () => (await import("@/app/actions/listings")).setListingStatusAction(LISTING, "paused")],
    ["registerPhotoAction", async () => (await import("@/app/actions/listings")).registerPhotoAction({ listingId: LISTING, path: `${USER}/${LISTING}/a.jpg` })],
    ["deletePhotoAction", async () => (await import("@/app/actions/listings")).deletePhotoAction(LISTING)],
    ["toggleFavoriteAction", async () => (await import("@/app/actions/engagement")).toggleFavoriteAction(LISTING, true)],
    ["reportListingAction", async () => (await import("@/app/actions/engagement")).reportListingAction({})],
    ["updateProfileAction", async () => (await import("@/app/actions/profile")).updateProfileAction(null, form({ displayName: "Asha", email: "" }))],
    ["setListingModerationAction", async () => (await import("@/app/actions/admin")).setListingModerationAction({ id: LISTING, status: "suspended", note: "" })],
  ])("%s refuses visitors and touches no data", async (_n, run) => {
    const res = await run();
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/sign in/i) });
    expect(state.supabase.calls).toHaveLength(0);
  });
});

describe("booking request action", () => {
  const input = { listingId: LISTING, scheduleType: "one_time", startDate: "2099-01-10", endDate: "2099-01-11", startTime: "", endTime: "", recurringDays: [], vehicleType: "car", message: "Hello, could I use this space?" };

  it("requires a verified phone", async () => {
    signedIn(false);
    const { createRequestAction } = await import("@/app/actions/requests");
    expect(await createRequestAction(input)).toMatchObject({ ok: false });
    expect(state.supabase.callsFor("booking_requests", "insert")).toHaveLength(0);
  });

  it("returns field errors for invalid input without touching the database", async () => {
    signedIn();
    const { createRequestAction } = await import("@/app/actions/requests");
    const res = await createRequestAction({ ...input, endDate: "2099-01-01", message: "x" });
    expect(res).toMatchObject({ ok: false, fieldErrors: { endDate: expect.any(String), message: expect.any(String) } });
    expect(state.supabase.callsFor("booking_requests", "insert")).toHaveLength(0);
  });

  it("always stamps the authenticated user as requester, ignoring any id the browser sends", async () => {
    signedIn();
    state.supabase = fakeSupabase({ results: { booking_requests: { insert: { data: [{ id: "r1" }], error: null } } } });
    const { createRequestAction } = await import("@/app/actions/requests");
    const res = await createRequestAction({ ...input, requester_id: OTHER, requesterId: OTHER, status: "accepted" });
    expect(res.ok).toBe(true);
    const [call] = state.supabase.callsFor("booking_requests", "insert");
    expect(call!.args[0]).toMatchObject({ requester_id: USER, status: "pending", listing_id: LISTING });
    expect(JSON.stringify(call!.args[0])).not.toContain(OTHER);
  });

  it("turns database rejections (own listing, overlap) into friendly messages", async () => {
    signedIn();
    for (const [code, re] of [["own_listing", /own listing/], ["slot_taken", /already taken/], ["past_date", /past/]] as const) {
      state.supabase = fakeSupabase({ results: { booking_requests: { insert: { data: null, error: { message: code, code: "P0001" } } } } });
      const { createRequestAction } = await import("@/app/actions/requests");
      const res = await createRequestAction(input);
      expect(res).toMatchObject({ ok: false, error: expect.stringMatching(re) });
    }
  });

  it("reports not-found/forbidden when an update touches no rows (e.g. someone else's request)", async () => {
    signedIn();
    state.supabase = fakeSupabase({ results: { booking_requests: { update: { data: [], error: null } } } });
    const { respondToRequestAction, cancelRequestAction } = await import("@/app/actions/requests");
    expect(await respondToRequestAction({ requestId: LISTING, decision: "accepted", response: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });
    expect(await cancelRequestAction(LISTING)).toMatchObject({ ok: false });
  });

  it("rejects an invalid decision", async () => {
    signedIn();
    const { respondToRequestAction } = await import("@/app/actions/requests");
    expect(await respondToRequestAction({ requestId: LISTING, decision: "completed", response: "" })).toMatchObject({ ok: false });
    expect(state.supabase.callsFor("booking_requests", "update")).toHaveLength(0);
  });
});

describe("listing actions enforce ownership", () => {
  const values = {
    title: "My draft listing", description: "", vehicleTypes: [], coverType: "", addressLine: "", locality: "", city: "Hyderabad", postalCode: "", latitude: "", longitude: "",
    locationPrivacy: "approximate", showAddressPublicly: false, publicLandmark: "", rentalType: "", priceInr: "", minDuration: "1", depositInr: "0", availableDays: [1], access24h: false,
    availableFrom: "08:00", availableTo: "20:00", overnightAllowed: false, maxHeightM: "", maxLengthM: "", vehicleRestrictions: "", securityFeatures: [], accessInstructions: "",
    ownerDeclaration: false, permissionStatus: "unconfirmed", permissionNotes: "",
  };

  it("scopes updates to the signed-in owner and never sends owner_id/status/coordinates", async () => {
    signedIn();
    state.supabase = fakeSupabase({ results: { parking_listings: { update: { data: [{ id: LISTING }], error: null } }, listing_private_details: { update: { data: [{ listing_id: LISTING }], error: null } } } });
    const { saveListingAction } = await import("@/app/actions/listings");
    const res = await saveListingAction({ id: LISTING, values });
    expect(res).toMatchObject({ ok: true, data: { id: LISTING } });
    const calls = state.supabase.calls.filter((c) => c.table === "parking_listings");
    expect(calls.find((c) => c.op === "eq" && c.args[0] === "owner_id")?.args[1]).toBe(USER);
    const payload = state.supabase.callsFor("parking_listings", "update")[0]!.args[0] as Record<string, unknown>;
    for (const k of ["owner_id", "status", "latitude", "longitude", "moderation_status", "is_demo"]) expect(payload).not.toHaveProperty(k);
  });

  it("reports failure when the listing isn't the caller's (0 rows updated)", async () => {
    signedIn();
    state.supabase = fakeSupabase({ results: { parking_listings: { update: { data: [], error: null } } } });
    const { saveListingAction } = await import("@/app/actions/listings");
    expect(await saveListingAction({ id: LISTING, values })).toMatchObject({ ok: false, error: expect.stringMatching(/not found|permission/i) });
    expect(state.supabase.callsFor("listing_private_details", "update")).toHaveLength(0);
  });

  it("creates new drafts owned by the session user", async () => {
    signedIn();
    state.supabase = fakeSupabase({ results: { parking_listings: { insert: { data: [{ id: LISTING }], error: null } }, listing_private_details: { update: { data: [], error: null }, insert: { data: [], error: null } } } });
    const { saveListingAction } = await import("@/app/actions/listings");
    const res = await saveListingAction({ id: null, values: { ...values, ownerId: OTHER, owner_id: OTHER } });
    expect(res.ok).toBe(true);
    const row = state.supabase.callsFor("parking_listings", "insert")[0]!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ owner_id: USER, status: "draft" });
    expect(JSON.stringify(row)).not.toContain(OTHER);
  });

  it("refuses to publish when mandatory fields are missing, before touching status", async () => {
    signedIn();
    state.supabase = fakeSupabase({ results: { parking_listings: { select: { data: [{ id: LISTING, owner_id: USER, status: "draft", moderation_status: "ok", title: "x", description: "", vehicle_types: [], available_days: [], security_features: [], location_privacy: "approximate", city: "Hyderabad", deposit_inr: 0, permission_status: "unconfirmed", owner_declaration: false, is_demo: false, show_address_publicly: false, access_24h: false, overnight_allowed: false }], error: null } }, listing_private_details: { select: { data: [], error: null } }, listing_photos: { select: { data: [], error: null, count: 0 } } } });
    const { publishListingAction } = await import("@/app/actions/listings");
    const res = await publishListingAction(LISTING);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Complete these before publishing/), fieldErrors: { photos: expect.any(String) } });
    expect(state.supabase.callsFor("parking_listings", "update")).toHaveLength(0);
  });

  it("rejects photo registration for paths outside the caller's own listing folder", async () => {
    signedIn();
    const { registerPhotoAction } = await import("@/app/actions/listings");
    for (const path of [`${OTHER}/${LISTING}/a.jpg`, `${USER}/${OTHER}/a.jpg`, `${USER}/${LISTING}/sub/a.jpg`, `../${USER}/${LISTING}/a.jpg`]) {
      expect(await registerPhotoAction({ listingId: LISTING, path }), path).toMatchObject({ ok: false });
    }
    expect(state.supabase.callsFor("listing_photos", "insert")).toHaveLength(0);
  });

  it("validates upload requests (type, size, count) and returns a policy-conformant path", async () => {
    signedIn();
    const { prepareUploadAction } = await import("@/app/actions/listings");
    expect(await prepareUploadAction({ listingId: LISTING, type: "image/gif", size: 10, existingCount: 0 })).toMatchObject({ ok: false });
    expect(await prepareUploadAction({ listingId: LISTING, type: "image/png", size: 6 * 1024 * 1024, existingCount: 0 })).toMatchObject({ ok: false });
    expect(await prepareUploadAction({ listingId: LISTING, type: "image/png", size: 100, existingCount: 10 })).toMatchObject({ ok: false });
    const ok = await prepareUploadAction({ listingId: LISTING, type: "image/png", size: 100, existingCount: 0 });
    expect(ok.ok && ok.data?.path).toMatch(new RegExp(`^${USER}/${LISTING}/[0-9a-f-]{36}\\.png$`));
  });

  it("blocks status changes to anything other than paused/removed through the generic setter", async () => {
    signedIn();
    const { setListingStatusAction } = await import("@/app/actions/listings");
    expect(await setListingStatusAction(LISTING, "draft" as never)).toMatchObject({ ok: false });
    expect(state.supabase.callsFor("parking_listings", "update")).toHaveLength(0);
  });
});

describe("admin actions", () => {
  it("only forward to database functions, and surface 'forbidden' for non-admins", async () => {
    signedIn();
    state.supabase = fakeSupabase({ rpc: { admin_set_listing_moderation: { error: { message: "forbidden", code: "42501" } } } });
    const { setListingModerationAction } = await import("@/app/actions/admin");
    const res = await setListingModerationAction({ id: LISTING, status: "suspended", note: "spam" });
    expect(res).toMatchObject({ ok: false, error: "Admin access required." });
    expect(state.supabase.calls.filter((c) => c.op === "rpc").map((c) => c.fn)).toEqual(["admin_set_listing_moderation"]);
    expect(state.supabase.calls.filter((c) => c.op === "update" || c.op === "insert")).toHaveLength(0);
  });

  it("validates input before calling the database", async () => {
    signedIn();
    const { setAccountStatusAction, resolveReportAction } = await import("@/app/actions/admin");
    expect(await setAccountStatusAction({ userId: "nope", status: "suspended", reason: "" })).toMatchObject({ ok: false });
    expect(await resolveReportAction({ reportId: LISTING, status: "banana", note: "" })).toMatchObject({ ok: false });
    expect(state.supabase.calls).toHaveLength(0);
  });

  it("succeeds when the database allows it", async () => {
    signedIn();
    const { setAccountStatusAction } = await import("@/app/actions/admin");
    expect(await setAccountStatusAction({ userId: OTHER, status: "suspended", reason: "abuse" })).toMatchObject({ ok: true });
  });
});

describe("profile action", () => {
  it("only updates the caller's own row and validates input", async () => {
    signedIn();
    const { updateProfileAction } = await import("@/app/actions/profile");
    expect(await updateProfileAction(null, form({ displayName: "A", email: "bad" }))).toMatchObject({ ok: false, fieldErrors: { displayName: expect.any(String), email: expect.any(String) } });
    state.supabase = fakeSupabase({ results: { profiles: { update: { data: [], error: null } } } });
    expect(await updateProfileAction(null, form({ displayName: "Asha", email: "" }))).toMatchObject({ ok: true });
    const eq = state.supabase.calls.find((c) => c.table === "profiles" && c.op === "eq");
    expect(eq?.args).toEqual(["id", USER]);
    const payload = state.supabase.callsFor("profiles", "update")[0]!.args[0];
    expect(payload).toEqual({ display_name: "Asha", email: null });
  });
});
