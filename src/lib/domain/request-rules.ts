import type { RequestStatus } from "@/lib/domain/constants";
import { DAYS } from "@/lib/domain/constants";
import { formatDate, formatTime, todayIST } from "@/lib/domain/format";

export type Actor = "requester" | "owner";

/**
 * Allowed status transitions per actor. This mirrors the database trigger `tg_requests_before_update`
 * (the database is the authority; this only decides which buttons the UI offers and is unit-tested
 * against the same table).
 */
const TRANSITIONS: Record<Actor, Partial<Record<RequestStatus, RequestStatus[]>>> = {
  requester: { pending: ["cancelled"], accepted: ["cancelled"] },
  owner: { pending: ["accepted", "declined"], accepted: ["completed", "cancelled"] },
};

export function canTransition(actor: Actor, from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[actor][from]?.includes(to) ?? false;
}

export function allowedTransitions(actor: Actor, from: RequestStatus): RequestStatus[] {
  return TRANSITIONS[actor][from] ?? [];
}

export const isTerminal = (s: RequestStatus) => s === "declined" || s === "cancelled" || s === "completed";

/** An accepted rental can be marked complete once its start date has been reached (IST). */
export function canComplete(startDate: string, today: string = todayIST()): boolean {
  return startDate <= today;
}

export type ScheduleLike = {
  schedule_type: "one_time" | "recurring";
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  recurring_days: number[] | null;
};

export function describeSchedule(r: ScheduleLike): string {
  const time = r.start_time && r.end_time ? `, ${formatTime(r.start_time)} – ${formatTime(r.end_time)}` : "";
  if (r.schedule_type === "recurring") {
    const days = DAYS.filter((d) => r.recurring_days?.includes(d.value)).map((d) => d.short).join(", ");
    return `Every ${days} from ${formatDate(r.start_date)}${r.end_date ? ` to ${formatDate(r.end_date)}` : " (ongoing)"}${time}`;
  }
  return r.end_date && r.end_date !== r.start_date ? `${formatDate(r.start_date)} → ${formatDate(r.end_date)}${time}` : `${formatDate(r.start_date)}${time}`;
}
