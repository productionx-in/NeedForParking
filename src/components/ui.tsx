import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-11 px-4 text-sm";
const btnVariants = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary: "bg-white text-slate-900 border border-slate-300 hover:bg-slate-100",
  danger: "bg-red-700 text-white hover:bg-red-800",
  ghost: "text-brand-800 hover:bg-brand-50",
} as const;
export type ButtonVariant = keyof typeof btnVariants;

export const buttonClass = (variant: ButtonVariant = "primary", extra?: string) => cx(btnBase, btnVariants[variant], extra);

export function Button({ variant = "primary", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const controlBase =
  "block w-full rounded-lg border bg-white px-3 min-h-11 text-base sm:text-sm text-slate-900 placeholder:text-slate-500 disabled:bg-slate-100";
const controlClass = (error?: string) => cx(controlBase, error ? "border-red-600" : "border-slate-400");

type FieldMeta = { id: string; error?: string; hint?: string };
const describedBy = ({ id, error, hint }: FieldMeta) => cx(error && `${id}-error`, hint && `${id}-hint`) || undefined;

export function Field({ id, label, hint, error, required, children, className }: FieldMeta & { label: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-900">
        {label}
        {required && <span aria-hidden="true" className="text-red-700"> *</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="mb-1 text-sm text-slate-600">{hint}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ id, error, hint, className, ...props }: ComponentProps<"input"> & FieldMeta) {
  return <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy({ id, error, hint })} className={cx(controlClass(error), className)} {...props} />;
}

export function Select({ id, error, hint, className, children, ...props }: ComponentProps<"select"> & FieldMeta) {
  return (
    <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy({ id, error, hint })} className={cx(controlClass(error), className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ id, error, hint, className, ...props }: ComponentProps<"textarea"> & FieldMeta) {
  return <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy({ id, error, hint })} className={cx(controlClass(error), "py-2 min-h-24", className)} {...props} />;
}

export function Checkbox({ label, hint, className, id, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; hint?: ReactNode; id: string }) {
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <input id={id} type="checkbox" aria-describedby={hint ? `${id}-hint` : undefined} className="mt-1 size-5 shrink-0 rounded border-slate-500 accent-brand-700" {...props} />
      <label htmlFor={id} className="text-sm text-slate-900">
        {label}
        {hint && <span id={`${id}-hint`} className="block text-slate-600">{hint}</span>}
      </label>
    </div>
  );
}

const alertTones = {
  info: "border-sky-300 bg-sky-50 text-sky-950",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
  warning: "border-amber-400 bg-amber-50 text-amber-950",
  error: "border-red-300 bg-red-50 text-red-950",
} as const;

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertTones; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", alertTones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-slate-100 text-slate-800 border-slate-300",
  green: "bg-emerald-50 text-emerald-900 border-emerald-300",
  teal: "bg-brand-50 text-brand-900 border-brand-200",
  amber: "bg-amber-50 text-amber-900 border-amber-300",
  red: "bg-red-50 text-red-900 border-red-300",
  blue: "bg-sky-50 text-sky-900 border-sky-300",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone], className)}>{children}</span>;
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="amber" className={className}>
      DEMO DATA · fictional
    </Badge>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...props} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" />
      {label}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-lg bg-slate-200", className)} />;
}
