"use client";

import { useActionState, useTransition, type FormEvent } from "react";
import { updateProfileAction } from "@/app/actions/profile";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { ActionResult } from "@/lib/types";

export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProfileAction, null);
  const [, startTransition] = useTransition();
  // onSubmit + transition (not `<form action>`): React 19 would reset the fields to their defaults after a failed save.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form method="post" onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
      <Field id="displayName" label="Display name" hint="Shown to owners and requesters. Use your first name or a nickname — not your phone number." error={errors.displayName} required>
        <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={60} autoComplete="nickname" error={errors.displayName} hint="Shown to owners and requesters. Use your first name or a nickname — not your phone number." />
      </Field>
      <Field id="email" label="Email (optional)" hint="For your reference only. It is not verified and is never shown publicly." error={errors.email}>
        <Input id="email" name="email" type="email" defaultValue={email} maxLength={254} autoComplete="email" error={errors.email} hint="For your reference only. It is not verified and is never shown publicly." />
      </Field>
      {state && !state.ok && !state.fieldErrors && <Alert tone="error">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Saving…" : "Save profile"}</Button>
    </form>
  );
}
