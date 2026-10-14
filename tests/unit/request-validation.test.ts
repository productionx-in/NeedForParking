import { describe, it, expect } from "vitest";
import { createRequestFormSchema, requestToRow, validateRequest, type RequestFormValues } from "@/lib/validation/request";
import { allowedTransitions, canComplete, canTransition, describeSchedule, isTerminal } from "@/lib/domain/request-rules";
import { REQUEST_STATUSES } from "@/lib/domain/constants";

const TODAY = "2026-10-14";
const base: RequestFormValues = {
  listingId: "6f0a3a52-52ef-4a6e-9c52-0d4a2d4b1c11",
  scheduleType: "one_time",
  startDate: "2026-10-20",
  endDate: "2026-10-22",
  startTime: "",
  endTime: "",
  recurringDays: [],
  vehicleType: "car",
  message: "Hi, I'd like this for a few days.",
};

describe("booking request validation", () => {
  it("accepts a valid one-time request", () => {
    expect(validateRequest(base, TODAY)).toEqual({});
  });

  it("rejects an end date before the start date", () => {
    expect(validateRequest({ ...base, endDate: "2026-10-19" }, TODAY).endDate).toMatch(/on or after/);
  });
  it("rejects start dates in the past, but accepts today", () => {
    expect(validateRequest({ ...base, startDate: "2026-10-13", endDate: "2026-10-14" }, TODAY).startDate).toMatch(/past/);
    expect(validateRequest({ ...base, startDate: TODAY, endDate: TODAY }, TODAY)).toEqual({});
  });
  it("requires an end date for one-time requests", () => {
    expect(validateRequest({ ...base, endDate: "" }, TODAY).endDate).toBeTruthy();
  });
  it("rejects spans longer than a year", () => {
    expect(validateRequest({ ...base, endDate: "2028-01-01" }, TODAY).endDate).toMatch(/one year/);
  });
  it("rejects malformed dates", () => {
    expect(validateRequest({ ...base, startDate: "2026-13-45" }, TODAY).startDate).toBeTruthy();
    expect(validateRequest({ ...base, startDate: "" }, TODAY).startDate).toBeTruthy();
  });
  it("recurring schedules need at least one weekday; the end date is optional", () => {
    const rec = { ...base, scheduleType: "recurring" as const, endDate: "" };
    expect(validateRequest(rec, TODAY).recurringDays).toBeTruthy();
    expect(validateRequest({ ...rec, recurringDays: [1, 3] }, TODAY)).toEqual({});
  });
  it("time window must be complete and ordered", () => {
    expect(validateRequest({ ...base, startTime: "10:00" }, TODAY).endTime).toBeTruthy();
    expect(validateRequest({ ...base, startTime: "14:00", endTime: "10:00" }, TODAY).endTime).toMatch(/after/);
    expect(validateRequest({ ...base, startTime: "10:00", endTime: "12:30" }, TODAY)).toEqual({});
  });
  it("requires a message and a valid vehicle and listing id", () => {
    expect(validateRequest({ ...base, message: "hi" }, TODAY).message).toBeTruthy();
    expect(validateRequest({ ...base, message: "x".repeat(1001) }, TODAY).message).toBeTruthy();
    expect(validateRequest({ ...base, vehicleType: "truck" as never }, TODAY).vehicleType).toBeTruthy();
    expect(validateRequest({ ...base, listingId: "nope" }, TODAY).listingId).toBeTruthy();
  });
  it("the schema factory defaults 'today' to IST", () => {
    expect(createRequestFormSchema().safeParse({ ...base, startDate: "2000-01-01", endDate: "2000-01-02" }).success).toBe(false);
  });
  it("maps to DB columns without recurring days for one-time requests", () => {
    expect(requestToRow({ ...base, recurringDays: [1, 2] })).toMatchObject({ schedule_type: "one_time", recurring_days: null, start_time: null, end_date: "2026-10-22" });
    expect(requestToRow({ ...base, scheduleType: "recurring", recurringDays: [3, 1], endDate: "" })).toMatchObject({ recurring_days: [1, 3], end_date: null });
  });
});

describe("request status rules (mirror of the DB trigger)", () => {
  it("lets owners accept/decline pending and complete/cancel accepted", () => {
    expect(canTransition("owner", "pending", "accepted")).toBe(true);
    expect(canTransition("owner", "pending", "declined")).toBe(true);
    expect(canTransition("owner", "accepted", "completed")).toBe(true);
    expect(canTransition("owner", "accepted", "cancelled")).toBe(true);
  });
  it("lets requesters only cancel pending/accepted requests", () => {
    expect(allowedTransitions("requester", "pending")).toEqual(["cancelled"]);
    expect(allowedTransitions("requester", "accepted")).toEqual(["cancelled"]);
    for (const to of ["accepted", "declined", "completed"] as const) {
      expect(canTransition("requester", "pending", to)).toBe(false);
    }
  });
  it("terminal states allow nothing", () => {
    for (const s of REQUEST_STATUSES.filter(isTerminal)) {
      expect(allowedTransitions("owner", s)).toEqual([]);
      expect(allowedTransitions("requester", s)).toEqual([]);
    }
  });
  it("completion requires the start date to have been reached", () => {
    expect(canComplete("2026-10-20", "2026-10-14")).toBe(false);
    expect(canComplete("2026-10-14", "2026-10-14")).toBe(true);
  });
  it("describes schedules for humans", () => {
    expect(describeSchedule({ schedule_type: "one_time", start_date: "2026-10-20", end_date: "2026-10-20", start_time: "09:00:00", end_time: "12:00:00", recurring_days: null })).toMatch(/20 Oct 2026.*9:00 AM – 12:00 PM/);
    expect(describeSchedule({ schedule_type: "recurring", start_date: "2026-10-20", end_date: null, start_time: null, end_time: null, recurring_days: [1, 3] })).toMatch(/Every Mon, Wed.*ongoing/);
  });
});
