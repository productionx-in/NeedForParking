import { DAYS, RENTAL_TYPES, VEHICLE_TYPES, type RentalType } from "./constants";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return inr.format(n);
}

export function rentalSuffix(rental: RentalType | string | null | undefined): string {
  return RENTAL_TYPES.find((r) => r.value === rental)?.per ?? "";
}

export function formatMinDuration(min: number | null | undefined, rental: RentalType | string | null | undefined): string {
  if (!min) return "No minimum";
  const r = RENTAL_TYPES.find((x) => x.value === rental);
  if (!r) return String(min);
  return `${min} ${min === 1 ? r.unit : r.unitPlural}`;
}

/** "08:00:00" -> "8:00 AM" */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatHours(access24h: boolean, from: string | null, to: string | null): string {
  if (access24h) return "24 hours";
  if (!from || !to) return "Hours not set";
  return `${formatTime(from)} – ${formatTime(to)}`;
}

export function formatDays(days: readonly number[] | null | undefined): string {
  if (!days || days.length === 0) return "No days set";
  const set = new Set(days);
  if (set.size === 7) return "Every day";
  const weekdays = [1, 2, 3, 4, 5];
  if (set.size === 5 && weekdays.every((d) => set.has(d))) return "Mon – Fri";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Sat & Sun";
  return DAYS.filter((d) => set.has(d.value)).map((d) => d.short).join(", ");
}

export function vehicleLabel(v: string): string {
  return VEHICLE_TYPES.find((x) => x.value === v)?.label ?? v;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

/** Today's date (YYYY-MM-DD) in India Standard Time, independent of the server/browser timezone. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
