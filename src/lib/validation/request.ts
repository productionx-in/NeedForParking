import { z } from "zod";
import { VEHICLE_VALUES } from "@/lib/domain/constants";
import { todayIST } from "@/lib/domain/format";

export type RequestFormValues = {
  listingId: string;
  scheduleType: "one_time" | "recurring";
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  recurringDays: number[];
  vehicleType: (typeof VEHICLE_VALUES)[number];
  message: string;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Choose a valid date");
const timeOrEmpty = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Use HH:MM format");

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** `today` is injectable so the rules are testable; the database re-validates everything. */
export function createRequestFormSchema(today: string = todayIST()) {
  return z
    .object({
      listingId: z.uuid({ error: "Invalid listing" }),
      scheduleType: z.enum(["one_time", "recurring"]),
      startDate: isoDate,
      endDate: z.union([z.literal(""), isoDate]),
      startTime: timeOrEmpty,
      endTime: timeOrEmpty,
      recurringDays: z.array(z.number().int().min(0).max(6)),
      vehicleType: z.enum(VEHICLE_VALUES, { error: "Choose your vehicle type" }),
      message: z.string().trim().min(5, "Add a short message for the owner (at least 5 characters)").max(1000, "Message must be at most 1000 characters"),
    })
    .superRefine((v, ctx) => {
      if (v.startDate && v.startDate < today) {
        ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date can't be in the past" });
      }
      if (v.scheduleType === "one_time") {
        if (!v.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Choose an end date" });
      } else if (v.recurringDays.length === 0) {
        ctx.addIssue({ code: "custom", path: ["recurringDays"], message: "Choose at least one day of the week" });
      }
      if (v.endDate && v.startDate) {
        const span = dayDiff(v.startDate, v.endDate);
        if (span < 0) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
        else if (span > 366) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Requests can span at most one year" });
      }
      if (Boolean(v.startTime) !== Boolean(v.endTime)) {
        ctx.addIssue({ code: "custom", path: [v.startTime ? "endTime" : "startTime"], message: "Set both start and end time, or neither" });
      } else if (v.startTime && v.endTime && v.startTime >= v.endTime) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time" });
      }
    });
}

export type RequestFieldErrors = Partial<Record<keyof RequestFormValues, string>>;

export function validateRequest(values: RequestFormValues, today?: string): RequestFieldErrors {
  const res = createRequestFormSchema(today).safeParse(values);
  if (res.success) return {};
  const out: RequestFieldErrors = {};
  for (const i of res.error.issues) {
    const k = String(i.path[0]) as keyof RequestFormValues;
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

export function requestToRow(v: RequestFormValues) {
  const recurring = v.scheduleType === "recurring";
  return {
    listing_id: v.listingId,
    schedule_type: v.scheduleType,
    start_date: v.startDate,
    end_date: v.endDate || null,
    start_time: v.startTime || null,
    end_time: v.endTime || null,
    recurring_days: recurring ? [...v.recurringDays].sort((a, b) => a - b) : null,
    vehicle_type: v.vehicleType,
    message: v.message.trim(),
  };
}
