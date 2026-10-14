"use client";

import { useState, useTransition } from "react";
import { reportListingAction } from "@/app/actions/engagement";
import { REPORT_REASONS } from "@/lib/domain/constants";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";

export function ReportForm({ listingId }: { listingId: string }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();

  return (
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Report this listing</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await reportListingAction({ listingId, reason, details });
            setResult(res.ok ? { ok: true, message: res.message ?? "Report sent." } : { ok: false, message: res.error, fieldErrors: res.fieldErrors });
            if (res.ok) {
              setReason("");
              setDetails("");
            }
          });
        }}
      >
        <Field id="report-reason" label="Reason" error={result?.fieldErrors?.reason} required>
          <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} error={result?.fieldErrors?.reason} required>
            <option value="">Choose…</option>
            {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        <Field id="report-details" label="Details (optional)" error={result?.fieldErrors?.details}>
          <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending…" : "Send report"}</Button>
        {result && <Alert tone={result.ok ? "success" : "error"}>{result.message}</Alert>}
      </form>
    </details>
  );
}
