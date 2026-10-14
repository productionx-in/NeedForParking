"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveReportAction, setAccountStatusAction, setListingModerationAction } from "@/app/actions/admin";
import { Alert, Button, Field, Input } from "@/components/ui";

function useAdminRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg({ ok: res.ok, text: (res.ok ? res.message : res.error) ?? "" });
      if (res.ok) router.refresh();
    });
  return { msg, pending, run };
}

export function ReportActions({ reportId, listingId, listingSuspended, open }: { reportId: string; listingId: string; listingSuspended: boolean; open: boolean }) {
  const { msg, pending, run } = useAdminRun();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <Field id={`note-${reportId}`} label="Moderator note">
        <Input id={`note-${reportId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Reason / what you found" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {listingSuspended ? (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setListingModerationAction({ id: listingId, status: "ok", note }))}>Restore listing</Button>
        ) : (
          <Button variant="danger" disabled={pending} onClick={() => run(() => setListingModerationAction({ id: listingId, status: "suspended", note }))}>Suspend listing</Button>
        )}
        {open && (
          <>
            <Button disabled={pending} onClick={() => run(() => resolveReportAction({ reportId, status: "actioned", note }))}>Mark actioned</Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => resolveReportAction({ reportId, status: "dismissed", note }))}>Dismiss</Button>
          </>
        )}
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}

export function AccountStatusActions({ userId, suspended, isAdmin }: { userId: string; suspended: boolean; isAdmin: boolean }) {
  const { msg, pending, run } = useAdminRun();
  const [reason, setReason] = useState("");
  if (isAdmin) return <p className="text-sm text-slate-600">Admin accounts can&apos;t be suspended here.</p>;
  return (
    <div className="space-y-2">
      {!suspended && (
        <Field id={`reason-${userId}`} label="Reason (shown to the user)">
          <Input id={`reason-${userId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      )}
      <Button
        variant={suspended ? "secondary" : "danger"}
        disabled={pending || (!suspended && reason.trim().length < 3)}
        onClick={() => run(() => setAccountStatusAction({ userId, status: suspended ? "active" : "suspended", reason }))}
      >
        {suspended ? "Reactivate account" : "Suspend account"}
      </Button>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
