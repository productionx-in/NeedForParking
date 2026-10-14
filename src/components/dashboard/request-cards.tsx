"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelRequestAction, completeRequestAction, respondToRequestAction } from "@/app/actions/requests";
import { RequestStatusBadge } from "@/components/status-badge";
import { Alert, Badge, Button, Card, Field, Textarea } from "@/components/ui";
import { allowedTransitions, canComplete, describeSchedule } from "@/lib/domain/request-rules";
import { formatDateTime, vehicleLabel } from "@/lib/domain/format";
import type { RequestRow } from "@/lib/types";

function useRequestAction() {
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

function Summary({ r, who }: { r: RequestRow; who: string }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">
          <Link href={`/listings/${r.listing_id}`} className="hover:underline">{r.listing_title || "Listing"}</Link>
        </h2>
        <RequestStatusBadge status={r.status} />
        {r.listing_is_demo && <Badge tone="amber">Demo</Badge>}
      </div>
      <p className="text-sm text-slate-600">{r.listing_locality ?? "Hyderabad"} · {who} · sent {formatDateTime(r.created_at)}</p>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-slate-600">When</dt><dd>{describeSchedule(r)}</dd>
        <dt className="text-slate-600">Vehicle</dt><dd>{vehicleLabel(r.vehicle_type)}</dd>
        <dt className="text-slate-600">Message</dt><dd className="whitespace-pre-line">{r.message || "—"}</dd>
        {r.owner_response && (<><dt className="text-slate-600">Owner reply</dt><dd className="whitespace-pre-line">{r.owner_response}</dd></>)}
      </dl>
    </>
  );
}

export function IncomingRequestCard({ r }: { r: RequestRow }) {
  const { msg, pending, run } = useRequestAction();
  const [reply, setReply] = useState("");
  const options = allowedTransitions("owner", r.status);
  return (
    <Card className="space-y-3 p-4" data-testid="incoming-request">
      <Summary r={r} who={`from ${r.other_party_name}`} />
      {r.status === "pending" && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <Field id={`reply-${r.id}`} label="Reply (optional)" hint="Shared with the requester. Don't post gate codes here — they're released automatically after you accept.">
            <Textarea id={`reply-${r.id}`} rows={2} maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} hint="Shared with the requester. Don't post gate codes here — they're released automatically after you accept." />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => respondToRequestAction({ requestId: r.id, decision: "accepted", response: reply }))}>Accept</Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => respondToRequestAction({ requestId: r.id, decision: "declined", response: reply }))}>Decline</Button>
          </div>
        </div>
      )}
      {r.status === "accepted" && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {options.includes("completed") && <Button variant="secondary" disabled={pending || !canComplete(r.start_date)} onClick={() => run(() => completeRequestAction(r.id))}>{canComplete(r.start_date) ? "Mark completed" : "Can be completed once it starts"}</Button>}
          {options.includes("cancelled") && <Button variant="ghost" className="text-red-700" disabled={pending} onClick={() => run(() => cancelRequestAction(r.id))}>Cancel reservation</Button>}
        </div>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </Card>
  );
}

export function MyRequestCard({ r }: { r: RequestRow }) {
  const { msg, pending, run } = useRequestAction();
  const cancellable = allowedTransitions("requester", r.status).includes("cancelled");
  return (
    <Card className="space-y-3 p-4" data-testid="my-request">
      <Summary r={r} who={`owner: ${r.other_party_name}`} />
      {r.status === "accepted" && (
        <Alert tone="success">
          Accepted. <Link href={`/listings/${r.listing_id}`} className="font-semibold underline">Open the listing</Link> to see the address and access instructions.
        </Alert>
      )}
      {cancellable && (
        <div className="border-t border-slate-100 pt-3">
          <Button variant="secondary" disabled={pending} onClick={() => run(() => cancelRequestAction(r.id))}>Cancel request</Button>
        </div>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </Card>
  );
}
