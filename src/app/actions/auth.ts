"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured, SETUP_MESSAGE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { maskPhone, parsePhone } from "@/lib/auth/phone";
import { safeNextPath } from "@/lib/auth/redirect";
import { otpCodeSchema } from "@/lib/validation/misc";
import { describeOtpSendError, type OtpState } from "@/lib/auth/otp";
import { clientIp, hashKey } from "@/lib/actions";
import { otpSendByIp, otpSendByPhone, otpSendByPhoneHourly, otpVerifyByIp, otpVerifyByPhone } from "@/lib/auth/rate-limit";

export async function requestOtpAction(_prev: OtpState, formData: FormData): Promise<OtpState> {
  if (!isSupabaseConfigured()) return { status: "error", kind: "setup", message: SETUP_MESSAGE };

  const parsed = parsePhone(String(formData.get("country") ?? ""), String(formData.get("phone") ?? ""));
  if (!parsed.ok) return { status: "error", kind: "validation", message: parsed.error };

  const phoneKey = hashKey(parsed.e164);
  const ipKey = hashKey(await clientIp());
  const perMinute = otpSendByPhone.consume(phoneKey);
  if (!perMinute.allowed) {
    return { status: "error", kind: "rate_limit", retryAfterSeconds: perMinute.retryAfterSeconds, phone: parsed.e164, message: `Please wait ${perMinute.retryAfterSeconds}s before requesting another code.` };
  }
  const hourly = otpSendByPhoneHourly.consume(phoneKey);
  const byIp = otpSendByIp.consume(ipKey);
  if (!hourly.allowed || !byIp.allowed) {
    const retry = Math.max(!hourly.allowed ? hourly.retryAfterSeconds : 0, !byIp.allowed ? byIp.retryAfterSeconds : 0);
    return { status: "error", kind: "rate_limit", retryAfterSeconds: retry, message: "Too many code requests. Please try again later." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: parsed.e164, options: { channel: "sms" } });
  if (error) {
    console.error("[auth] otp send failed", error.code ?? error.status);
    return { ...describeOtpSendError(error), phone: parsed.e164 } as OtpState;
  }
  const masked = maskPhone(parsed.e164);
  return { status: "sent", phone: parsed.e164, maskedPhone: masked, sentAt: Date.now(), message: `We asked our SMS provider to send a code to ${masked}.` };
}

export async function verifyOtpAction(_prev: OtpState, formData: FormData): Promise<OtpState> {
  if (!isSupabaseConfigured()) return { status: "error", kind: "setup", message: SETUP_MESSAGE };

  const parsedPhone = parsePhone("IN", String(formData.get("phone") ?? ""));
  if (!parsedPhone.ok) return { status: "error", kind: "validation", message: "Start again and request a new code." };
  const code = otpCodeSchema.safeParse(formData.get("token"));
  const masked = maskPhone(parsedPhone.e164);
  const sentBase = { phone: parsedPhone.e164, maskedPhone: masked, sentAt: Number(formData.get("sentAt")) || Date.now() };
  if (!code.success) {
    return { status: "sent", ...sentBase, message: code.error.issues[0]?.message ?? "Enter the code from your SMS." };
  }

  const phoneKey = hashKey(parsedPhone.e164);
  const attempts = otpVerifyByPhone.consume(phoneKey);
  const ipAttempts = otpVerifyByIp.consume(hashKey(await clientIp()));
  if (!attempts.allowed || !ipAttempts.allowed) {
    return { status: "error", kind: "rate_limit", phone: parsedPhone.e164, message: "Too many incorrect attempts. Request a new code in a few minutes." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone: parsedPhone.e164, token: code.data, type: "sms" });
  if (error) {
    const expired = error.code === "otp_expired" || /expired|invalid/i.test(error.message ?? "");
    return {
      status: "sent",
      ...sentBase,
      message: expired ? "That code is incorrect or has expired. Check the SMS or request a new code." : "We couldn't verify that code. Please try again.",
    };
  }
  otpVerifyByPhone.reset(phoneKey);
  revalidatePath("/", "layout");

  const next = safeNextPath(formData.get("next"), "");
  const { data } = await supabase.auth.getUser();
  if (data.user && !next) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
    if (!profile?.display_name) redirect("/dashboard/profile?welcome=1");
  }
  redirect(next || "/dashboard");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOutOthersAction(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_MESSAGE };
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return error ? { ok: false, message: "Couldn't sign out other devices." } : { ok: true, message: "Signed out of all other devices." };
}
