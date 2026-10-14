"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setListingStatusAction } from "@/app/actions/listings";
import { Alert, Button, buttonClass } from "@/components/ui";

export function ListingRowActions({ id, status, suspended }: { id: string; status: "draft" | "published" | "paused" | "removed"; suspended: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (next: "paused" | "published" | "removed") =>
    start(async () => {
      const res = await setListingStatusAction(id, next);
      setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "Done.") : res.error });
      setConfirming(false);
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/listings/${id}/edit`} className={buttonClass("secondary")}>Edit</Link>
        <Link href={`/listings/${id}`} className={buttonClass("secondary")}>{status === "published" && !suspended ? "View" : "Preview"}</Link>
        {status === "published" && <Button variant="secondary" disabled={pending} onClick={() => run("paused")}>Pause</Button>}
        {status === "paused" && !suspended && <Button variant="secondary" disabled={pending} onClick={() => run("published")}>Resume</Button>}
        {status === "draft" && <Link href={`/dashboard/listings/${id}/edit`} className={buttonClass("primary")}>Finish &amp; publish</Link>}
        {!confirming ? (
          <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setConfirming(true)}>Delete</Button>
        ) : (
          <span className="inline-flex items-center gap-2" role="group" aria-label="Confirm delete">
            <span className="text-sm font-medium">Delete this listing?</span>
            <Button variant="danger" disabled={pending} onClick={() => run("removed")}>Yes, delete</Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
          </span>
        )}
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </div>
  );
}
