"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createRequestAction } from "@/app/actions/requests";
import { DAYS, VEHICLE_TYPES, type VehicleType } from "@/lib/domain/constants";
import { todayIST } from "@/lib/domain/format";
import { validateRequest, type RequestFieldErrors, type RequestFormValues } from "@/lib/validation/request";
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

const MESSAGE_HINT = "Mention your vehicle and when you'd arrive. Don't share payment details.";

export function RequestForm({ listingId, vehicleTypes, availableDays }: { listingId: string; vehicleTypes: string[]; availableDays: number[] }) {
  const today = useMemo(() => todayIST(), []);
  const allowed = VEHICLE_TYPES.filter((v) => vehicleTypes.includes(v.value));
  const [values, setValues] = useState<RequestFormValues>({
    listingId,
    scheduleType: "one_time",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    recurringDays: [],
    vehicleType: (allowed[0]?.value ?? "car") as VehicleType,
    message: "",
  });
  const [errors, setErrors] = useState<RequestFieldErrors>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof RequestFormValues>(k: K, v: RequestFormValues[K]) => setValues((p) => ({ ...p, [k]: v }));

  if (result?.ok) {
    return (
      <Alert tone="success" title="Request sent">
        {result.message} You can follow it under <Link href="/dashboard/requests/mine" className="font-semibold underline">My requests</Link>.
      </Alert>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateRequest(values, today);
        setErrors(found);
        setResult(null);
        if (Object.keys(found).length > 0) return;
        start(async () => {
          const res = await createRequestAction(values);
          if (res.ok) setResult({ ok: true, message: res.message ?? "Sent." });
          else {
            setResult({ ok: false, message: res.error });
            if (res.fieldErrors) setErrors(res.fieldErrors as RequestFieldErrors);
          }
        });
      }}
    >
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Schedule</legend>
        <div className="flex gap-4">
          {([["one_time", "One-time"], ["recurring", "Recurring"]] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="scheduleType" value={v} checked={values.scheduleType === v} onChange={() => set("scheduleType", v)} className="size-4 accent-brand-700" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="req-start" label="Start date" error={errors.startDate} required>
          <Input id="req-start" type="date" min={today} value={values.startDate} onChange={(e) => set("startDate", e.target.value)} error={errors.startDate} />
        </Field>
        <Field id="req-end" label={values.scheduleType === "recurring" ? "End date (optional)" : "End date"} error={errors.endDate} required={values.scheduleType === "one_time"}>
          <Input id="req-end" type="date" min={values.startDate || today} value={values.endDate} onChange={(e) => set("endDate", e.target.value)} error={errors.endDate} />
        </Field>
      </div>

      {values.scheduleType === "recurring" && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Days of the week <span aria-hidden="true" className="text-red-700">*</span></legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DAYS.map((d) => (
              <Checkbox
                key={d.value}
                id={`req-day-${d.value}`}
                label={d.short}
                checked={values.recurringDays.includes(d.value)}
                disabled={!availableDays.includes(d.value)}
                onChange={(e) => set("recurringDays", e.target.checked ? [...values.recurringDays, d.value] : values.recurringDays.filter((x) => x !== d.value))}
              />
            ))}
          </div>
          {errors.recurringDays && <p role="alert" className="mt-1 text-sm font-medium text-red-700">{errors.recurringDays}</p>}
          <p className="mt-1 text-xs text-slate-600">Days the owner doesn&apos;t offer are disabled.</p>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="req-from" label="From (optional)" error={errors.startTime}>
          <Input id="req-from" type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} error={errors.startTime} />
        </Field>
        <Field id="req-to" label="Until (optional)" error={errors.endTime}>
          <Input id="req-to" type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} error={errors.endTime} />
        </Field>
      </div>

      <Field id="req-vehicle" label="Your vehicle" error={errors.vehicleType} required>
        <Select id="req-vehicle" value={values.vehicleType} onChange={(e) => set("vehicleType", e.target.value as VehicleType)} error={errors.vehicleType}>
          {allowed.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </Select>
      </Field>

      <Field id="req-message" label="Message to the owner" hint={MESSAGE_HINT} error={errors.message} required>
        <Textarea id="req-message" rows={4} maxLength={1000} value={values.message} onChange={(e) => set("message", e.target.value)} error={errors.message} hint={MESSAGE_HINT} />
      </Field>

      {result && !result.ok && <Alert tone="error">{result.message}</Alert>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send request"}</Button>
      <p className="text-xs text-slate-600">No payment is taken. The owner will accept or decline, and you&apos;ll see the reply in your dashboard.</p>
    </form>
  );
}
