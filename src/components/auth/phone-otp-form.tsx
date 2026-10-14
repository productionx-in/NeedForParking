"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { requestOtpAction, verifyOtpAction } from "@/app/actions/auth";
import { initialOtpState, type OtpState } from "@/lib/auth/otp";
import { DEFAULT_COUNTRY, type CountryOption } from "@/lib/auth/phone";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

export const RESEND_COOLDOWN_SECONDS = 60;

/** Seconds left until `sentAt + seconds`. Derived during render so the resend button is disabled from the first paint. */
function useCountdown(sentAt: number | null, seconds: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);
  return sentAt ? Math.max(0, Math.ceil((sentAt + seconds * 1000 - now) / 1000)) : 0;
}

/**
 * `countries` is computed on the server and passed in: building it here with Intl.DisplayNames would use different ICU
 * data in Node and in the browser, causing a hydration mismatch (React #418) that wipes anything typed meanwhile.
 */
export function PhoneOtpForm({ next, countries }: { next?: string; countries: CountryOption[] }) {
  const [sendState, sendAction, sendPending] = useActionState<OtpState, FormData>(requestOtpAction, initialOtpState);
  const [verifyState, verifyAction, verifyPending] = useActionState<OtpState, FormData>(verifyOtpAction, initialOtpState);
  const [, startTransition] = useTransition();
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState("");

  // The verification step is shown once the provider has confirmed the send (or while re-entering a code).
  const active: OtpState = verifyState.status === "idle" ? sendState : verifyState.status === "sent" ? verifyState : sendState.status === "sent" ? sendState : verifyState;
  const sent = sendState.status === "sent" ? sendState : verifyState.status === "sent" ? verifyState : null;
  const sentAt = sent?.sentAt ?? null;
  const cooldown = useCountdown(sentAt, RESEND_COOLDOWN_SECONDS);
  /**
   * Submit through onSubmit + a transition instead of `<form action={fn}>`: React 19 automatically RESETS the form after an
   * action finishes, which would blank the phone field and revert the country <select> whenever a send fails.
   */
  const submitVia = (dispatch: (data: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  const dial = countries.find((c) => c.code === country)?.dial ?? "";

  const setupError = active.status === "error" && active.kind === "setup";
  const verifyError = verifyState.status === "sent" ? verifyState.message : verifyState.status === "error" ? verifyState.message : null;
  const sendError = sendState.status === "error" ? sendState : null;

  if (sent && !(verifyState.status === "error" && verifyState.kind === "rate_limit")) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Check your messages">
          {sent.message} The code is valid for a short time. Never share it with anyone.
        </Alert>
        <form method="post" onSubmit={submitVia(verifyAction)} className="space-y-4" noValidate>
          <input type="hidden" name="phone" value={sent.phone} />
          <input type="hidden" name="sentAt" value={sent.sentAt} />
          <input type="hidden" name="next" value={next ?? ""} />
          <Field id="otp-token" label="6-digit code" error={verifyError ?? undefined} required>
            <Input id="otp-token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} placeholder="123456" error={verifyError ?? undefined} required />
          </Field>
          <Button type="submit" disabled={verifyPending} aria-busy={verifyPending} className="w-full">{verifyPending ? "Verifying…" : "Verify and continue"}</Button>
        </form>
        <form method="post" onSubmit={submitVia(sendAction)} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="phone" value={sent.phone} />
          <span aria-live="polite" className="text-slate-600">
            {cooldown > 0 ? `You can request a new code in ${cooldown}s` : "Didn't get a code?"}
          </span>
          <Button type="submit" variant="secondary" disabled={cooldown > 0 || sendPending} aria-busy={sendPending}>{sendPending ? "Sending…" : "Resend code"}</Button>
        </form>
        {sendError && <Alert tone="error">{sendError.message}</Alert>}
        <p className="text-sm text-slate-600">
          Wrong number?{" "}
          <button type="button" className="font-semibold text-brand-800 underline" onClick={() => window.location.reload()}>
            Start over
          </button>
        </p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={submitVia(sendAction)} className="space-y-4" noValidate>
      {setupError && (
        <Alert tone="warning" title="Setup required">
          {active.status === "error" ? active.message : null}
        </Alert>
      )}
      {sendError && !setupError && <Alert tone="error">{sendError.message}</Alert>}
      {verifyError && sent === null && <Alert tone="error">{verifyError}</Alert>}
      <Field id="country" label="Country">
        <Select id="country" name="country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country">
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.dial})
            </option>
          ))}
        </Select>
      </Field>
      <Field id="phone" label="Mobile number" hint={`We'll text you a one-time code. Your number stays private. (${dial})`} error={sendError?.kind === "validation" ? sendError.message : undefined} required>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={country === "IN" ? "98765 43210" : "Mobile number"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={sendError?.kind === "validation" ? sendError.message : undefined}
          hint={`We'll text you a one-time code. Your number stays private. (${dial})`}
          required
        />
      </Field>
      <Button type="submit" disabled={sendPending} aria-busy={sendPending} className="w-full">{sendPending ? "Requesting code…" : "Send code"}</Button>
      <p className="text-xs text-slate-600">
        By continuing you agree that this is a research prototype. Standard SMS rates may apply. If you don&apos;t receive a code, the SMS provider may not be
        configured yet.
      </p>
    </form>
  );
}
