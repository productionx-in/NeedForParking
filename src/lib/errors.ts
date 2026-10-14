import type { ZodError } from "zod";

/** Machine codes raised by database triggers/functions -> friendly messages. */
const DB_MESSAGES: Record<string, string> = {
  own_listing: "You can't do this on your own listing.",
  listing_unavailable: "This listing isn't available right now.",
  demo_listing: "This is a demo listing with no real owner, so requests are disabled.",
  past_date: "The start date can't be in the past.",
  vehicle_unsupported: "This space doesn't accept that vehicle type.",
  outside_availability: "That day or time is outside the hours the owner has offered.",
  below_minimum_duration: "That is shorter than the owner's minimum rental duration.",
  slot_taken: "Those dates and times are already taken by an accepted request.",
  duplicate_request: "You already have an open request for overlapping dates on this listing.",
  too_many_pending: "You have too many pending requests. Wait for some replies or cancel a few.",
  request_expired: "This request's dates have already passed.",
  cannot_complete_before_start: "A rental can only be marked completed once it has started.",
  invalid_status_transition: "That status change isn't allowed.",
  report_rate_limited: "You've sent several reports today. Please try again tomorrow.",
  photo_limit_reached: "A listing can have at most 10 photos.",
  published_listing_needs_photo: "A published listing must keep at least one photo. Pause it first to remove the last photo.",
  invalid_photo_path: "That photo upload doesn't match this listing.",
  forbidden: "You aren't allowed to do that.",
  not_found: "That item no longer exists.",
  cannot_modify_self: "You can't change your own account status.",
  cannot_modify_admin: "Admin accounts can't be suspended from here.",
};

type DbErrorLike = { message?: string; code?: string; details?: string | null } | null | undefined;

export function friendlyDbError(error: DbErrorLike, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const message = error.message ?? "";
  if (message.startsWith("publish_validation:")) {
    return `Fix these before publishing: ${message.slice("publish_validation:".length).trim()}.`;
  }
  for (const [code, text] of Object.entries(DB_MESSAGES)) {
    if (message === code || message.startsWith(`${code}:`)) return text;
  }
  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "You don't have permission to do that. Make sure you're signed in with a verified phone number.";
  }
  if (error.code === "23505") return "That already exists.";
  if (error.code === "23514") return "Some values are outside the allowed range. Please check your entries.";
  if (error.code === "23503") return "A related item no longer exists.";
  return fallback;
}

export function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
