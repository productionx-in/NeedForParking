export type OtpState =
  | { status: "idle" }
  | { status: "sent"; phone: string; maskedPhone: string; sentAt: number; message: string }
  | { status: "error"; message: string; kind?: "setup" | "rate_limit" | "validation" | "provider"; retryAfterSeconds?: number; phone?: string };

export const initialOtpState: OtpState = { status: "idle" };

type AuthErr = { message?: string; code?: string; status?: number } | null;

/** Maps Supabase Auth failures to messages. Never claims a code was sent unless the provider confirmed it. */
export function describeOtpSendError(error: NonNullable<AuthErr>): OtpState {
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  if (code === "over_sms_send_rate_limit" || code === "over_request_rate_limit" || error.status === 429) {
    return { status: "error", kind: "rate_limit", message: "Too many code requests. Please wait a while before trying again." };
  }
  if (code === "phone_provider_disabled" || code === "otp_disabled" || msg.includes("signups not allowed") || msg.includes("provider is disabled")) {
    return { status: "error", kind: "setup", message: "Phone sign-in isn't enabled for this project. Enable the Phone provider in Supabase → Authentication → Providers (see README)." };
  }
  if (code === "sms_send_failed" || msg.includes("sms") || msg.includes("twilio") || msg.includes("provider") || msg.includes("unsupported phone")) {
    return { status: "error", kind: "provider", message: "The SMS provider rejected or couldn't deliver the message. No code was sent. Check the SMS provider settings in Supabase (see README → SMS provider)." };
  }
  if (code === "validation_failed" || msg.includes("invalid") && msg.includes("phone")) {
    return { status: "error", kind: "validation", message: "That mobile number was rejected by the provider. Check the number and country." };
  }
  return { status: "error", kind: "provider", message: "We couldn't send a code. No SMS was sent. Please try again later." };
}

