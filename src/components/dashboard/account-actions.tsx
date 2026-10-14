"use client";

import { useState, useTransition } from "react";
import { signOutAction, signOutOthersAction } from "@/app/actions/auth";
import { Alert, Button } from "@/components/ui";

export function AccountActions() {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">Sign out of this device</Button>
        </form>
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => setMsg(await signOutOthersAction()))}>
          Sign out of all other devices
        </Button>
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.message}</Alert>}
    </div>
  );
}
