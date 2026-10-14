"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "@/components/ui";

export function SubmitButton({ children, pendingText = "Working…", variant = "primary", className, disabled }: { children: React.ReactNode; pendingText?: string; variant?: ButtonVariant; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={buttonClass(variant, className)}>
      {pending ? pendingText : children}
    </button>
  );
}
